import React, { useState, useEffect, useRef } from 'react';
import {
  RotateCw,
  BookmarkPlus,
  Navigation,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowRight,
  Info,
  CheckCircle2,
  Compass,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { MatchedRoute, RouteSearchResult, LocationPoint, MapAppPreference } from '../types/transit';
import { estimateWalkMinutes } from '../services/routingEngine';
import { navigateToStop } from '../services/mapNavigator';
import { saveTrip } from '../services/storageService';

interface ResultsTabProps {
  origin: LocationPoint | null;
  dest: LocationPoint | null;
  searchResult: RouteSearchResult | null;
  top5Routes: MatchedRoute[];
  remainingRoutes: MatchedRoute[];
  onRefreshETAs: () => void;
  onLazyLoadRouteETA: (matched: MatchedRoute) => void;
  isRefreshingETAs: boolean;
  lastUpdatedTime: string | null;
  mapPref: MapAppPreference;
  onMapPrefChange: (pref: MapAppPreference) => void;
  onNotify: (msg: string) => void;
  onGoToSearch: () => void;
}

const INITIAL_WATERFALL_BATCH = 6;
const WATERFALL_BATCH_STEP = 6;

function renderOperatorBadge(op: string, jointOp?: string) {
  const badge = (code: string) => {
    switch (code) {
      case 'KMB':
        return (
          <span
            key={code}
            className="text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 px-1.5 py-0.5 rounded"
          >
            九巴
          </span>
        );
      case 'CTB':
        return (
          <span
            key={code}
            className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 px-1.5 py-0.5 rounded"
          >
            城巴
          </span>
        );
      case 'GMB':
        return (
          <span
            key={code}
            className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 px-1.5 py-0.5 rounded"
          >
            專線小巴
          </span>
        );
      case 'NLB':
        return (
          <span
            key={code}
            className="text-[10px] font-bold text-teal-600 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-900/60 px-1.5 py-0.5 rounded"
          >
            嶼巴
          </span>
        );
      case 'MTRB':
        return (
          <span
            key={code}
            className="text-[10px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-900/60 px-1.5 py-0.5 rounded"
          >
            港鐵巴士
          </span>
        );
      default:
        return (
          <span
            key={code}
            className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"
          >
            {code}
          </span>
        );
    }
  };

  return (
    <div className="flex items-center gap-1">
      {badge(op)}
      {jointOp && badge(jointOp)}
    </div>
  );
}

interface VirtualizedRouteCardProps {
  matched: MatchedRoute;
  isTop5: boolean;
  mapPref: MapAppPreference;
  onLazyLoadRouteETA: (matched: MatchedRoute) => void;
}

/**
 * Virtualized Route Card with On-Demand Scroll ETA Fetching:
 * 1. Observes viewport intersection to trigger `onLazyLoadRouteETA` only when the user scrolls near this route.
 * 2. Virtualizes off-screen DOM content for non-Top-5 cards far outside the viewport (`480px` buffer) while preserving exact measured height.
 */
const VirtualizedRouteCard: React.FC<VirtualizedRouteCardProps> = ({
  matched,
  isTop5,
  mapPref,
  onLazyLoadRouteETA,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState<boolean>(true);
  const [measuredHeight, setMeasuredHeight] = useState<number>(216);

  const {
    route,
    originStop,
    destStop,
    originDistanceMeters,
    destDistanceMeters,
    stopsCount,
    etas,
    loadingETA,
  } = matched;

  const isEtaPending = etas === undefined || Boolean(loadingETA);

  // 1. Scroll-triggered on-demand ETA fetch when route card approaches viewport
  useEffect(() => {
    if (etas !== undefined || loadingETA) return;

    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      onLazyLoadRouteETA(matched);
      return;
    }

    const etaObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          onLazyLoadRouteETA(matched);
          etaObserver.disconnect();
        }
      },
      { rootMargin: '180px 0px' }
    );

    etaObserver.observe(el);
    return () => etaObserver.disconnect();
  }, [etas, loadingETA, matched, onLazyLoadRouteETA]);

  // 2. Viewport windowing / DOM virtualization for expanded list cards
  useEffect(() => {
    if (isTop5) return;
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const windowObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setIsNearViewport(true);
        } else {
          const rect = el.getBoundingClientRect();
          if (rect.height > 120) {
            setMeasuredHeight(rect.height);
          }
          setIsNearViewport(false);
        }
      },
      { rootMargin: '480px 0px' }
    );

    windowObserver.observe(el);
    return () => windowObserver.disconnect();
  }, [isTop5]);

  const walkMin = estimateWalkMinutes(originDistanceMeters);
  const firstEta = etas?.[0];
  const secondEta = etas?.[1];

  // Lightweight virtualized placeholder when scrolled far outside viewport
  if (!isTop5 && !isNearViewport) {
    return (
      <div
        ref={cardRef}
        style={{ minHeight: `${measuredHeight}px` }}
        className="bg-white/60 dark:bg-slate-900/50 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl font-black font-mono text-slate-400 dark:text-slate-600">
            {route.routeNumber}
          </span>
          <span className="text-xs text-slate-400 truncate max-w-[180px]">
            開往 {route.destName} · {originStop.nameTc}
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          {originDistanceMeters}m
        </span>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`bg-white dark:bg-slate-900 rounded-2xl border p-4 transition-all shadow-xs ${
        isTop5
          ? 'border-blue-200/90 dark:border-blue-900/50 ring-1 ring-blue-500/10'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Header: Route Number, Operator, Real-time Fastest ETA */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
            {route.routeNumber}
          </span>
          {renderOperatorBadge(route.operator, route.jointOperator)}
        </div>

        {/* Live ETA Status */}
        <div className="text-right">
          {isEtaPending ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium bg-blue-50/80 dark:bg-blue-950/50 px-2.5 py-1 rounded-lg">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>捲動載入實時 ETA...</span>
            </div>
          ) : firstEta && firstEta.etaMinutes !== null ? (
            <div className="flex flex-col items-end">
              <div className="flex items-baseline gap-1">
                <span className="text-xs text-slate-400">最快到站</span>
                <span
                  className={`font-mono text-base font-bold tabular-nums ${
                    firstEta.etaMinutes <= 2
                      ? 'text-red-600 dark:text-red-400 animate-pulse'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {firstEta.etaMinutes <= 1 ? '正在到站' : `${firstEta.etaMinutes} 分鐘`}
                </span>
              </div>
              {firstEta.etaTimeStr && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {firstEta.etaTimeStr} ({firstEta.remark})
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400 font-medium">暫無班次 / 非服務時間</span>
          )}
        </div>
      </div>

      {/* Direction & Fare & Stops Count */}
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 flex-wrap">
        <span>開往</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">{route.destName}</span>
        <span>·</span>
        <span>途經 {stopsCount} 站</span>
        {originStop.fare !== undefined && (
          <>
            <span>·</span>
            <span className="font-mono text-slate-600 dark:text-slate-300">
              ${originStop.fare.toFixed(1)}
            </span>
          </>
        )}
      </p>

      {/* Fastest 2 Upcoming Departures (正在到站時間, 下一班到站時間) */}
      <div className="grid grid-cols-2 gap-2 mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          <div>
            <div className="text-[10px] text-slate-400">即將到站 (首班)</div>
            <div className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200 tabular-nums">
              {isEtaPending
                ? '讀取實時班次中...'
                : firstEta && firstEta.etaMinutes !== null
                ? firstEta.etaMinutes <= 1
                  ? `正在到站 (${firstEta.etaTimeStr})`
                  : `${firstEta.etaMinutes} 分鐘 (${firstEta.etaTimeStr})`
                : '暫無實時班次'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-l border-slate-200/80 dark:border-slate-700/80 pl-2">
          <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <div>
            <div className="text-[10px] text-slate-400">下一班次</div>
            <div className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200 tabular-nums">
              {isEtaPending
                ? '待載入...'
                : secondEta && secondEta.etaMinutes !== null
                ? `${secondEta.etaMinutes} 分鐘 (${secondEta.etaTimeStr})`
                : '暫無後續班次'}
            </div>
          </div>
        </div>
      </div>

      {/* Boarding and Alighting Stops with Exact Distance */}
      <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-start gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600 mt-1 flex-shrink-0" />
          <div className="flex-1 flex items-baseline justify-between gap-2">
            <span className="font-medium text-slate-900 dark:text-slate-100">
              上車站：{originStop.nameTc}
            </span>
            <span className="text-[11px] text-slate-400 font-mono shrink-0">
              約 {originDistanceMeters}m · 步行 {walkMin} 分鐘
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1 flex-shrink-0" />
          <div className="flex-1 flex items-baseline justify-between gap-2">
            <span className="font-medium text-slate-900 dark:text-slate-100">
              下車站：{destStop.nameTc}
            </span>
            <span className="text-[11px] text-slate-400 font-mono shrink-0">
              距目的地約 {destDistanceMeters}m
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Action to Exact Boarding Stop */}
      <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 font-mono truncate">
          車站坐標: {originStop.lat.toFixed(5)}, {originStop.lng.toFixed(5)} (
          {mapPref === 'apple' ? 'Apple 地圖' : 'Google Maps'})
        </span>
        <button
          onClick={() => navigateToStop(originStop, mapPref)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl transition active:scale-95 shrink-0"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>導航至出發站</span>
        </button>
      </div>
    </div>
  );
};

export const ResultsTab: React.FC<ResultsTabProps> = ({
  origin,
  dest,
  searchResult,
  top5Routes,
  remainingRoutes,
  onRefreshETAs,
  onLazyLoadRouteETA,
  isRefreshingETAs,
  lastUpdatedTime,
  mapPref,
  onNotify,
  onGoToSearch,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_WATERFALL_BATCH);
  const waterfallSentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset waterfall batch size when a new search result arrives
  useEffect(() => {
    setVisibleCount(INITIAL_WATERFALL_BATCH);
    setIsExpanded(false);
  }, [searchResult]);

  // Waterfall progressive scroll loader when "其他途經車號" is expanded
  useEffect(() => {
    if (!isExpanded || visibleCount >= remainingRoutes.length) return;
    const sentinel = waterfallSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setVisibleCount((prev) =>
            Math.min(prev + WATERFALL_BATCH_STEP, remainingRoutes.length)
          );
        }
      },
      { rootMargin: '240px 0px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isExpanded, visibleCount, remainingRoutes.length]);

  if (!origin || !dest || !searchResult) {
    return (
      <div className="text-center py-16 px-4 space-y-4 max-w-sm mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
          <Compass className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">尚未執行路線搜尋</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            請先在第一頁設定出發地與目的地，系統將即時計算途經巴士與專線小巴。
          </p>
        </div>
        <button
          onClick={onGoToSearch}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow transition"
        >
          前往路線搜尋
        </button>
      </div>
    );
  }

  const handleSaveTrip = () => {
    saveTrip(origin, dest, searchResult.appliedRadius);
    setSavedSuccess(true);
    onNotify(`已成功儲存行程：「${origin.name} ➔ ${dest.name}」！`);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const visibleRemainingRoutes = remainingRoutes.slice(0, visibleCount);
  const hasMoreWaterfallRoutes = visibleCount < remainingRoutes.length;

  return (
    <div className="space-y-4 pb-24 max-w-lg mx-auto">
      {/* Top Controls: Refresh ETA & Save Trip */}
      <div className="flex items-center justify-between gap-2 p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <button
          onClick={onRefreshETAs}
          disabled={isRefreshingETAs}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold transition disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRefreshingETAs ? 'animate-spin' : ''}`} />
          <span>更新到站時間</span>
        </button>

        {lastUpdatedTime && (
          <span className="text-[10px] text-slate-400 font-mono">
            實時更新於 {lastUpdatedTime}
          </span>
        )}

        <button
          onClick={handleSaveTrip}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${
            savedSuccess
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 text-emerald-600'
              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
          }`}
        >
          {savedSuccess ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>已成功儲存</span>
            </>
          ) : (
            <>
              <BookmarkPlus className="w-3.5 h-3.5 text-blue-600" />
              <span>儲存行程</span>
            </>
          )}
        </button>
      </div>

      {/* Auto-Expanded Notification Alert */}
      {searchResult.autoExpanded && (
        <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-xs">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>
            <strong>已自動擴大搜尋範圍至 {searchResult.appliedRadius}米</strong>：因原{' '}
            {searchResult.initialRadius}米 範圍內直達車號較少，系統已自動擴大一次搜尋範圍。
          </p>
        </div>
      )}

      {/* Query Corridor Summary */}
      <div className="bg-slate-100 dark:bg-slate-800/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[120px]">
            {origin.name}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[120px]">
            {dest.name}
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500 flex-shrink-0">
          範圍 {searchResult.appliedRadius}m · 共 {searchResult.routes.length} 條路線
        </span>
      </div>

      {/* Section 1: 最快到站的 5 種車號 */}
      {top5Routes.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              最快到站 5 種車號 (最近出發站及實時 ETA 排序)
            </h3>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              官方開放數據實時班次
            </span>
          </div>

          {/* Quick Top 5 Route Number Strip */}
          <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-none">
            {top5Routes.map((m) => (
              <span
                key={`${m.route.id}-${m.originStop.stopId}`}
                className="px-2.5 py-1 text-xs font-mono font-bold bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 rounded-lg flex-shrink-0"
              >
                {m.route.routeNumber}
              </span>
            ))}
          </div>

          <div className="space-y-3">
            {top5Routes.map((m) => (
              <VirtualizedRouteCard
                key={`${m.route.id}-${m.originStop.stopId}`}
                matched={m}
                isTop5={true}
                mapPref={mapPref}
                onLazyLoadRouteETA={onLazyLoadRouteETA}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-semibold">在此半徑內未找到直達途經車號</p>
          <p className="text-xs text-slate-400 mt-1">
            您可以嘗試在第一頁將搜尋半徑切換至 500 米或 800 米。
          </p>
        </div>
      )}

      {/* Section 2: 其他路線車號 (按下箭頭展開 + 瀑布流虛擬捲動載入) */}
      {remainingRoutes.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between p-3.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 overflow-hidden">
              <span className="shrink-0">其他途經車號 ({remainingRoutes.length} 條)</span>
              <div className="flex items-center gap-1 truncate">
                {remainingRoutes.slice(0, 6).map((r) => (
                  <span
                    key={`${r.route.id}-${r.originStop.stopId}`}
                    className="text-[10px] font-mono font-bold text-slate-500 bg-white/70 dark:bg-slate-900/60 px-1.5 py-0.5 rounded"
                  >
                    {r.route.routeNumber}
                  </span>
                ))}
              </div>
            </div>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            )}
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-3 animate-fadeIn">
              {/* Waterfall & Virtual Scroll Info Banner */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>向下捲動時自動按需載入較遠車站的實時 ETA</span>
                </span>
                <span className="font-mono text-slate-500 shrink-0">
                  已顯示 {visibleRemainingRoutes.length}/{remainingRoutes.length}
                </span>
              </div>

              {visibleRemainingRoutes.map((m) => (
                <VirtualizedRouteCard
                  key={`${m.route.id}-${m.originStop.stopId}`}
                  matched={m}
                  isTop5={false}
                  mapPref={mapPref}
                  onLazyLoadRouteETA={onLazyLoadRouteETA}
                />
              ))}

              {/* Waterfall Intersection Sentinel & Manual Load More Fallback */}
              {hasMoreWaterfallRoutes && (
                <div ref={waterfallSentinelRef} className="pt-2 pb-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((prev) =>
                        Math.min(prev + WATERFALL_BATCH_STEP, remainingRoutes.length)
                      )
                    }
                    className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition flex items-center justify-center gap-2 shadow-2xs"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    <span>
                      向下捲動或點擊載入更多路線 ({visibleRemainingRoutes.length} /{' '}
                      {remainingRoutes.length})
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
