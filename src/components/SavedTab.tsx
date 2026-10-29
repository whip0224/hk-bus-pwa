import React, { useState, useEffect } from 'react';
import {
  Bookmark,
  Edit2,
  Trash2,
  DownloadCloud,
  Check,
  CheckCircle2,
  ArrowRight,
  MapPin,
  Smartphone,
  Layers,
  Settings2,
  Loader2,
} from 'lucide-react';
import { SavedTrip, SavedDestination, MapAppPreference } from '../types/transit';
import {
  getSavedTrips,
  renameTrip,
  deleteTrip,
  getSavedDestinations,
  deleteDestination,
  getOfflineDbInfo,
  OfflineDbInfo,
} from '../services/storageService';
import { syncRealTransitDatabase } from '../services/openDataSync';
import { PWAInstallGuide } from './PWAInstallGuide';

interface SavedTabProps {
  onSelectTrip: (trip: SavedTrip) => void;
  mapPref: MapAppPreference;
  onMapPrefChange: (pref: MapAppPreference) => void;
  onDbSynced: (routesCount: number) => void;
  onNotify: (msg: string) => void;
}

export const SavedTab: React.FC<SavedTabProps> = ({
  onSelectTrip,
  mapPref,
  onMapPrefChange,
  onDbSynced,
  onNotify,
}) => {
  const [trips, setTrips] = useState<SavedTrip[]>(getSavedTrips());
  const [destinations, setDestinations] = useState<SavedDestination[]>(getSavedDestinations());
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editNameText, setEditNameText] = useState('');
  const [dbInfo, setDbInfo] = useState<OfflineDbInfo>(getOfflineDbInfo());
  const [isUpdatingDb, setIsUpdatingDb] = useState(false);
  const [syncProgressMsg, setSyncProgressMsg] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState(false);

  useEffect(() => {
    setDbInfo(getOfflineDbInfo());
  }, []);

  const handleStartRename = (trip: SavedTrip) => {
    setEditingTripId(trip.id);
    setEditNameText(trip.customName);
  };

  const handleSaveRename = (tripId: string) => {
    const trimmed = editNameText.trim();
    if (!trimmed) return;
    renameTrip(tripId, trimmed);
    setTrips(getSavedTrips());
    setEditingTripId(null);
    onNotify('已更新常用路線名稱');
  };

  const handleDeleteTrip = (tripId: string) => {
    deleteTrip(tripId);
    setTrips(getSavedTrips());
    onNotify('已刪除常用路線');
  };

  const handleDeleteDest = (destId: string) => {
    deleteDestination(destId);
    setDestinations(getSavedDestinations());
    onNotify('已刪除常用目的地');
  };

  // Download / Update Real Full HK Open Data Database to IndexedDB
  const handleDownloadFullDatabase = async () => {
    setIsUpdatingDb(true);
    setSyncProgressMsg('正在從香港開放數據下載完整路線及車站資料...');
    try {
      const routes = await syncRealTransitDatabase(true, (msg) => setSyncProgressMsg(msg));
      setDbInfo(getOfflineDbInfo());
      onDbSynced(routes.length);
      setUpdateSuccess(true);
      onNotify(`已成功下載並快取 ${routes.length} 條全港真實路線至手機！`);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch {
      onNotify('下載更新時網絡異常，已保留現有快取資料');
    } finally {
      setIsUpdatingDb(false);
      setSyncProgressMsg('');
    }
  };

  return (
    <div className="space-y-5 pb-24 max-w-lg mx-auto">
      {/* 1. 常用路線清單 (可自訂改名，如「回家」) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-blue-600" />
            常用路線行程 ({trips.length})
          </h3>
          <span className="text-[11px] text-slate-400">點選立即查詢最新到站</span>
        </div>

        {trips.length > 0 ? (
          <div className="space-y-2">
            {trips.map((trip) => (
              <div
                key={trip.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-xs"
              >
                {editingTripId === trip.id ? (
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={editNameText}
                      onChange={(e) => setEditNameText(e.target.value)}
                      placeholder="輸入自訂別名 (例如：回家、返工)"
                      className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveRename(trip.id)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                    >
                      儲存
                    </button>
                    <button
                      onClick={() => setEditingTripId(null)}
                      className="px-2 py-1.5 text-slate-400 text-xs hover:text-slate-600"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                      {trip.customName}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartRename(trip)}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="手動改名"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTrip(trip.id)}
                        className="p-1 text-slate-400 hover:text-red-600"
                        title="刪除行程"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="truncate max-w-[130px] font-medium">{trip.origin.name}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <span className="truncate max-w-[130px] font-medium">{trip.dest.name}</span>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">預設半徑：{trip.radius} 米</span>
                  <button
                    onClick={() => onSelectTrip(trip)}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 active:scale-95 transition"
                  >
                    <span>啟動即時搜尋</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 text-xs">
            尚未儲存任何行程。在搜尋結果頁面點擊「儲存行程」即可在此管理並自訂名稱（例如：回家、返學）。
          </div>
        )}
      </div>

      {/* 2. 常用目的地列表 */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 px-1">
          <MapPin className="w-4 h-4 text-red-500" />
          常用目的地地標 ({destinations.length})
        </h3>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {destinations.map((d) => (
            <div key={d.id} className="p-3 flex items-center justify-between gap-2">
              <div className="truncate">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {d.name}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{d.address}</p>
              </div>
              <button
                onClick={() => handleDeleteDest(d.id)}
                className="p-1 text-slate-400 hover:text-red-500 flex-shrink-0"
                title="刪除此目的地"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 地圖導航偏好設定 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              預設地圖導航工具
            </h4>
          </div>
          <span className="text-[11px] text-slate-400">已自動記憶偏好</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          點擊「導航至出發站」時使用運輸署官方真實車站坐標導航，並採用安全跳轉防止 iPhone 返回白屏。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              onMapPrefChange('google');
              onNotify('已切換預設導航為 Google Maps');
            }}
            className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
              mapPref === 'google'
                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-700 dark:text-blue-300 font-semibold'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div>
              <p className="text-xs font-bold">Google Maps</p>
              <p className="text-[10px] text-slate-400">精準車站坐標步行導航</p>
            </div>
            {mapPref === 'google' && <Check className="w-4 h-4 text-blue-600" />}
          </button>

          <button
            onClick={() => {
              onMapPrefChange('apple');
              onNotify('已切換預設導航為 Apple 原生地圖');
            }}
            className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
              mapPref === 'apple'
                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-700 dark:text-blue-300 font-semibold'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div>
              <p className="text-xs font-bold">Apple 地圖</p>
              <p className="text-[10px] text-slate-400">iOS 原生協議呼叫</p>
            </div>
            {mapPref === 'apple' && <Check className="w-4 h-4 text-blue-600" />}
          </button>
        </div>
      </div>

      {/* 4. 離線資料下載與更新 (真實全港路線資料庫儲存到手機 IndexedDB) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              全港真實路線資料庫 (儲存在手機 IndexedDB)
            </h4>
          </div>
          <span className="text-[11px] font-mono text-slate-400">{dbInfo.version}</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          包含九巴、城巴、綠色專線小巴、新大嶼山巴士及港鐵巴士之完整路線與車站真實 WGS84 坐標。
        </p>

        <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl text-slate-600 dark:text-slate-300">
          <div>
            <div>狀態：{dbInfo.lastUpdated}</div>
            {dbInfo.totalRoutes > 0 && (
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                已儲存 {dbInfo.totalRoutes} 條路線 · {dbInfo.totalStops} 個車站
              </div>
            )}
          </div>
          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
            ● 已同步
          </span>
        </div>

        <button
          onClick={handleDownloadFullDatabase}
          disabled={isUpdatingDb}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
        >
          {isUpdatingDb ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{syncProgressMsg || '正在下載最新全港路線資料...'}</span>
            </>
          ) : updateSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>已更新至最新全港真實路線資料</span>
            </>
          ) : (
            <>
              <DownloadCloud className="w-4 h-4" />
              <span>手動更新 / 重新下載完整路線資料檔案</span>
            </>
          )}
        </button>
      </div>

      {/* 5. iPhone PWA 安裝指南與強制更新 */}
      <div className="bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl border border-blue-200/60 dark:border-blue-900/40 p-4 space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h4 className="text-xs font-bold text-blue-900 dark:text-blue-200">
              iPhone PWA 體驗優化與版本刷新
            </h4>
          </div>
          <p className="text-xs text-blue-800/80 dark:text-blue-300/80 leading-relaxed">
            若電腦顯示正常但手機仍顯示舊版畫面或舊資料（因 iPhone PWA 會快取舊版程式），可點擊下方按鈕強制拉取最新版本。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PWAInstallGuide />
          <button
            type="button"
            onClick={async () => {
              onNotify('正在清除舊版 PWA 快取並更新至最新版本...');
              try {
                if ('serviceWorker' in navigator) {
                  const regs = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(regs.map((r) => r.unregister()));
                }
                if ('caches' in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map((k) => caches.delete(k)));
                }
              } catch {
                // ignore
              }
              window.location.reload();
            }}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition active:scale-95"
          >
            強制更新至最新 App 版本
          </button>
        </div>
      </div>
    </div>
  );
};
