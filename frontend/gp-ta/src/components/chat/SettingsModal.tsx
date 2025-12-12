import { useState } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
  themeClasses: any;
}

type SettingCategory = 'general' | 'appearance' | 'notifications' | 'account';

export default function SettingsModal({ isOpen, onClose, onSignOut, themeClasses }: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = useState<SettingCategory>('general');

  if (!isOpen) return null;

  const isDark = themeClasses.inactiveTab?.includes('text-slate-300');

  const categories: { id: SettingCategory; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'account', label: 'Account' },
  ];

  const renderSettingContent = () => {
    switch (activeCategory) {
      case 'general':
        return (
          <div className="space-y-6">
            <div>
              <h3 className={`text-lg font-semibold ${themeClasses.label} mb-4`}>General Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${themeClasses.label} font-medium`}>Auto-save chats</p>
                    <p className={`${themeClasses.footer} text-xs mt-1`}>Automatically save your chat history</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className={`w-11 h-6 rounded-full peer ${isDark ? 'bg-slate-600' : 'bg-gray-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-blue-600'}`}></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${themeClasses.label} font-medium`}>Show typing indicator</p>
                    <p className={`${themeClasses.footer} text-xs mt-1`}>Display when AI is typing</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className={`w-11 h-6 rounded-full peer ${isDark ? 'bg-slate-600' : 'bg-gray-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-blue-600'}`}></div>
                  </label>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
                    Default chat mode
                  </label>
                  <select className={`w-full px-3 py-2 rounded-lg text-sm ${themeClasses.select}`}>
                    <option>Standard</option>
                    <option>Detailed</option>
                    <option>Concise</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className={`text-lg font-semibold ${themeClasses.label} mb-4`}>Appearance</h3>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
                    Theme
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button className={`px-4 py-3 rounded-lg border-2 ${isDark ? 'border-blue-500 bg-blue-500/20' : 'border-blue-500 bg-blue-50'} ${themeClasses.label} font-medium`}>
                      Dark
                    </button>
                    <button className={`px-4 py-3 rounded-lg border-2 ${!isDark ? 'border-blue-500 bg-blue-500/20' : 'border-transparent'} ${themeClasses.inputContainer} ${themeClasses.label} font-medium`}>
                      Light
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
                    Font size
                  </label>
                  <select className={`w-full px-3 py-2 rounded-lg text-sm ${themeClasses.select}`}>
                    <option>Small</option>
                    <option>Medium</option>
                    <option>Large</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${themeClasses.label} font-medium`}>Compact mode</p>
                    <p className={`${themeClasses.footer} text-xs mt-1`}>Reduce spacing in chat</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className={`w-11 h-6 rounded-full peer ${isDark ? 'bg-slate-600' : 'bg-gray-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-blue-600'}`}></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <h3 className={`text-lg font-semibold ${themeClasses.label} mb-4`}>Notifications</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${themeClasses.label} font-medium`}>Email notifications</p>
                    <p className={`${themeClasses.footer} text-xs mt-1`}>Receive updates via email</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className={`w-11 h-6 rounded-full peer ${isDark ? 'bg-slate-600' : 'bg-gray-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-blue-600'}`}></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${themeClasses.label} font-medium`}>Browser notifications</p>
                    <p className={`${themeClasses.footer} text-xs mt-1`}>Show desktop notifications</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className={`w-11 h-6 rounded-full peer ${isDark ? 'bg-slate-600' : 'bg-gray-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-blue-600'}`}></div>
                  </label>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
                    Notification frequency
                  </label>
                  <select className={`w-full px-3 py-2 rounded-lg text-sm ${themeClasses.select}`}>
                    <option>Real-time</option>
                    <option>Hourly digest</option>
                    <option>Daily digest</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case 'account':
        return (
          <div className="space-y-6">
            <div>
              <h3 className={`text-lg font-semibold ${themeClasses.label} mb-4`}>Account</h3>
              <div className="space-y-4">
                <div className="pb-2">
                  <p className={`text-xl font-semibold ${themeClasses.label}`}>Daven Froberg</p>
                  <p className={`text-sm ${themeClasses.footer} mt-1`}>Premium tier</p>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="your.email@example.com"
                    className={`w-full px-3 py-2 rounded-lg text-sm ${themeClasses.textarea}`}
                    disabled
                  />
                  <p className={`${themeClasses.footer} text-xs mt-1`}>Email cannot be changed</p>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
                    Display name
                  </label>
                  <input
                    type="text"
                    placeholder="Your name"
                    className={`w-full px-3 py-2 rounded-lg text-sm ${themeClasses.textarea}`}
                  />
                </div>
                <div className={`pt-4 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                  <p className={`${themeClasses.label} font-medium mb-2`}>Danger Zone</p>
                  <p className={`${themeClasses.footer} text-xs mb-4`}>Irreversible and destructive actions</p>
                  <button
                    onClick={onSignOut}
                    className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium ${isDark ? 'bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400' : 'bg-red-50 hover:bg-red-100 border border-red-300 text-red-600'} transition-colors cursor-pointer`}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <style>{`
        .settings-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .settings-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .settings-scrollbar::-webkit-scrollbar-thumb {
          ${isDark
            ? 'background: rgba(255, 255, 255, 0.2);'
            : 'background: rgba(0, 0, 0, 0.2);'
          }
          border-radius: 4px;
        }
        .settings-scrollbar::-webkit-scrollbar-thumb:hover {
          ${isDark
            ? 'background: rgba(255, 255, 255, 0.3);'
            : 'background: rgba(0, 0, 0, 0.3);'
          }
        }
        /* Firefox */
        .settings-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: ${isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'} transparent;
        }
      `}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className={`w-full max-w-3xl h-[65vh] rounded-2xl ${themeClasses.frostedPopup} overflow-hidden flex flex-col`}>
          {/* Header */}
          <div className={`flex items-center justify-between p-6 border-b flex-shrink-0 ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
            <h2 className={`text-xl font-semibold ${themeClasses.label}`}>Settings</h2>
            <button
              onClick={onClose}
              className={`${themeClasses.closeButton} rounded-lg p-2 cursor-pointer`}
              title="Close settings"
            >
              <span className="text-xl">×</span>
            </button>
          </div>

          {/* Content */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Sidebar */}
            <div className={`w-48 border-r flex-shrink-0 overflow-y-auto settings-scrollbar ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50/50'}`}>
              <nav className="p-4 space-y-1">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      activeCategory === category.id
                        ? `${themeClasses.activeTab}`
                        : `${themeClasses.inactiveTab}`
                    }`}
                  >
                    <span>{category.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Main content */}
            <div className={`flex-1 overflow-y-auto p-6 min-w-0 settings-scrollbar`}>
              {renderSettingContent()}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

