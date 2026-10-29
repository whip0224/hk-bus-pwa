import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  ArrowUpDown,
  Search,
  BookmarkPlus,
  BookmarkCheck,
  Sparkles,
  Loader2,
  X,
  Database,
} from 'lucide-react';
import { LocationPoint, SavedDestination } from '../types/transit';
import { searchLocations, getCurrentCoordinates } from '../services/geoService';
import { saveDestination, getSavedDestinations } from '../services/storageService';

interface SearchTabProps {
  origin: LocationPoint | null;
  dest: LocationPoint | null;
  radius: number;
  onOriginChange: (loc: LocationPoint | null) => void;
  onDestChange: (loc: LocationPoint | null) => void;
  onRadiusChange: (r: number) => void;
  onExecuteSearch: () => void;
  isSearching: boolean;
  isSyncingDb: boolean;
  totalSyncedRoutes: number;
  onNotify: (msg: string) => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({
  origin,
  dest,
  radius,
  onOriginChange,
  onDestChange,
  onRadiusChange,
  onExecuteSearch,
  isSearching,
  isSyncingDb,
  totalSyncedRoutes,
  onNotify,
}) => {
  const [originText, setOriginText] = useState(origin?.name || '');
  const [destText, setDestText] = useState(dest?.name || '');

  const [originSuggestions, setOriginSuggestions] = useState<LocationPoint[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<LocationPoint[]>([]);
  const [loadingOriginGeo, setLoadingOriginGeo] = useState(false);
  const [loadingDestGeo, setLoadingDestGeo] = useState(false);
  const [locatingGPS, setLocatingGPS] = useState(false);

  const [savedDests, setSavedDests] = useState<SavedDestination[]>([]);
  const [isDestSaved, setIsDestSaved] = useState(false);

  const originTimer = useRef<NodeJS.Timeout | null>(null);
  const destTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSavedDests(getSavedDestinations());
  }, []);

  useEffect(() => {
    if (origin) {
      setOriginText(origin.name);
    }
  }, [origin]);

  useEffect(() => {
    if (dest) {
      setDestText(dest.name);
      const saved = getSavedDestinations();
      setIsDestSaved(saved.some((d) => d.name === dest.name));
    } else {
      setIsDestSaved(false);
    }
  }, [dest]);

  // Immediately sync typed text to parent state and auto-resolve best fuzzy coordinate match
  const handleOriginChange = (val: string) => {
    setOriginText(val);
    const trimmed = val.trim();
    if (!trimmed) {
      onOriginChange(null);
      setOriginSuggestions([]);
      return;
    }

    onOriginChange({
      name: trimmed,
      lat: 0,
      lng: 0,
      source: 'manual',
    });

    if (originTimer.current) clearTimeout(originTimer.current);
    originTimer.current = setTimeout(async () => {
      setLoadingOriginGeo(true);
      const res = await searchLocations(trimmed);
      setOriginSuggestions(res);
      if (res.length > 0) {
        // Automatically attach the closest fuzzy-matched coordinates so pressing Search never fails
        onOriginChange({
          name: trimmed,
          address: res[0].address || res[0].name,
          lat: res[0].lat,
          lng: res[0].lng,
          source: res[0].source,
        });
      }
      setLoadingOriginGeo(false);
    }, 200);
  };

  const handleDestChange = (val: string) => {
    setDestText(val);
    const trimmed = val.trim();
    if (!trimmed) {
      onDestChange(null);
      setDestSuggestions([]);
      return;
    }

    onDestChange({
      name: trimmed,
      lat: 0,
      lng: 0,
      source: 'manual',
    });

    if (destTimer.current) clearTimeout(destTimer.current);
    destTimer.current = setTimeout(async () => {
      setLoadingDestGeo(true);
      const res = await searchLocations(trimmed);
      setDestSuggestions(res);
      if (res.length > 0) {
        // Automatically attach the closest fuzzy-matched coordinates so pressing Search never fails
        onDestChange({
          name: trimmed,
          address: res[0].address || res[0].name,
          lat: res[0].lat,
          lng: res[0].lng,
          source: res[0].source,
        });
      }
      setLoadingDestGeo(false);
    }, 200);
  };

  const handleUseCurrentLocation = async () => {
    setLocatingGPS(true);
    try {
      const point = await getCurrentCoordinates();
      onOriginChange(point);
      setOriginText(point.name);
      setOriginSuggestions([]);
      onNotify('已成功取得目前 GPS 坐標');
    } catch (err: any) {
      onNotify(err.message || '無法取得定位，請檢查瀏覽器定位權限');
    } finally {
      setLocatingGPS(false);
    }
  };

