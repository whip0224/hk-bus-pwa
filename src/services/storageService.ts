import { SavedTrip, SavedDestination, LocationPoint } from '../types/transit';

const SAVED_TRIPS_KEY = 'hk_transit_saved_trips_v2';
const SAVED_DESTINATIONS_KEY = 'hk_transit_saved_destinations_v2';
const OFFLINE_DB_STATUS_KEY = 'hk_transit_offline_db_v2';

// Verified real coordinates for default saved destinations
const DEFAULT_SAVED_DESTINATIONS: SavedDestination[] = [
  {
    id: 'dest_sample_health',
    name: '九龍灣學生健康服務中心',
    address: '九龍九龍灣啟仁街9號九龍灣健康中心 (近啟業邨 / 麗晶花園)',
    lat: 22.32835,
    lng: 114.20825,
    category: 'medical',
  },
  {
    id: 'dest_sample_school',
    name: '觀塘官立小學',
    address: '九龍觀塘牛頭角道240號 (近牛頭角下邨)',
    lat: 22.31632,
    lng: 114.21788,
    category: 'school',
  },
  {
    id: 'dest_sample_home',
    name: '啟業邨 (屋企)',
    address: '九龍九龍灣觀塘道啟業邨',
    lat: 22.32862,
    lng: 114.20928,
    category: 'home',
  },
  {
    id: 'dest_sample_work',
    name: '觀塘站 (APM / 公司)',
    address: '九龍觀塘觀塘道418號',
    lat: 22.31255,
    lng: 114.22565,
    category: 'work',
  },
];

export function getSavedTrips(): SavedTrip[] {
  try {
    const raw = localStorage.getItem(SAVED_TRIPS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to parse saved trips', e);
  }
  return [];
}

export function saveTrip(origin: LocationPoint, dest: LocationPoint, radius: number, customName?: string): SavedTrip {
  const trips = getSavedTrips();
  const id = `trip_${Date.now()}`;
  const newTrip: SavedTrip = {
    id,
    customName: customName || `${origin.name} ➔ ${dest.name}`,
    origin,
    dest,
    radius,
    createdAt: Date.now(),
  };

  const updated = [newTrip, ...trips.filter((t) => !(t.origin.name === origin.name && t.dest.name === dest.name))];
  localStorage.setItem(SAVED_TRIPS_KEY, JSON.stringify(updated));
  return newTrip;
}

export function renameTrip(tripId: string, newName: string): void {
  const trips = getSavedTrips();
  const updated = trips.map((t) => (t.id === tripId ? { ...t, customName: newName } : t));
  localStorage.setItem(SAVED_TRIPS_KEY, JSON.stringify(updated));
}

export function deleteTrip(tripId: string): void {
  const trips = getSavedTrips();
  const updated = trips.filter((t) => t.id !== tripId);
  localStorage.setItem(SAVED_TRIPS_KEY, JSON.stringify(updated));
}

export function getSavedDestinations(): SavedDestination[] {
  try {
    const raw = localStorage.getItem(SAVED_DESTINATIONS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to parse saved destinations', e);
  }
  localStorage.setItem(SAVED_DESTINATIONS_KEY, JSON.stringify(DEFAULT_SAVED_DESTINATIONS));
  return DEFAULT_SAVED_DESTINATIONS;
}

export function saveDestination(dest: LocationPoint, category?: SavedDestination['category']): SavedDestination {
  const current = getSavedDestinations();
  const newDest: SavedDestination = {
    id: `dest_${Date.now()}`,
    name: dest.name,
    address: dest.address || dest.name,
    lat: dest.lat,
    lng: dest.lng,
    category: category || 'custom',
  };

  const updated = [newDest, ...current.filter((d) => d.name !== dest.name)];
  localStorage.setItem(SAVED_DESTINATIONS_KEY, JSON.stringify(updated));
  return newDest;
}

export function deleteDestination(destId: string): void {
  const current = getSavedDestinations();
  const updated = current.filter((d) => d.id !== destId);
  localStorage.setItem(SAVED_DESTINATIONS_KEY, JSON.stringify(updated));
}

export interface OfflineDbInfo {
  version: string;
  lastUpdated: string;
  totalRoutes: number;
  totalStops: number;
  status: 'synced' | 'downloading' | 'ready';
}

export function getOfflineDbInfo(): OfflineDbInfo {
  try {
    const raw = localStorage.getItem(OFFLINE_DB_STATUS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  return {
    version: '同步中...',
    lastUpdated: '正在連接香港運輸署開放數據...',
    totalRoutes: 0,
    totalStops: 0,
    status: 'downloading',
  };
}

export function updateOfflineDbInfo(info: OfflineDbInfo): void {
  localStorage.setItem(OFFLINE_DB_STATUS_KEY, JSON.stringify(info));
}
