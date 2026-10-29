import { RouteDefinition, RouteStop, TransitOperator } from '../types/transit';
import { PRELOADED_ROUTES } from '../data/hkTransitData';
import { updateOfflineDbInfo } from './storageService';

const IDB_NAME = 'hk_transit_real_db_v4';
const IDB_STORE = 'dataset';
const IDB_KEY = 'all_routes';

let inMemoryRoutes: RouteDefinition[] | null = null;
let syncPromise: Promise<RouteDefinition[]> | null = null;

/**
 * Opens IndexedDB for storing the full HK transit route & stop database on the phone
 */
function openTransitIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Reads cached real routes from IndexedDB
 */
export async function getCachedRealRoutes(): Promise<RouteDefinition[] | null> {
  if (inMemoryRoutes && inMemoryRoutes.length > 100) {
    return inMemoryRoutes;
  }
  try {
    const db = await openTransitIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        if (Array.isArray(req.result) && req.result.length > 50) {
          inMemoryRoutes = req.result;
          resolve(req.result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Saves real routes to IndexedDB
 */
async function saveRealRoutesToIDB(routes: RouteDefinition[]): Promise<void> {
  inMemoryRoutes = routes;
  try {
    const db = await openTransitIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(routes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IndexedDB save warning:', e);
  }
}

/**
 * Returns currently active route list (Real Open Data if loaded, otherwise fallback)
 */
export function getActiveRoutes(): RouteDefinition[] {
  if (inMemoryRoutes && inMemoryRoutes.length > 50) {
    return inMemoryRoutes;
  }
  return PRELOADED_ROUTES;
}

export function isUsingRealOpenData(): boolean {
  return Boolean(inMemoryRoutes && inMemoryRoutes.length > 50);
}

/**
 * Parses the unified HK Open Data routeFareList.min.json (KMB + CTB + GMB + NLB + MTRB)
 */
function parseUnifiedRouteFareList(data: any): { routes: RouteDefinition[]; totalStops: number } {
  const stopList = data?.stopList || {};
  const routeList = data?.routeList || {};
  const routes: RouteDefinition[] = [];

  for (const [routeKey, entry] of Object.entries<any>(routeList)) {
    if (!entry || !entry.route || !entry.stops) continue;

    const co: string[] = Array.isArray(entry.co) ? entry.co : [];
    const stopsMap = entry.stops;

    let operator: TransitOperator | null = null;
    let jointOperator: TransitOperator | undefined = undefined;
    let primaryStopIds: string[] = [];
    let ctbPartnerStopIds: string[] | undefined = undefined;
    let rawBound: any = 'O';
    let rawCtbBound: any = undefined;

    if (co.includes('kmb') && Array.isArray(stopsMap.kmb) && stopsMap.kmb.length >= 2) {
      operator = 'KMB';
      primaryStopIds = stopsMap.kmb;
      rawBound = typeof entry.bound === 'object' ? entry.bound.kmb : entry.bound;
      if (co.includes('ctb') && Array.isArray(stopsMap.ctb) && stopsMap.ctb.length > 0) {
        jointOperator = 'CTB';
        ctbPartnerStopIds = stopsMap.ctb;
        rawCtbBound = typeof entry.bound === 'object' ? entry.bound.ctb : undefined;
      }
    } else if (co.includes('ctb') && Array.isArray(stopsMap.ctb) && stopsMap.ctb.length >= 2) {
      operator = 'CTB';
      primaryStopIds = stopsMap.ctb;
      rawBound = typeof entry.bound === 'object' ? entry.bound.ctb : entry.bound;
    } else if (co.includes('gmb') && Array.isArray(stopsMap.gmb) && stopsMap.gmb.length >= 2) {
      operator = 'GMB';
      primaryStopIds = stopsMap.gmb;
      rawBound = typeof entry.bound === 'object' ? entry.bound.gmb : entry.bound;
    } else if (co.includes('nlb') && Array.isArray(stopsMap.nlb) && stopsMap.nlb.length >= 2) {
      operator = 'NLB';
      primaryStopIds = stopsMap.nlb;
      rawBound = typeof entry.bound === 'object' ? entry.bound.nlb : entry.bound;
    } else if (co.includes('lrtfeeder') && Array.isArray(stopsMap.lrtfeeder) && stopsMap.lrtfeeder.length >= 2) {
      operator = 'MTRB';
      primaryStopIds = stopsMap.lrtfeeder;
      rawBound = typeof entry.bound === 'object' ? entry.bound.lrtfeeder : entry.bound;
    }

    if (!operator || primaryStopIds.length < 2) continue;

    const direction: 'O' | 'I' =
      rawBound === 'I' || rawBound === 'inbound' || String(rawBound).startsWith('I') ? 'I' : 'O';

    const ctbDirection: 'O' | 'I' | undefined = rawCtbBound
      ? rawCtbBound === 'I' || rawCtbBound === 'inbound' || String(rawCtbBound).startsWith('I')
        ? 'I'
        : 'O'
      : undefined;

    const routeStops: RouteStop[] = [];
    for (let i = 0; i < primaryStopIds.length; i++) {
      const sid = primaryStopIds[i];
      const sInfo = stopList[sid];
      if (!sInfo || !sInfo.location) continue;
      const lat = Number(sInfo.location.lat);
      const lng = Number(sInfo.location.lng);
      if (isNaN(lat) || isNaN(lng)) continue;

      const fareStr = Array.isArray(entry.fares) ? entry.fares[i] : undefined;
      const fare = fareStr ? parseFloat(fareStr) : undefined;

      // Match partner Citybus stop ID by nearest physical coordinates (in case KMB/CTB stop counts differ by 1)
      let matchedCtbStopId = ctbPartnerStopIds?.[i];
      if (ctbPartnerStopIds && ctbPartnerStopIds.length > 0) {
        let bestDistSq = Infinity;
        for (const cid of ctbPartnerStopIds) {
          const cInfo = stopList[cid];
          if (cInfo?.location) {
            const dLat = Number(cInfo.location.lat) - lat;
            const dLng = Number(cInfo.location.lng) - lng;
            const distSq = dLat * dLat + dLng * dLng;
            if (distSq < bestDistSq) {
              bestDistSq = distSq;
              matchedCtbStopId = cid;
            }
          }
        }
      }

      routeStops.push({
        stopId: sid,
        seq: i + 1,
        nameTc: sInfo.name?.zh || sInfo.name?.tc || sInfo.name?.en || sid,
        lat,
        lng,
        fare: isNaN(fare as number) ? undefined : fare,
        ctbStopId: matchedCtbStopId,
      });
    }

    if (routeStops.length < 2) continue;

    routes.push({
      id: `${operator}_${entry.route}_${direction}_${entry.serviceType || '1'}_${routeKey}`,
      routeNumber: String(entry.route).trim(),
      operator,
      jointOperator,
      serviceType: String(entry.serviceType || '1'),
      direction,
      ctbDirection,
      originName: entry.orig?.zh || entry.orig?.tc || entry.orig?.en || routeStops[0].nameTc,
      destName: entry.dest?.zh || entry.dest?.tc || entry.dest?.en || routeStops[routeStops.length - 1].nameTc,
      stops: routeStops,
      gtfsId: entry.gtfsId ? String(entry.gtfsId) : undefined,
      nlbId: entry.nlbId ? String(entry.nlbId) : undefined,
    });
  }

  return {
    routes,
    totalStops: Object.keys(stopList).length,
  };
}

/**
 * Fallback direct fetcher from Official Transport Department KMB Open Data API (data.etabus.gov.hk)
 */
async function fetchOfficialKMBDirect(onProgress?: (msg: string) => void): Promise<{
  routes: RouteDefinition[];
  totalStops: number;
}> {
  onProgress?.('正在從運輸署九巴開放數據 (data.etabus.gov.hk) 下載真實車站與路線...');

  const [stopsRes, routesRes, routeStopsRes] = await Promise.all([
    fetch('https://data.etabus.gov.hk/v1/transport/kmb/stop'),
    fetch('https://data.etabus.gov.hk/v1/transport/kmb/route/'),
    fetch('https://data.etabus.gov.hk/v1/transport/kmb/route-stop'),
  ]);

  if (!stopsRes.ok || !routesRes.ok || !routeStopsRes.ok) {
    throw new Error('KMB Open Data API request failed');
  }

  const [stopsJson, routesJson, routeStopsJson] = await Promise.all([
    stopsRes.json(),
    routesRes.json(),
    routeStopsRes.json(),
  ]);

  const stopMap = new Map<string, { nameTc: string; lat: number; lng: number }>();
  for (const s of stopsJson.data || []) {
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.long);
    if (!isNaN(lat) && !isNaN(lng)) {
      stopMap.set(s.stop, {
        nameTc: s.name_tc || s.name_en,
        lat,
        lng,
      });
    }
  }

  // Group route-stops by key `${route}_${bound}_${service_type}`
  const rsGroup = new Map<string, Array<{ seq: number; stopId: string }>>();
  for (const rs of routeStopsJson.data || []) {
    const key = `${rs.route}_${rs.bound}_${rs.service_type}`;
    let arr = rsGroup.get(key);
    if (!arr) {
      arr = [];
      rsGroup.set(key, arr);
    }
    arr.push({
      seq: parseInt(rs.seq, 10),
      stopId: rs.stop,
    });
  }

  const compiledRoutes: RouteDefinition[] = [];
  for (const r of routesJson.data || []) {
    const key = `${r.route}_${r.bound}_${r.service_type}`;
    const rawStops = rsGroup.get(key);
    if (!rawStops || rawStops.length < 2) continue;

    rawStops.sort((a, b) => a.seq - b.seq);
    const stops: RouteStop[] = [];
    for (const item of rawStops) {
      const info = stopMap.get(item.stopId);
      if (!info) continue;
      stops.push({
        stopId: item.stopId,
        seq: item.seq,
        nameTc: info.nameTc,
        lat: info.lat,
        lng: info.lng,
      });
    }

    if (stops.length < 2) continue;

    compiledRoutes.push({
      id: `KMB_${key}`,
      routeNumber: r.route,
      operator: 'KMB',
      serviceType: String(r.service_type || '1'),
      direction: r.bound === 'I' ? 'I' : 'O',
      originName: r.orig_tc || stops[0].nameTc,
      destName: r.dest_tc || stops[stops.length - 1].nameTc,
      stops,
    });
  }

  return {
    routes: compiledRoutes,
    totalStops: stopMap.size,
  };
}

/**
 * Synchronizes the complete real Hong Kong Bus & Minibus dataset directly in the browser
 */
export async function syncRealTransitDatabase(
  forceUpdate = false,
  onProgress?: (msg: string) => void
): Promise<RouteDefinition[]> {
  if (!forceUpdate) {
    const cached = await getCachedRealRoutes();
    if (cached && cached.length > 100) {
      return cached;
    }
  }

  if (syncPromise && !forceUpdate) {
    return syncPromise;
  }

  const doSync = async (): Promise<RouteDefinition[]> => {
    const urls = [
      'https://data.hkbus.app/routeFareList.min.json',
      'https://hkbus.github.io/hk-bus-crawling/routeFareList.min.json',
    ];

    for (const url of urls) {
      try {
        onProgress?.('正在下載全港巴士及專線小巴完整真實路線庫...');
        const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (res.ok) {
          const json = await res.json();
          const { routes, totalStops } = parseUnifiedRouteFareList(json);
          if (routes.length > 200) {
            await saveRealRoutesToIDB(routes);
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            updateOfflineDbInfo({
              version: `HK-OpenData (${routes.length} 路線)`,
              lastUpdated: `${dateStr} (真實全港資料)`,
              totalRoutes: routes.length,
              totalStops,
              status: 'synced',
            });
            return routes;
          }
        }
      } catch (e) {
        console.warn(`Mirror ${url} failed, trying next source...`, e);
      }
    }

    // Fallback to direct official KMB Government Open Data API
    try {
      const { routes, totalStops } = await fetchOfficialKMBDirect(onProgress);
      if (routes.length > 100) {
        await saveRealRoutesToIDB(routes);
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        updateOfflineDbInfo({
          version: `KMB-Official (${routes.length} 路線)`,
          lastUpdated: `${dateStr} (運輸署真實資料)`,
          totalRoutes: routes.length,
          totalStops,
          status: 'synced',
        });
        return routes;
      }
    } catch (e) {
      console.warn('Direct KMB API sync failed:', e);
    }

    return inMemoryRoutes || PRELOADED_ROUTES;
  };

  syncPromise = doSync().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}
