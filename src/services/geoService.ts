import { LocationPoint } from '../types/transit';
import { HK_NOTABLE_LANDMARKS, LandmarkEntry } from '../data/hkTransitData';
import { getActiveRoutes } from './openDataSync';

/**
 * Exact conversion from HK1980 Grid (EPSG:2326 Easting/Northing) to WGS84 (EPSG:4326 Lat/Lng)
 * Incorporates official Lands Department False Origin (836694.05E, 819069.80N)
 * and HK80 -> WGS84 geodetic datum shift (-5.5" Lat, +8.8" Lng)
 */
export function hk80ToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const E0 = 836694.05;
  const N0 = 819069.80;
  const lat0 = 22.31213333333333;
  const lng0 = 114.1785555555556;

  const metersPerDegLat = 110735.0;
  const metersPerDegLng = 102985.0;

  const datumShiftLat = -5.5 / 3600.0; // -0.00152778
  const datumShiftLng = 8.8 / 3600.0;  // +0.00244444

  const lat = lat0 + (northing - N0) / metersPerDegLat + datumShiftLat;
  const lng = lng0 + (easting - E0) / metersPerDegLng + datumShiftLng;

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  };
}

/**
 * Normalizes Hong Kong Chinese/English address strings for resilient fuzzy comparison
 * Unifies common HK character variants (啟/啓, 邨/村, 臺/台, 滙/匯, 號/号, 樓/楼, 灣/湾)
 */
export function normalizeHKText(input: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/啓/g, '啟')
    .replace(/村/g, '邨')
    .replace(/台/g, '臺')
    .replace(/滙/g, '匯')
    .replace(/号/g, '號')
    .replace(/楼/g, '樓')
    .replace(/湾/g, '灣')
    .replace(/馆/g, '館')
    .replace(/广/g, '廣')
    .replace(/场/g, '場')
    .replace(/[\s\-_.,()（）【】「」\/\\]/g, '');
}

/**
 * Checks if all characters of `sub` appear in order within `target`
 */
function isOrderedSubsequence(sub: string, target: string): boolean {
  if (!sub || !target) return false;
  if (sub.length > target.length) return false;
  let i = 0;
  for (let j = 0; j < target.length && i < sub.length; j++) {
    if (sub[i] === target[j]) i++;
  }
  return i === sub.length;
}

/**
 * Calculates character-set and bigram similarity between two normalized strings (0 to 1)
 */
function calculateDiceAndCharOverlap(q: string, target: string): number {
  if (!q || !target) return 0;
  if (q === target) return 1;

  // Character overlap ratio (how many characters in query exist in target)
  const targetChars = new Set(target.split(''));
  let matchedChars = 0;
  for (const ch of q) {
    if (targetChars.has(ch)) matchedChars++;
  }
  const charCoverage = matchedChars / q.length;

  if (q.length === 1) {
    return target.includes(q) ? 0.85 : 0;
  }

  // Bigram Dice similarity
  const qBigrams = new Set<string>();
  for (let i = 0; i < q.length - 1; i++) {
    qBigrams.add(q.slice(i, i + 2));
  }
  const tBigrams = new Set<string>();
  for (let i = 0; i < target.length - 1; i++) {
    tBigrams.add(target.slice(i, i + 2));
  }

  let bigramHits = 0;
  for (const bg of qBigrams) {
    if (tBigrams.has(bg)) bigramHits++;
  }
  const bigramRatio = qBigrams.size > 0 ? bigramHits / qBigrams.size : 0;

  return charCoverage * 0.55 + bigramRatio * 0.45;
}

/**
 * Computes a fuzzy match score (0 to 100) between a user query and a candidate location
 */