  const handleSaveCurrentDest = async () => {
    const trimmed = destText.trim();
    if (!dest && !trimmed) {
      onNotify('請先輸入或選擇目的地');
      return;
    }

    let targetDest = dest && dest.lat && dest.lng ? dest : null;
    if (!targetDest) {
      const found = await searchLocations(trimmed || dest?.name || '');
      if (found.length > 0) {
        targetDest = found[0];
        onDestChange(targetDest);
        setDestText(targetDest.name);
      } else {
        onNotify(`找不到「${trimmed}」的坐標，請輸入更詳細地址`);
        return;
      }
    }

    saveDestination(targetDest);
    setSavedDests(getSavedDestinations());
    setIsDestSaved(true);
    setDestSuggestions([]);
    onNotify(`已成功儲存常用目的地：「${targetDest.name}」`);
  };

  const handleSwap = () => {
    const tempOrigin = origin;
    const tempOriginText = originText;
    onOriginChange(dest);
    setOriginText(destText);
    onDestChange(tempOrigin);
    setDestText(tempOriginText);
    setOriginSuggestions([]);
    setDestSuggestions([]);
  };

  const handleLoadUserExample = () => {
    const exampleOrigin: LocationPoint = {
      name: '觀塘官立小學',
      address: '九龍觀塘牛頭角道240號 (近牛頭角下邨)',
      lat: 22.31632,
      lng: 114.21788,
      source: 'preset',
    };
    const exampleDest: LocationPoint = {
      name: '九龍灣學生健康服務中心',
      address: '九龍九龍灣啟仁街9號九龍灣健康中心 (近啟業邨 / 麗晶花園)',
      lat: 22.32835,
      lng: 114.20825,
      source: 'preset',
    };

    onOriginChange(exampleOrigin);
    setOriginText(exampleOrigin.name);
    setOriginSuggestions([]);

    onDestChange(exampleDest);
    setDestText(exampleDest.name);
    setDestSuggestions([]);

    onNotify('已載入真實坐標：「觀塘官立小學 (牛頭角道240號)」➔「九龍灣學生健康服務中心」');
  };

  const handleTriggerSearch = () => {
    setOriginSuggestions([]);
    setDestSuggestions([]);
    onExecuteSearch();
  };

