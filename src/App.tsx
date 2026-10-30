/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bus,
  WifiOff,
  CheckCircle2,
  Loader2,
  Type,
} from 'lucide-react';
import {
  LocationPoint,
  MatchedRoute,
  RouteSearchResult,
  SavedTrip,
  MapAppPreference,
  FontSizePreference,
  RouteDefinition,
} from './types/transit';
import { findMatchingRoutes } from './services/routingEngine';
import { fetchRouteETAs, partitionTop5AndRemaining } from './services/etaService';
import { getSavedMapPreference, setSavedMapPreference } from './services/mapNavigator';
import {
  getSavedTrips,
  getSavedFontSizePreference,
  setSavedFontSizePreference,
} from './services/storageService';
import { searchLocations } from './services/geoService';
import { syncRealTransitDatabase, getActiveRoutes } from './services/openDataSync';

import { TabNavigation, ActiveTab } from './components/TabNavigation';
import { SearchTab } from './components/SearchTab';
import { ResultsTab } from './components/ResultsTab';
import { SavedTab } from './components/SavedTab';
import { PWAInstallGuide } from './components/PWAInstallGuide';

// Number of nearest routes to fetch ETAs for immediately on search;
// farther routes are lazy-loaded via IntersectionObserver when scrolled into view.
const INITIAL_ETA_BATCH_SIZE = 16;

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');

  // Start with empty origin and destination by default
  const [origin, setOrigin] = useState<LocationPoint | null>(null);
  const [dest, setDest] = useState<LocationPoint | null>(null);
  const [radius, setRadius] = useState<number>(350);

  // Database Sync state
  const [isSyncingDb, setIsSyncingDb] = useState<boolean>(true);
  const [totalSyncedRoutes, setTotalSyncedRoutes] = useState<number>(0);

  // Search Results & ETA state
  const [searchResult, setSearchResult] = useState<RouteSearchResult | null>(null);
  const [top5Routes, setTop5Routes] = useState<MatchedRoute[]>([]);
  const [remainingRoutes, setRemainingRoutes] = useState<MatchedRoute[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshingETAs, setIsRefreshingETAs] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string | null>(null);

  // Track in-flight lazy ETA requests to avoid duplicate fetches during scroll
  const inFlightEtaKeysRef = useRef<Set<string>>(new Set());

  // Preferences & Counters
  const [mapPref, setMapPref] = useState<MapAppPreference>(getSavedMapPreference());
  const [fontSizePref, setFontSizePref] = useState<FontSizePreference>(getSavedFontSizePreference());
  const [savedTripsCount, setSavedTripsCount] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Apply root font size preference on mount and change
  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', fontSizePref);
  }, [fontSizePref]);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2800);
  };

  const refreshSavedCount = () => {
    setSavedTripsCount(getSavedTrips().length);
  };

  // Helper to fetch ETAs only for the initial closest batch of routes,
  // leaving farther routes with `etas: undefined` for waterfall scroll loading
  const populateInitialETAsForRoutes = async (
    routes: MatchedRoute[]
  ): Promise<MatchedRoute[]> => {
    const initialSlice = routes.slice(0, INITIAL_ETA_BATCH_SIZE);
    const deferredSlice = routes.slice(INITIAL_ETA_BATCH_SIZE).map((m) => ({
      ...m,
      etas: undefined,
      loadingETA: false,
    }));

    const initialWithETAs = await Promise.all(
      initialSlice.map(async (m) => {
        const etas = await fetchRouteETAs(m);
        return { ...m, etas, loadingETA: false };
      })
    );

    return [...initialWithETAs, ...deferredSlice];
  };

  // On-demand lazy ETA loader triggered when a route card scrolls near the viewport
  const handleLazyLoadRouteETA = useCallback(async (target: MatchedRoute) => {
    const routeKey = `${target.route.id}-${target.originStop.stopId}`;
    if (inFlightEtaKeysRef.current.has(routeKey)) {
      return;
    }
    inFlightEtaKeysRef.current.add(routeKey);

    const markLoading = (list: MatchedRoute[]) =>
      list.map((m) =>
        m.route.id === target.route.id && m.originStop.stopId === target.originStop.stopId
          ? { ...m, loadingETA: true }
          : m
      );

    setTop5Routes((prev) => markLoading(prev));
    setRemainingRoutes((prev) => markLoading(prev));

    try {
      const etas = await fetchRouteETAs(target);
      const applyEtas = (list: MatchedRoute[]) =>
        list.map((m) =>
          m.route.id === target.route.id && m.originStop.stopId === target.originStop.stopId
            ? { ...m, etas, loadingETA: false }
            : m
        );

      setTop5Routes((prev) => applyEtas(prev));
      setRemainingRoutes((prev) => applyEtas(prev));
    } catch {
      const clearLoading = (list: MatchedRoute[]) =>
        list.map((m) =>
          m.route.id === target.route.id && m.originStop.stopId === target.originStop.stopId
            ? { ...m, etas: [], loadingETA: false }
            : m
        );
      setTop5Routes((prev) => clearLoading(prev));
      setRemainingRoutes((prev) => clearLoading(prev));
    } finally {
      inFlightEtaKeysRef.current.delete(routeKey);
    }
  }, []);

  // Core Search & ETA matching routine
  const executeSearch = useCallback(
    async (
      customOrigin = origin,
      customDest = dest,
      customRadius = radius,
      customRoutesList?: RouteDefinition[],
      switchTab = true
    ) => {
      if (!customOrigin || !customOrigin.name.trim()) {
        showNotification('請輸入出發地點');
        return;
      }
      if (!customDest || !customDest.name.trim()) {
        showNotification('請輸入目的地');
        return;
      }

      setIsSearching(true);
      inFlightEtaKeysRef.current.clear();

      try {
        let finalOrigin = customOrigin;
        let finalDest = customDest;

        // Ensure origin has valid coordinates via OGCIO / Lands Dept / OSM HK
        if (!finalOrigin.lat || !finalOrigin.lng) {
          const locs = await searchLocations(finalOrigin.name);
          if (locs.length > 0) {
            finalOrigin = locs[0];
            setOrigin(finalOrigin);
          } else {
            showNotification(`找不到出發地「${finalOrigin.name}」的坐標，請嘗試輸入更詳細地址`);
            setIsSearching(false);
            return;
          }
        }

        // Ensure dest has valid coordinates via OGCIO / Lands Dept / OSM HK
        if (!finalDest.lat || !finalDest.lng) {
          const locs = await searchLocations(finalDest.name);
          if (locs.length > 0) {
            finalDest = locs[0];
            setDest(finalDest);
          } else {
            showNotification(`找不到目的地「${finalDest.name}」的坐標，請嘗試輸入更詳細地址`);
            setIsSearching(false);
            return;
          }
        }

        // Match routes from real HK Open Data database
        const result = findMatchingRoutes(
          finalOrigin,
          finalDest,
          customRadius,
          customRoutesList || getActiveRoutes()
        );
        setSearchResult(result);

        // Fetch real-time ETAs only for the closest initial batch;
        // remaining routes will lazy-load as the user scrolls down
        const routesWithInitialETAs = await populateInitialETAsForRoutes(result.routes);

        // Partition into Top 5 fastest active routes and remaining routes
        const { top5, remaining } = partitionTop5AndRemaining(routesWithInitialETAs);
        setTop5Routes(top5);
        setRemainingRoutes(remaining);

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        setLastUpdatedTime(timeStr);

        if (switchTab) {
          setActiveTab('results');
        }
        if (result.autoExpanded) {
          showNotification(`已自動擴大搜尋半徑至 ${result.appliedRadius}米`);
        }
      } catch (err) {
        console.error('Search failed:', err);
        showNotification('路線搜尋時發生錯誤，請稍後重試');
      } finally {
        setIsSearching(false);
      }
    },
    [origin, dest, radius]
  );

  // Sync Real HK Open Data on initial mount (without forcing an automatic search)
  useEffect(() => {
    refreshSavedCount();

    let mounted = true;
    (async () => {
      setIsSyncingDb(true);
      const syncedRoutes = await syncRealTransitDatabase(false);
      if (!mounted) return;
      setTotalSyncedRoutes(syncedRoutes.length);
      setIsSyncingDb(false);
    })();

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Anti-blank screen for iPhone PWA return from Map App
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        window.requestAnimationFrame(() => {
          document.body.style.opacity = '0.999';
          requestAnimationFrame(() => {
            document.body.style.opacity = '';
          });
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleMapPrefChange = (pref: MapAppPreference) => {
    setMapPref(pref);
    setSavedMapPreference(pref);
  };

  const handleFontSizeChange = (size: FontSizePreference) => {
    setFontSizePref(size);
    setSavedFontSizePreference(size);
  };

  const cycleFontSize = () => {
    const order: FontSizePreference[] = ['normal', 'large', 'xlarge'];
    const labels: Record<FontSizePreference, string> = {
      normal: '標準字體',
      large: '大字體',
      xlarge: '加大字體',
    };
    const next = order[(order.indexOf(fontSizePref) + 1) % order.length];
    handleFontSizeChange(next);
    showNotification(`已切換為「${labels[next]}」`);
  };

  // Refresh ETAs routine: refreshes Top 5 + any already-loaded routes in remainingRoutes,
  // preserving lazy state for un-scrolled distant routes
  const handleRefreshETAs = async () => {
    if (!searchResult || searchResult.routes.length === 0) return;

    setIsRefreshingETAs(true);
    try {
      const allRoutes = [...top5Routes, ...remainingRoutes];
      const updated = await Promise.all(
        allRoutes.map(async (m, idx) => {
          if (idx < INITIAL_ETA_BATCH_SIZE || m.etas !== undefined) {
            const etas = await fetchRouteETAs(m);
            return { ...m, etas, loadingETA: false };
          }
          return m;
        })
      );

      const { top5, remaining } = partitionTop5AndRemaining(updated);
      setTop5Routes(top5);
      setRemainingRoutes(remaining);

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      setLastUpdatedTime(timeStr);

      showNotification('實時到站時間已更新並重新排序！');
    } catch {
      showNotification('無法取得即時資料，請檢查網絡連線');
    } finally {
      setIsRefreshingETAs(false);
    }
  };

  const handleSelectSavedTrip = (trip: SavedTrip) => {
    setOrigin(trip.origin);
    setDest(trip.dest);
    setRadius(trip.radius);
    executeSearch(trip.origin, trip.dest, trip.radius, getActiveRoutes(), true);
  };

  const fontSizeBadgeLabel =
    fontSizePref === 'xlarge' ? '加大' : fontSizePref === 'large' ? '大' : '標準';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      {/* Top Mobile App Bar — padded below iPhone Status Bar & Dynamic Island */}
      <header className="sticky top-0 z-30 pt-safe-header bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Bus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white leading-none truncate">
                香港乘車易
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {isSyncingDb
                  ? '正在同步香港運輸署真實路線庫...'
                  : totalSyncedRoutes > 100
                  ? `全港真實開放數據 (${totalSyncedRoutes} 條路線)`
                  : '巴士 · 小巴 · 官方實時到站'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isSyncingDb && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-lg">
                <Loader2 className="w-3 h-3 animate-spin" />
                同步中
              </span>
            )}
            {!isOnline && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-200">
                <WifiOff className="w-3 h-3" />
                離線
              </span>
            )}
            <button
              type="button"
              onClick={cycleFontSize}
              title="切換字體大小 (標準 / 大 / 加大)"
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition active:scale-95"
            >
              <Type className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{fontSizeBadgeLabel}</span>
            </button>
            <PWAInstallGuide />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-lg w-full mx-auto p-4 pt-3.5">
        {activeTab === 'search' && (
          <SearchTab
            origin={origin}
            dest={dest}
            radius={radius}
            onOriginChange={setOrigin}
            onDestChange={setDest}
            onRadiusChange={setRadius}
            onExecuteSearch={() => executeSearch(origin, dest, radius, getActiveRoutes(), true)}
            isSearching={isSearching}
            isSyncingDb={isSyncingDb}
            totalSyncedRoutes={totalSyncedRoutes}
            onNotify={showNotification}
          />
        )}

        {activeTab === 'results' && (
          <ResultsTab
            origin={origin}
            dest={dest}
            searchResult={searchResult}
            top5Routes={top5Routes}
            remainingRoutes={remainingRoutes}
            onRefreshETAs={handleRefreshETAs}
            onLazyLoadRouteETA={handleLazyLoadRouteETA}
            isRefreshingETAs={isRefreshingETAs}
            lastUpdatedTime={lastUpdatedTime}
            mapPref={mapPref}
            onMapPrefChange={handleMapPrefChange}
            onNotify={showNotification}
            onGoToSearch={() => setActiveTab('search')}
          />
        )}

        {activeTab === 'saved' && (
          <SavedTab
            onSelectTrip={handleSelectSavedTrip}
            mapPref={mapPref}
            onMapPrefChange={handleMapPrefChange}
            fontSizePref={fontSizePref}
            onFontSizeChange={(size) => {
              handleFontSizeChange(size);
              const labels: Record<FontSizePreference, string> = {
                normal: '標準字體',
                large: '大字體',
                xlarge: '加大字體',
              };
              showNotification(`已切換為「${labels[size]}」`);
            }}
            onDbSynced={(count) => setTotalSyncedRoutes(count)}
            onNotify={(msg) => {
              showNotification(msg);
              refreshSavedCount();
            }}
          />
        )}
      </main>

      {/* Toast Notification Alert (placed below Dynamic Island & Header) */}
      {toastMessage && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 text-xs font-semibold rounded-full shadow-lg backdrop-blur-xs flex items-center gap-2 max-w-[90vw] truncate">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* Fixed Bottom Tab Navigation */}
      <TabNavigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'saved') refreshSavedCount();
        }}
        hasResults={searchResult !== null && searchResult.routes.length > 0}
        savedCount={savedTripsCount}
      />
    </div>
  );
}
