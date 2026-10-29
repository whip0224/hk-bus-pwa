import { LocationPoint, MatchedRoute, RouteDefinition, RouteSearchResult, RouteStop } from '../types/transit';
import { getActiveRoutes, isUsingRealOpenData } from './openDataSync';

/**
 * Calculates Great-Circle distance between two points in meters using Haversine formula
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Estimated walking time in minutes based on distance
 */
export function estimateWalkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 75));
}

/**
 * Matches direct transit routes between origin and destination coordinates
 * Uses the complete real Hong Kong Open Data route & stop database
 */
export function findMatchingRoutes(
  origin: LocationPoint,
  dest: LocationPoint,
  radiusMeters: number,
  customRoutes?: RouteDefinition[]
): RouteSearchResult {
  const allRoutes = customRoutes || getActiveRoutes();

  // Quick bounding box pre-filter helper (approx 1 deg lat ~ 111km, 1 deg lng ~ 103km)
  const evaluateWithRadius = (
    r: number
  ): { matches: MatchedRoute[]; origStops: number; destStops: number } => {
    const latDelta = (r + 100) / 110000;
    const lngDelta = (r + 100) / 102000;

    // Deduplicate by routeNumber + direction + operator (preferring serviceType === '1' and closest stop)
    const dedupMap = new Map<string, MatchedRoute>();
    const origStopsSet = new Set<string>();
    const destStopsSet = new Set<string>();

    for (const route of allRoutes) {
      const candidateOrigins: Array<{ stop: RouteStop; distance: number }> = [];
      const candidateDests: Array<{ stop: RouteStop; distance: number }> = [];

      for (const s of route.stops) {
        // Fast bounding box check before Haversine
        if (
          Math.abs(s.lat - origin.lat) <= latDelta &&
          Math.abs(s.lng - origin.lng) <= lngDelta
        ) {
          const dOrig = calculateDistanceMeters(origin.lat, origin.lng, s.lat, s.lng);
          if (dOrig <= r) {
            candidateOrigins.push({ stop: s, distance: dOrig });
            origStopsSet.add(s.stopId);
          }
        }

        if (
          Math.abs(s.lat - dest.lat) <= latDelta &&
          Math.abs(s.lng - dest.lng) <= lngDelta
        ) {
          const dDest = calculateDistanceMeters(dest.lat, dest.lng, s.lat, s.lng);
          if (dDest <= r) {
            candidateDests.push({ stop: s, distance: dDest });
            destStopsSet.add(s.stopId);
          }
        }
      }

      if (candidateOrigins.length === 0 || candidateDests.length === 0) {
        continue;
      }

      // Find best valid forward station pair (originStop.seq < destStop.seq)
      let bestPair: {
        originStop: RouteStop;
        destStop: RouteStop;
        originDistanceMeters: number;
        destDistanceMeters: number;
        stopsCount: number;
      } | null = null;

      for (const orig of candidateOrigins) {
        for (const dst of candidateDests) {
          if (orig.stop.seq < dst.stop.seq) {
            // Ensure originStop and destStop are physically distinct stops
            if (orig.stop.stopId === dst.stop.stopId) continue;

            const stopsCount = dst.stop.seq - orig.stop.seq;
            // Avoid circular wrap-around routes taking > 35 stops for a short hop if a shorter pair exists
            const currentScore = orig.distance * 1.5 + dst.distance + stopsCount * 15;
            const bestScore = bestPair
              ? bestPair.originDistanceMeters * 1.5 +
                bestPair.destDistanceMeters +
                bestPair.stopsCount * 15
              : Infinity;

            if (currentScore < bestScore) {
              bestPair = {
                originStop: orig.stop,
                destStop: dst.stop,
                originDistanceMeters: orig.distance,
                destDistanceMeters: dst.distance,
                stopsCount,
              };
            }
          }
        }
      }

      if (bestPair) {
        // Key by operator (or GMB+destName to separate distinct GMB regional routes with same number) + routeNumber + direction
        const dedupKey =
          route.operator === 'GMB'
            ? `GMB_${route.routeNumber}_${route.direction}_${route.gtfsId || route.destName}`
            : `${route.operator}_${route.routeNumber}_${route.direction}`;

        const candidateMatch: MatchedRoute = {
          route,
          originStop: bestPair.originStop,
          destStop: bestPair.destStop,
          originDistanceMeters: bestPair.originDistanceMeters,
          destDistanceMeters: bestPair.destDistanceMeters,
          stopsCount: bestPair.stopsCount,
        };

        const existing = dedupMap.get(dedupKey);
        if (!existing) {
          dedupMap.set(dedupKey, candidateMatch);
        } else {
          // Prefer serviceType '1' (main full-day route) unless the other is significantly closer
          const existingIsMain = existing.route.serviceType === '1';
          const candidateIsMain = route.serviceType === '1';

          if (candidateIsMain && !existingIsMain) {
            dedupMap.set(dedupKey, candidateMatch);
          } else if (
            candidateIsMain === existingIsMain &&
            candidateMatch.originDistanceMeters < existing.originDistanceMeters
          ) {
            dedupMap.set(dedupKey, candidateMatch);
          }
        }
      }
    }

    return {
      matches: Array.from(dedupMap.values()),
      origStops: origStopsSet.size,
      destStops: destStopsSet.size,
    };
  };

  const initial = evaluateWithRadius(radiusMeters);
  let finalMatches = initial.matches;
  let appliedRadius = radiusMeters;
  let autoExpanded = false;

  // If fewer than 3 direct matching routes are found and radius < 800, automatically expand once
  if (finalMatches.length < 3 && radiusMeters < 800) {
    const nextRadius = radiusMeters === 350 ? 500 : 800;
    const expanded = evaluateWithRadius(nextRadius);
    if (expanded.matches.length > finalMatches.length) {
      finalMatches = expanded.matches;
      appliedRadius = nextRadius;
      autoExpanded = true;
    }
  }

  // Primary Sort: Closest departure stop (最近出發地優先)
  finalMatches.sort((a, b) => {
    if (a.originDistanceMeters !== b.originDistanceMeters) {
      return a.originDistanceMeters - b.originDistanceMeters;
    }
    return a.destDistanceMeters - b.destDistanceMeters;
  });

  return {
    routes: finalMatches,
    autoExpanded,
    appliedRadius,
    initialRadius: radiusMeters,
    originStopsCount: initial.origStops,
    destStopsCount: initial.destStops,
    dataSource: isUsingRealOpenData() ? 'real_opendata' : 'fallback',
  };
}