export function calculateFuzzyMatchScore(
  rawQuery: string,
  name: string,
  address = '',
  aliases: string[] = []
): number {
  const q = normalizeHKText(rawQuery);
  if (!q) return 0;

  const normName = normalizeHKText(name);
  const normAddr = normalizeHKText(address);
  const normAliases = aliases.map(normalizeHKText);
  const combinedText = `${normName}${normAddr}${normAliases.join('')}`;

  // 1. Exact match on name or alias
  if (normName === q || normAliases.some((a) => a === q)) {
    return 100;
  }

  // 2. Name starts with query (Prefix match)
  if (normName.startsWith(q) || normAliases.some((a) => a.startsWith(q))) {
    return 95;
  }

  // 3. Name or alias contains full query substring, or query contains full candidate name
  if (
    normName.includes(q) ||
    normAliases.some((a) => a.includes(q)) ||
    (normName.length >= 2 && q.includes(normName)) ||
    normAliases.some((a) => a.length >= 2 && q.includes(a))
  ) {
    return 90;
  }

  // 4. Address contains full query substring
  if (normAddr.includes(q)) {
    return 84;
  }

  // 5. Ordered character subsequence (e.g. "觀塘官小" -> "觀塘官立小學", "北角嘉華" -> "北角堡壘街嘉華洋樓")
  if (
    q.length >= 2 &&
    (isOrderedSubsequence(q, normName) ||
      isOrderedSubsequence(q, combinedText) ||
      normAliases.some((a) => isOrderedSubsequence(q, a)))
  ) {
    return 78;
  }

  // 6. Fuzzy character & bigram overlap
  const nameOverlap = calculateDiceAndCharOverlap(q, normName);
  const fullOverlap = calculateDiceAndCharOverlap(q, combinedText);
  const bestOverlap = Math.max(nameOverlap, fullOverlap);

  if (bestOverlap >= 0.5) {
    return Math.round(45 + bestOverlap * 32);
  }

  return 0;
}

/**
 * Extracts core search tokens if the user entered a complex compound address
 * e.g. "香港北角堡壘街29號嘉華洋樓" -> ["嘉華洋樓", "堡壘街29號", "堡壘街"]
 */
function extractFallbackKeywords(query: string): string[] {
  const cleaned = query
    .replace(/^(香港島?|九龍|新界|東區|中西區|灣仔區?|觀塘區?|北角|炮台山|銅鑼灣|旺角|尖沙咀)+/g, '')
    .trim();

  const candidates = new Set<string>();
  if (cleaned && cleaned !== query && cleaned.length >= 2) {
    candidates.add(cleaned);
  }

  // Extract building name after street number (e.g. "堡壘街29-31號嘉華洋樓" -> "嘉華洋樓", "堡壘街")
  const streetAndBldg = query.match(/([^\s0-9號]+(?:街|道|路|里|坊|徑|臺))(?:\s*[0-9\-A-Za-z]+號?)?\s*(.+)?/);
  if (streetAndBldg) {
    if (streetAndBldg[2] && streetAndBldg[2].trim().length >= 2) {
      candidates.add(streetAndBldg[2].trim());
    }
    if (streetAndBldg[1] && streetAndBldg[1].trim().length >= 2) {
      candidates.add(streetAndBldg[1].trim());
    }
  }

  return Array.from(candidates);
}

/**
 * 1. Queries OGCIO Address Lookup Service (ALS) directly from browser
 * Supports both JSON and XML responses
 */
