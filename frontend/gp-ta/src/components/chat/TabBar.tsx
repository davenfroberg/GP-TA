import type { ChatTab } from "../../types/chat";
import { MAX_NUMBER_OF_TABS } from "../../constants/chat";
import { Bell, Settings } from "lucide-react";

// Tab Bar Component
interface TabBarProps {
  tabs: ChatTab[];
  activeTabId: number;
  editingTab: {id: number, title: string} | null;
  onTabClick: (id: number) => void;
  onTabDoubleClick: (id: number, title: string) => void;
  onTabClose: (id: number) => void;
  onTabTitleSave: (id: number, title: string) => void;
  onTabTitleCancel: () => void;
  onTabTitleChange: (title: string) => void;
  onNewTab: () => void;
  onNotificationsClick: () => void;
  hasUnseenNotifications: boolean;
  onSettingsClick: () => void;
  themeClasses: any;
  deletingTabs: Set<number>;
}

export default function TabBar({
  tabs,
  activeTabId,
  editingTab,
  onTabClick,
  onTabDoubleClick,
  onTabClose,
  onTabTitleSave,
  onTabTitleCancel,
  onTabTitleChange,
  onNewTab,
  onNotificationsClick,
  hasUnseenNotifications,
  onSettingsClick,
  themeClasses,
  deletingTabs
}: TabBarProps) {
  const isDark = themeClasses.inactiveTab.includes('text-slate-300');

  return (
    <div className={`flex items-center ${themeClasses.tabBar} rounded-2xl overflow-x-auto select-none`}>
      {/* GP-TA Logo */}
      <div className={`px-2 h-6 mr-2 ml-3 flex items-center justify-center ${themeClasses.logo} rounded-full text-xs font-bold text-white select-none`}>
        GP-TA
      </div>
      <div className="flex items-center">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center group px-3 py-2.5 text-sm select-none ${
              activeTabId === tab.id
                ? themeClasses.activeTab
                : themeClasses.inactiveTab
            } rounded-sm`}
            onClick={() => onTabClick(tab.id)}
            onDoubleClick={() => onTabDoubleClick(tab.id, tab.title)}
          >
            {editingTab?.id === tab.id ? (
              <input
                value={editingTab.title}
                autoFocus
                onChange={(e) => onTabTitleChange(e.target.value)}
                onBlur={() => onTabTitleSave(tab.id, editingTab.title)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onTabTitleSave(tab.id, editingTab.title);
                  if (e.key === "Escape") onTabTitleCancel();
                }}
                className={`${themeClasses.editInput} rounded text-sm outline-none`}
              />
            ) : (
              <span>{tab.title}</span>
            )}
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!deletingTabs.has(tab.id)) {
                    onTabClose(tab.id);
                  }
                }}
                className={`ml-3 px-2 py-0.5 -m-1 rounded-sm ${themeClasses.closeButton} flex items-center justify-center ${
                  deletingTabs.has(tab.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                } ${deletingTabs.has(tab.id) ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                disabled={deletingTabs.has(tab.id)}
              >
                {deletingTabs.has(tab.id) ? (
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  "×"
                )}
              </button>
            )}
          </div>
        ))}
        {tabs.length < MAX_NUMBER_OF_TABS && (
          <button
            onClick={onNewTab}
            className={`px-4 py-2 ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-700 cursor-pointer'}`}
          >
            +
          </button>
        )}
      </div>

      {/* Spacer to push notifications button to the right */}
      <div className="flex-1"></div>

      {/* Notifications Button */}
      <button
        onClick={onNotificationsClick}
        className={`px-3 py-2 mr-2 relative ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'} transition-colors cursor-pointer`}
        title="View followed topics"
      >
        <Bell className="w-4 h-4" />
        {hasUnseenNotifications && (
          <span className="absolute top-1.5 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
        )}
      </button>

      {/* Settings Button */}
      <button
        onClick={onSettingsClick}
        className={`px-3 py-2 mr-1 ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-800'} transition-colors cursor-pointer`}
        title="Settings"
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  );
}
