import React from 'react';
import { Search, Compass, Bookmark } from 'lucide-react';

export type ActiveTab = 'search' | 'results' | 'saved';

interface TabNavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  hasResults: boolean;
  savedCount: number;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
  hasResults,
  savedCount,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="max-w-md mx-auto grid grid-cols-3 h-16 items-center px-2">
        {/* Tab 1: 路線搜尋 */}
        <button
          onClick={() => onTabChange('search')}
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors ${
            activeTab === 'search'
              ? 'text-blue-600 dark:text-blue-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Search className={`w-5 h-5 ${activeTab === 'search' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[11px] mt-1 tracking-tight">路線搜尋</span>
        </button>

        {/* Tab 2: 搜尋結果與到站 */}
        <button
          onClick={() => onTabChange('results')}
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors relative ${
            activeTab === 'results'
              ? 'text-blue-600 dark:text-blue-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Compass className={`w-5 h-5 ${activeTab === 'results' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {hasResults && (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-900" />
            )}
          </div>
          <span className="text-[11px] mt-1 tracking-tight">搜尋結果</span>
        </button>

        {/* Tab 3: 常用與設定 */}
        <button
          onClick={() => onTabChange('saved')}
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors relative ${
            activeTab === 'saved'
              ? 'text-blue-600 dark:text-blue-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Bookmark className={`w-5 h-5 ${activeTab === 'saved' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {savedCount > 0 && (
              <span className="absolute -top-1 -right-2 text-[10px] font-mono px-1 min-w-[14px] h-[14px] leading-tight rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                {savedCount}
              </span>
            )}
          </div>
          <span className="text-[11px] mt-1 tracking-tight">常用資訊</span>
        </button>
      </div>
    </nav>
  );
};