async function queryOGCIOAddressLookup(query: string): Promise<LocationPoint[]> {
  const url = `https://www.als.ogcio.gov.hk/lookup?q=${encodeURIComponent(query)}&n=10`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) return [];

  const text = await res.text();
  if (!text) return [];

  const results: LocationPoint[] = [];

  try {
    const data = JSON.parse(text);
    const rawSuggested =
      data?.SuggestedAddress ||
      data?.AddressLookupResult?.SuggestedAddress ||
      data?.AddressLookupResult;

    const suggested = Array.isArray(rawSuggested)
      ? rawSuggested
      : rawSuggested && typeof rawSuggested === 'object' && rawSuggested.Address
      ? [rawSuggested]
      : [];

    for (const entry of suggested) {
      const addressObj = entry?.Address;
      const addr = addressObj?.PremisesAddress || addressObj;
      if (!addr) continue;

      const geoRaw = addr.GeospatialInformation || addressObj?.GeospatialInformation;
      const geo = Array.isArray(geoRaw) ? geoRaw[0] : geoRaw;
      if (!geo) continue;

      let lat = geo.Latitude !== undefined ? parseFloat(String(geo.Latitude)) : NaN;
      let lng = geo.Longitude !== undefined ? parseFloat(String(geo.Longitude)) : NaN;

      if ((isNaN(lat) || isNaN(lng)) && geo.Easting && geo.Northing) {
        const converted = hk80ToWgs84(
          parseFloat(String(geo.Easting)),
          parseFloat(String(geo.Northing))
        );
        lat = converted.lat;
        lng = converted.lng;
      }

      if (isNaN(lat) || isNaN(lng)) continue;

      const chi = addr.ChiPremisesAddress || {};
      const eng = addr.EngPremisesAddress || {};

      const buildingName = (chi.BuildingName || eng.BuildingName || '').trim();
      const estateName = (chi.ChiEstate?.EstateName || eng.EngEstate?.EstateName || '').trim();
      const streetName = (chi.ChiStreet?.StreetName || eng.EngStreet?.StreetName || '').trim();
      const streetNoFrom = chi.ChiStreet?.BuildingNoFrom || eng.EngStreet?.BuildingNoFrom || '';
      const streetNoTo = chi.ChiStreet?.BuildingNoTo || eng.EngStreet?.BuildingNoTo || '';
      const streetNo =
        streetNoFrom && streetNoTo && streetNoFrom !== streetNoTo
          ? `${streetNoFrom}-${streetNoTo}號`
          : streetNoFrom
          ? `${streetNoFrom}號`
          : '';
      const streetFull = streetName ? `${streetName}${streetNo}` : '';
      const district = (chi.ChiDistrict?.DcDistrict || eng.EngDistrict?.DcDistrict || '').trim();

      const primaryName = buildingName
        ? streetFull
          ? `${buildingName} (${streetFull})`
          : buildingName
        : estateName || streetFull || query;

      const fullAddress = [district, estateName, streetFull, buildingName]
        .filter(Boolean)
        .join(' ');

      results.push({
        name: primaryName,
        address: fullAddress || primaryName,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        source: 'als',
      });
    }
  } catch {
    // Fallback XML extraction if ALS ever returns XML
    const latMatch = text.match(/<Latitude>([\d.]+)<\/Latitude>/);
    const lngMatch = text.match(/<Longitude>([\d.]+)<\/Longitude>/);
    const bldgMatch = text.match(/<BuildingName>([^<]+)<\/BuildingName>/);
    const streetMatch = text.match(/<StreetName>([^<]+)<\/StreetName>/);
    if (latMatch && lngMatch) {
      const lat = parseFloat(latMatch[1]);
      const lng = parseFloat(lngMatch[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        const name = bldgMatch?.[1]?.trim() || streetMatch?.[1]?.trim() || query;
        results.push({
          name,
          address: [streetMatch?.[1]?.trim(), bldgMatch?.[1]?.trim()].filter(Boolean).join(' ') || name,
          lat,
          lng,
          source: 'als',
        });
      }
    }
  }

  return results;
}

/**
 * 2. Queries Lands Department GeoData LocationSearch API (geodata.gov.hk & map.gov.hk)
 */
