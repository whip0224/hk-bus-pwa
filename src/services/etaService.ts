import { MatchedRoute, RouteETA } from '../types/transit';

/**
 * Parses minutes remaining from an ISO timestamp string
 * Returns null if timestamp is invalid or already more than 2 minutes in the past
 */
function parseMinutesDiff(isoString: string): number | null {
  if (!isoString) return null;
  const target = new Date(isoString).getTime();
  if (isNaN(target)) return null;
  const now = Date.now();
  const diffMs = target - now;
  // Ignore buses that already departed more than 90 seconds ago
  if (diffMs < -90000) return null;
  return Math.max(0, Math.round(diffMs / 60000));
}

/**
 * Formats time string HH:mm in Hong Kong Time
 */
function formatHHMM(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Fetches 100% Real-Time ETA directly from Official HK Government Open Data APIs in browser
 * - KMB: https://data.etabus.gov.hk/v1/transport/kmb/eta/{stop_id}/{route}/{service_type}
 * - CTB: https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/{stop_id}/{route}
 * - GMB: https://data.etagmb.gov.hk/eta/route-stop/{route_id}/{route_seq}/{stop_seq}
 * - NLB: https://rt.data.gov.hk/v2/transport/nlb/stop.php?action=estimatedArrivals
 */
export async function fetchRouteETAs(matched: MatchedRoute): Promise<RouteETA[]> {
  const { route, originStop } = matched;
  const validEtas: RouteETA[] = [];
  let statusRemark = '';

  try {
    if (route.operator === 'KMB') {
      // Query Official KMB ETA API directly from browser (bypass iOS HTTP cache)
      const kmbUrl = `https://data.etabus.gov.hk/v1/transport/kmb/eta/${originStop.stopId}/${route.routeNumber}/${route.serviceType || '1'}`;

      const fetchPromises: Promise<void>[] = [
        fetch(kmbUrl, { cache: 'no-store', signal: AbortSignal.timeout(6000) })
          .then((r) => (r.ok ? r.json() : { data: [] }))
          .then(async (json) => {
            let items: any[] = Array.isArray(json.data) ? json.data : [];

            // If specific serviceType returned no active timestamps, fallback to stop-eta for this stop
            const hasValidTimestamp = items.some((it) => Boolean(it.eta));
            if (!hasValidTimestamp) {
              try {
                const stopEtaRes = await fetch(
                  `https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${originStop.stopId}`,
                  { cache: 'no-store', signal: AbortSignal.timeout(5000) }
                );
                if (stopEtaRes.ok) {
                  const stopEtaJson = await stopEtaRes.json();
                  if (Array.isArray(stopEtaJson.data)) {
                    const matchedByRoute = stopEtaJson.data.filter(
                      (it: any) =>
                        String(it.route).toUpperCase() === route.routeNumber.toUpperCase() &&
                        Boolean(it.eta)
                    );
                    if (matchedByRoute.length > 0) {
                      items = matchedByRoute;
                    }
                  }
                }
              } catch {
                // ignore fallback error
              }
            }

            // Filter by direction if matching entries exist; otherwise accept all entries at this physical roadside stop
            const dirFiltered = items.filter(
              (it) => !it.dir || it.dir === route.direction
            );
            const candidates = dirFiltered.some((it) => Boolean(it.eta)) ? dirFiltered : items;

            for (const item of candidates) {
              if (item.eta) {
                const mins = parseMinutesDiff(item.eta);
                if (mins !== null) {
                  validEtas.push({
                    etaMinutes: mins,
                    etaTimeStr: formatHHMM(item.eta),
                    remark:
                      item.rmk_tc ||
                      (route.jointOperator ? '九巴班次' : mins <= 1 ? '正在到站' : '實時GPS'),
                    isRealTime: true,
                    timestamp: item.eta,
                    operatorLabel: '九巴',
                  });
                }
              } else if (item.rmk_tc && !statusRemark) {
                statusRemark = item.rmk_tc;
              }
            }
          })
          .catch(() => {}),
      ];

      // Joint KMB+CTB cross-harbour routes (e.g. 619, 101, 111, 601, 671):
      // Note: KMB and CTB often use OPPOSITE bound codes ('O' vs 'I') for the exact same direction!
      // Since originStop.ctbStopId is already a physical roadside pole for this direction,
      // do not discard CTB arrivals when item.dir !== route.direction.
      if (route.jointOperator === 'CTB' && originStop.ctbStopId) {
        const ctbUrl = `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${originStop.ctbStopId}/${route.routeNumber}`;
        fetchPromises.push(
          fetch(ctbUrl, { cache: 'no-store', signal: AbortSignal.timeout(6000) })
            .then((r) => (r.ok ? r.json() : { data: [] }))
            .then((json) => {
              if (!Array.isArray(json.data)) return;
              const items = json.data;
              // If ctbDirection is known and matches entries with eta, prefer it; otherwise accept all at this stop pole
              const dirFiltered = route.ctbDirection
                ? items.filter((it: any) => !it.dir || it.dir === route.ctbDirection)
                : items;
              const candidates = dirFiltered.some((it: any) => Boolean(it.eta))
                ? dirFiltered
                : items;

              for (const item of candidates) {
                if (item.eta) {
                  const mins = parseMinutesDiff(item.eta);
                  if (mins !== null) {
                    validEtas.push({
                      etaMinutes: mins,
                      etaTimeStr: formatHHMM(item.eta),
                      remark: item.rmk_tc ? `城巴 · ${item.rmk_tc}` : '城巴班次',
                      isRealTime: true,
                      timestamp: item.eta,
                      operatorLabel: '城巴',
                    });
                  }
                }
              }
            })
            .catch(() => {})
        );
      }

      await Promise.all(fetchPromises);
    } else if (route.operator === 'CTB') {
      const ctbUrl = `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${originStop.stopId}/${route.routeNumber}`;
      const res = await fetch(ctbUrl, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data)) {
          const items = json.data;
          const dirFiltered = items.filter((it: any) => !it.dir || it.dir === route.direction);
          const candidates = dirFiltered.some((it: any) => Boolean(it.eta)) ? dirFiltered : items;

          for (const item of candidates) {
            if (item.eta) {
              const mins = parseMinutesDiff(item.eta);
              if (mins !== null) {
                validEtas.push({
                  etaMinutes: mins,
                  etaTimeStr: formatHHMM(item.eta),
                  remark: item.rmk_tc || (mins <= 1 ? '正在到站' : '城巴實時'),
                  isRealTime: true,
                  timestamp: item.eta,
                  operatorLabel: '城巴',
                });
              }
            } else if (item.rmk_tc && !statusRemark) {
              statusRemark = item.rmk_tc;
            }
          }
        }
      }
    } else if (route.operator === 'GMB') {
      if (route.gtfsId) {
        const routeSeq = route.direction === 'I' ? 2 : 1;
        const gmbUrl = `https://data.etagmb.gov.hk/eta/route-stop/${route.gtfsId}/${routeSeq}/${originStop.seq}`;
        const res = await fetch(gmbUrl, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const json = await res.json();
          const etaArray = Array.isArray(json.data)
            ? json.data.flatMap((d: any) => d.eta || [])
            : json.data?.eta || [];

          for (const item of etaArray) {
            if (item.timestamp) {
              const mins = parseMinutesDiff(item.timestamp);
              if (mins !== null) {
                validEtas.push({
                  etaMinutes: mins,
                  etaTimeStr: formatHHMM(item.timestamp),
                  remark: item.remarks_tc || '小巴實時定位',
                  isRealTime: true,
                  timestamp: item.timestamp,
                  operatorLabel: '專線小巴',
                });
              }
            }
          }
        }
      }
    } else if (route.operator === 'NLB' && route.nlbId) {
      const nlbUrl = `https://rt.data.gov.hk/v2/transport/nlb/stop.php?action=estimatedArrivals&routeId=${route.nlbId}&stopId=${originStop.stopId}&language=zh`;
      const res = await fetch(nlbUrl, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.estimatedArrivals)) {
          for (const item of json.estimatedArrivals) {
            if (item.estimatedArrivalTime) {
              const iso = item.estimatedArrivalTime.replace(' ', 'T') + '+08:00';
              const mins = parseMinutesDiff(iso);
              if (mins !== null) {
                validEtas.push({
                  etaMinutes: mins,
                  etaTimeStr: formatHHMM(iso),
                  remark: '嶼巴實時',
                  isRealTime: true,
                  timestamp: iso,
                  operatorLabel: '嶼巴',
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Live ETA fetch error for ${route.routeNumber}:`, err);
  }

  // Sort upcoming arrivals chronologically and deduplicate identical timestamps
  validEtas.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const uniqueEtas: RouteETA[] = [];
  for (const e of validEtas) {
    if (
      !uniqueEtas.some(
        (u) =>
          Math.abs(new Date(u.timestamp).getTime() - new Date(e.timestamp).getTime()) < 30000 &&
          u.operatorLabel === e.operatorLabel
      )
    ) {
      uniqueEtas.push(e);
    }
  }

  return uniqueEtas.slice(0, 3);
}

/**
 * Sorts matched routes with 100% real ETA priority:
 * 1. Routes with real upcoming arrivals (etas.length > 0) ALWAYS rank above routes with no active buses
 * 2. Among active routes:
 *    - Primary: Nearest departure stop (grouped within 120m walking proximity)
 *    - Secondary: Fastest arrival ETA (最快到站時間)
 * Splits into Top 5 fastest active routes and remaining expandable routes
 */
export function partitionTop5AndRemaining(routes: MatchedRoute[]): {
  top5: MatchedRoute[];
  remaining: MatchedRoute[];
} {
  const sorted = [...routes].sort((a, b) => {
    const hasEtaA = Boolean(a.etas && a.etas.length > 0 && a.etas[0].etaMinutes !== null);
    const hasEtaB = Boolean(b.etas && b.etas.length > 0 && b.etas[0].etaMinutes !== null);

    // 1. Always place routes with active real-time departures first
    if (hasEtaA !== hasEtaB) {
      return hasEtaA ? -1 : 1;
    }

    // 2. If both have active ETAs, prioritize nearest boarding stop (within 150m band) then fastest ETA
    if (hasEtaA && hasEtaB) {
      const distDiff = a.originDistanceMeters - b.originDistanceMeters;
      if (Math.abs(distDiff) > 150) {
        return distDiff;
      }
      const etaA = a.etas?.[0]?.etaMinutes ?? 999;
      const etaB = b.etas?.[0]?.etaMinutes ?? 999;
      if (etaA !== etaB) {
        return etaA - etaB;
      }
      return distDiff;
    }

    // 3. Among routes without active ETAs yet, keep unfetched (lazy-load on scroll) routes
    // sorted strictly by boarding stop distance so scrolling loads closer stops first
    const unfetchedA = a.etas === undefined;
    const unfetchedB = b.etas === undefined;
    if (unfetchedA !== unfetchedB) {
      return unfetchedA ? -1 : 1;
    }

    return a.originDistanceMeters - b.originDistanceMeters;
  });

  return {
    top5: sorted.slice(0, 5),
    remaining: sorted.slice(5),
  };
}

