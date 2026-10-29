import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share2, PlusSquare, X } from 'lucide-react';

export const PWAInstallGuide: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already standalone PWA, hide install prompt
  if (isInstalled) {
    return null;
  }

  return (
    <>
      {isInstallable && (
        <button
          onClick={install}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 active:scale-95 transition-transform"
        >
          <Download className="w-3.5 h-3.5" />
          <span>安裝 PWA</span>
        </button>
      )}

      {isIOS && !isInstallable && (
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900 rounded-lg hover:bg-blue-100 transition"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>加到 iPhone 主畫面</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                  <Download className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold">在 iPhone 上安裝 PWA</h3>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-sm">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center">
                  1
                </div>
                <div>
                  <p className="font-medium">在 Safari 瀏覽器底部工具列</p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    點擊「分享」按鈕 <Share2 className="w-3.5 h-3.5 text-blue-600 inline" />
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center">
                  2
                </div>
                <div>
                  <p className="font-medium">向下滑動選單並點選</p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    「加入主畫面」 <PlusSquare className="w-3.5 h-3.5 text-blue-600 inline" />
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center">
                  3
                </div>
                <div>
                  <p className="font-medium">點擊右上角「新增」</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    即可以獨立 App 形式全螢幕使用，離線與地圖導航無白屏切換！
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-xl bg-blue-600 text-white font-semibold py-2.5 text-sm shadow hover:bg-blue-700 active:scale-[0.98] transition"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
};