async function queryLandsDeptGeoSearch(query: string): Promise<LocationPoint[]> {
  const endpoints = [
    `https://geodata.gov.hk/gs/api/v1.0.0/locationSearch?q=${encodeURIComponent(query)}`,
    `https://www.map.gov.hk/gs/api/v1.0.0/locationSearch?q=${encodeURIComponent(query)}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const results: LocationPoint[] = [];
      for (const item of data.slice(0, 10)) {
        let lat: number | null = null;
        let lng: number | null = null;

        if (item.wgsLat && item.wgsLong) {
          lat = parseFloat(item.wgsLat);
          lng = parseFloat(item.wgsLong);
        } else if (item.x && item.y) {
          const converted = hk80ToWgs84(parseFloat(item.x), parseFloat(item.y));
          lat = converted.lat;
          lng = converted.lng;
        }

        const name = (item.nameZH || item.nameEN || query).trim();
        const address = (item.addressZH || item.districtZH || item.nameEN || '').trim();

        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
          results.push({
            name,
            address: address || name,
            lat,
            lng,
            source: 'ogcio',
          });
        }
      }
      if (results.length > 0) return results;
    } catch {
      // try next endpoint
    }
  }
  return [];
}

/**
 * 3. Queries OpenStreetMap Nominatim HK for street names, buildings, and estates
 */
async function queryNominatimHK(query: string): Promise<LocationPoint[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=hk&accept-language=zh-HK,zh&q=${encodeURIComponent(
    query
  )}&limit=6`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return [];

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  const results: LocationPoint[] = [];
  for (const item of data) {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (isNaN(lat) || isNaN(lng)) continue;

    const rawParts = String(item.display_name || query)
      .split(',')
      .map((s) => s.trim());
    const primaryName = item.name || rawParts[0] || query;
    const address = rawParts.slice(0, 4).join(', ');

    results.push({
      name: primaryName,
      address: address || primaryName,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      source: 'ogcio',
    });
  }
  return results;
}

/**
 * 4. Fuzzy searches local landmarks & all ~8,500+ real HK bus/minibus stops
 */
function fuzzySearchLocalAndStops(query: string): Array<{ point: LocationPoint; score: number }> {
  const scored: Array<{ point: LocationPoint; score: number }> = [];

  // A. Check curated HK landmarks & streets with aliases
  for (const lm of HK_NOTABLE_LANDMARKS as LandmarkEntry[]) {
    const score = calculateFuzzyMatchScore(query, lm.name, lm.address || '', lm.aliases || []);
    if (score >= 55) {
      scored.push({
        point: {
          name: lm.name,
          address: lm.address,
          lat: lm.lat,
          lng: lm.lng,
          source: lm.source || 'preset',
        },
        score,
      });
    }
  }

  // B. Check all real bus & minibus stops in our synced HK Open Data database
  const routes = getActiveRoutes();
  const seenStops = new Set<string>();

  for (const r of routes) {
    for (const s of r.stops) {
      const cleanName = s.nameTc.replace(/\s*\([A-Z0-9]+\)\s*/g, '').trim();
      if (!cleanName || seenStops.has(cleanName)) continue;

      const score = calculateFuzzyMatchScore(query, cleanName, s.nameTc);
      if (score >= 65) {
        seenStops.add(cleanName);
        scored.push({
          point: {
            name: cleanName,
            address: `巴士/小巴車站 (${s.nameTc})`,
            lat: s.lat,
            lng: s.lng,
            source: 'preset',
          },
          score: score - 2, // Slightly prioritize exact building addresses over stop poles
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10);
}

/**
 * Searches Hong Kong locations with Auto-Suggestion & Multi-Layer Fuzzy Matching
 * Guarantees returning the closest accurate address coordinates for inputs like 「堡壘街」 or 「嘉華洋樓」
 */
export async function searchLocations(query: string): Promise<LocationPoint[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const candidatePool: Array<{ point: LocationPoint; score: number }> = [];

  const addCandidate = (pt: LocationPoint, bonusScore = 0) => {
    if (!pt || isNaN(pt.lat) || isNaN(pt.lng) || pt.lat === 0 || pt.lng === 0) return;

    const baseScore = calculateFuzzyMatchScore(trimmed, pt.name, pt.address || '');
    const finalScore = Math.max(baseScore, 60) + bonusScore;

    const existingIdx = candidatePool.findIndex(
      (c) =>
        (normalizeHKText(c.point.name) === normalizeHKText(pt.name) &&
          Math.abs(c.point.lat - pt.lat) < 0.001 &&
          Math.abs(c.point.lng - pt.lng) < 0.001) ||
        (Math.abs(c.point.lat - pt.lat) < 0.0002 && Math.abs(c.point.lng - pt.lng) < 0.0002)
    );

    if (existingIdx >= 0) {
      if (finalScore > candidatePool[existingIdx].score) {
        candidatePool[existingIdx] = { point: pt, score: finalScore };
      }
    } else {
      candidatePool.push({ point: pt, score: finalScore });
    }
  };

  // 1. Instant local landmark + transit stop fuzzy matching
  const localFuzzy = fuzzySearchLocalAndStops(trimmed);
  for (const item of localFuzzy) {
    addCandidate(item.point, item.score >= 90 ? 15 : 5);
  }

  // 2. Parallel query across OGCIO ALS, Lands Dept GeoData, and OSM Nominatim HK
  const [alsRes, geoRes, osmRes] = await Promise.allSettled([
    queryOGCIOAddressLookup(trimmed),
    queryLandsDeptGeoSearch(trimmed),
    queryNominatimHK(trimmed),
  ]);

  if (alsRes.status === 'fulfilled') {
    alsRes.value.forEach((pt, idx) => addCandidate(pt, 12 - idx));
  }
  if (geoRes.status === 'fulfilled') {
    geoRes.value.forEach((pt, idx) => addCandidate(pt, 10 - idx));
  }
  if (osmRes.status === 'fulfilled') {
    osmRes.value.forEach((pt, idx) => addCandidate(pt, 6 - idx));
  }

  // 3. If compound query yielded no results yet, decompose into fallback keywords and retry!
  if (candidatePool.length === 0) {
    const fallbackKeywords = extractFallbackKeywords(trimmed);
    for (const kw of fallbackKeywords) {
      const subFuzzy = fuzzySearchLocalAndStops(kw);
      for (const item of subFuzzy) {
        addCandidate(item.point, 5);
      }
      if (candidatePool.length > 0) break;

      const [subAls, subGeo] = await Promise.allSettled([
        queryOGCIOAddressLookup(kw),
        queryLandsDeptGeoSearch(kw),
      ]);
      if (subAls.status === 'fulfilled') {
        subAls.value.forEach((pt) => addCandidate(pt, 5));
      }
      if (subGeo.status === 'fulfilled') {
        subGeo.value.forEach((pt) => addCandidate(pt, 5));
      }
      if (candidatePool.length > 0) break;
    }
  }

  // Sort by fuzzy relevance score descending
  candidatePool.sort((a, b) => b.score - a.score);

  return candidatePool.slice(0, 12).map((c) => c.point);
}

/**
 * Resolves a user input string or LocationPoint into a guaranteed valid coordinate LocationPoint
 */
export async function resolveBestLocation(
  input: LocationPoint | string | null
): Promise<LocationPoint | null> {
  if (!input) return null;

  if (typeof input === 'object' && input.lat && input.lng && input.lat !== 0 && input.lng !== 0) {
    return input;
  }

  const query = typeof input === 'string' ? input.trim() : input.name.trim();
  if (!query) return null;

  const matches = await searchLocations(query);
  if (matches.length > 0) {
    return matches[0];
  }

  return null;
}

/**
 * Retrieves user's current GPS location via HTML5 Geolocation
 */
export function getCurrentCoordinates(): Promise<LocationPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('您的裝置不支援 GPS 定位'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          name: '目前位置 (GPS)',
          address: `緯度: ${pos.coords.latitude.toFixed(5)}, 經度: ${pos.coords.longitude.toFixed(5)}`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: 'gps',
        });
      },
      (err) => {
        reject(new Error(err.message || '無法取得目前位置，請確認已開啟定位權限'));
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000,
      }
    );
  });
}
