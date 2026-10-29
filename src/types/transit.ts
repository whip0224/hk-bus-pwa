export type TransitOperator = 'KMB' | 'CTB' | 'GMB' | 'NLB' | 'MTRB';

export interface LocationPoint {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  source?: 'ogcio' | 'als' | 'gps' | 'preset' | 'manual';
}

export interface TransitStop {
  stopId: string;
  nameTc: string;
  nameEn: string;
  lat: number;
  lng: number;
  operator: TransitOperator;
}

export interface RouteStop {
  stopId: string;
  seq: number;
  nameTc: string;
  lat: number;
  lng: number;
  fare?: number;
  ctbStopId?: string; // For joint KMB+CTB cross-harbour routes
}

export interface RouteDefinition {
  id: string;
  routeNumber: string;
  operator: TransitOperator;
  jointOperator?: TransitOperator;
  serviceType: string;
  direction: 'O' | 'I'; // Outbound or Inbound
  originName: string;
  destName: string;
  stops: RouteStop[];
  gtfsId?: string;      // Used by GMB official API
  nlbId?: string;       // Used by NLB official API
  description?: string;
}

export interface RouteETA {
  etaMinutes: number | null; // e.g. 0 for arriving, 3, 12, or null
  etaTimeStr: string;        // e.g. "20:45"
  remark: string;            // e.g. "九巴實時", "城巴實時", "原定班次"
  isRealTime: boolean;
  timestamp: string;
  operatorLabel?: string;
}

export interface MatchedRoute {
  route: RouteDefinition;
  originStop: RouteStop;
  destStop: RouteStop;
  originDistanceMeters: number;
  destDistanceMeters: number;
  stopsCount: number;
  etas?: RouteETA[];
  loadingETA?: boolean;
}

export interface RouteSearchResult {
  routes: MatchedRoute[];
  autoExpanded: boolean;
  appliedRadius: number;
  initialRadius: number;
  originStopsCount: number;
  destStopsCount: number;
  dataSource?: 'real_opendata' | 'fallback';
}

export interface SavedTrip {
  id: string;
  customName: string;
  origin: LocationPoint;
  dest: LocationPoint;
  radius: number;
  createdAt: number;
}

export interface SavedDestination {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category?: 'home' | 'work' | 'school' | 'medical' | 'custom';
}

export type MapAppPreference = 'google' | 'apple';
