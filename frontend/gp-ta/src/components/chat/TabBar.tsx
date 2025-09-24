import type { ChatTab } from "../../types/chat";
import { MAX_NUMBER_OF_TABS } from "../../constants/chat";

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
  themeClasses: any;
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
  themeClasses
}: TabBarProps) {
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
                  onTabClose(tab.id);
                }}
                className={`ml-3 px-2 py-0.5 -m-1 opacity-0 group-hover:opacity-100 rounded-sm ${themeClasses.closeButton} cursor-pointer`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        
        {tabs.length < MAX_NUMBER_OF_TABS && (
          <button
            onClick={onNewTab}
            className={`px-4 py-2 ${themeClasses.inactiveTab.includes('text-slate-300') ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-700 cursor-pointer'}`}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}