  return (
    <div className="space-y-4 pb-24 max-w-lg mx-auto">
      {/* Header Banner with Real Open Data Status */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-4 shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold tracking-wider text-blue-200 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              {isSyncingDb
                ? '正在下載全港運輸署開放數據...'
                : totalSyncedRoutes > 100
                ? `已載入全港真實路線庫 (${totalSyncedRoutes} 條路線)`
                : '香港政府開放數據直連'}
            </span>
            <button
              onClick={handleLoadUserExample}
              className="flex items-center gap-1 text-xs bg-white/15 hover:bg-white/25 active:scale-95 text-yellow-300 font-medium px-2.5 py-1 rounded-lg transition shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              載入觀塘官小範例
            </button>
          </div>
          <h2 className="text-lg font-bold mt-1.5 text-white">真實途經路線與實時到站查詢</h2>
          <p className="text-xs text-blue-100/90 mt-1 leading-relaxed">
            可輸入街道、大廈、屋邨或學校（例如：堡壘街、嘉華洋樓、觀塘官立小學），搜尋前自動轉換為坐標。
          </p>
        </div>
      </div>

      {/* Input Form Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm relative">
        <div className="space-y-3">
          {/* Origin Input */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                出發地點
              </label>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locatingGPS}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline active:opacity-70 disabled:opacity-50"
              >
                {locatingGPS ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    定位中...
                  </>
                ) : (
                  <>
                    <Navigation className="w-3.5 h-3.5" />
                    使用目前位置 (GPS)
                  </>
                )}
              </button>
            </div>

            <div className="relative flex items-center">
              <input
                type="text"
                value={originText}
                onChange={(e) => handleOriginChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTriggerSearch();
                }}
                placeholder="輸入街道、大廈或地標 (例如：堡壘街 / 嘉華洋樓)"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white pr-8"
              />
              {loadingOriginGeo && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute right-8" />
              )}
              {originText && (
                <button
                  type="button"
                  onClick={() => {
                    setOriginText('');
                    onOriginChange(null);
                    setOriginSuggestions([]);
                  }}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Resolved Origin Address & Coordinate Readout */}
            {origin && origin.lat !== 0 && origin.lng !== 0 ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 px-1 flex items-center justify-between">
                <span className="truncate">{origin.address || origin.name}</span>
                <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">
                  已定位 ({origin.lat.toFixed(4)}, {origin.lng.toFixed(4)})
                </span>
              </p>
            ) : originText.trim() ? (
              <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-1 px-1">
                可從下方點選建議地址，或直接按「搜尋」自動轉換坐標
              </p>
            ) : null}

            {/* Origin Autocomplete List */}
            {originSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                {originSuggestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onOriginChange(item);
                      setOriginText(item.name);
                      setOriginSuggestions([]);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50 dark:hover:bg-slate-700/70 transition flex items-start gap-2.5"
                  >
                    <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.name}
                      </p>
                      {item.address && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          {item.address}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Swap Button */}
          <div className="flex justify-center -my-1 relative z-10">
            <button
              type="button"
              onClick={handleSwap}
              className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shadow-xs active:scale-95 transition"
              title="對調出發地與目的地"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Destination Input with Bookmark Save Button */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-600 inline-block" />
                目的地
              </label>
              <span className="text-[11px] text-slate-400">OGCIO / 地政總署地址查詢</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 flex items-center">
                <input
                  type="text"
                  value={destText}
                  onChange={(e) => handleDestChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTriggerSearch();
                  }}
                  placeholder="輸入街道、大廈或地標 (例如：九龍灣學生健康服務中心)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white pr-8"
                />
                {loadingDestGeo && (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute right-8" />
                )}
                {destText && (
                  <button
                    type="button"
                    onClick={() => {
                      setDestText('');
                      onDestChange(null);
                      setDestSuggestions([]);
                    }}
                    className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Bookmark Save Button on the Right */}
              <button
                type="button"
                onClick={handleSaveCurrentDest}
                title="儲存常用目的地"
                className={`min-h-[44px] px-3 rounded-xl border flex items-center justify-center transition-all ${
                  isDestSaved
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-600 dark:text-amber-400'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                {isDestSaved ? (
                  <BookmarkCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <BookmarkPlus className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Resolved Destination Address & Coordinate Readout */}
            {dest && dest.lat !== 0 && dest.lng !== 0 ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 px-1 flex items-center justify-between">
                <span className="truncate">{dest.address || dest.name}</span>
                <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">
                  已定位 ({dest.lat.toFixed(4)}, {dest.lng.toFixed(4)})
                </span>
              </p>
            ) : destText.trim() ? (
              <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-1 px-1">
                可從下方點選建議地址，或直接按「搜尋」自動轉換坐標
              </p>
            ) : null}

            {/* Destination Autocomplete List */}
            {destSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                {destSuggestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onDestChange(item);
                      setDestText(item.name);
                      setDestSuggestions([]);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50 dark:hover:bg-slate-700/70 transition flex items-start gap-2.5"
                  >
                    <MapPin className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.name}
                      </p>
                      {item.address && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          {item.address}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search Radius Segmented Controller */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              車站搜尋範圍 (步行距離)
            </span>
            <span className="text-[11px] text-slate-400">
              若直達車太少，自動擴大一次
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            {[350, 500, 800].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRadiusChange(r)}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  radius === r
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {r} 米 {r === 350 ? '(預設)' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Saved Destinations Chips */}
      {savedDests.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
            常用目的地快捷點選
          </span>
          <div className="flex flex-wrap gap-1.5">
            {savedDests.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  const pt: LocationPoint = {
                    name: d.name,
                    address: d.address,
                    lat: d.lat,
                    lng: d.lng,
                    source: 'preset',
                  };
                  onDestChange(pt);
                  setDestText(d.name);
                  setDestSuggestions([]);
                }}
                className={`px-3 py-1.5 text-xs rounded-xl border transition-all text-left flex items-center gap-1.5 ${
                  dest?.name === d.name
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <MapPin className="w-3 h-3 text-slate-400" />
                <span className="truncate max-w-[160px]">{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Primary Action Button */}
      <button
        type="button"
        onClick={handleTriggerSearch}
        disabled={isSearching}
        className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
      >
        {isSearching ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>正在轉換坐標並檢索真實路線...</span>
          </>
        ) : (
          <>
            <Search className="w-5 h-5" />
            <span>搜尋直達與途經路線</span>
          </>
        )}
      </button>
    </div>
  );
};
