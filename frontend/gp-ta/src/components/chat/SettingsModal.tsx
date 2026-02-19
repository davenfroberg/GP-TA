import { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
  themeClasses: any;
}

type SettingCategory = 'general' | 'appearance' | 'notifications' | 'account';

export default function SettingsModal({ isOpen, onClose, onSignOut, themeClasses }: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = useState<SettingCategory>('general');

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [isPremium, setIsPremium] = useState<boolean>(false);

  const [autoSaveChats, setAutoSaveChats] = useState<boolean>(true);
  const [showTypingIndicator, setShowTypingIndicator] = useState<boolean>(true);
  const [defaultChatMode, setDefaultChatMode] = useState<string>('Standard');

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [fontSize, setFontSize] = useState<string>('Medium');
  const [compactMode, setCompactMode] = useState<boolean>(false);

  const [emailNotifications, setEmailNotifications] = useState<boolean>(true);
  const [browserNotifications, setBrowserNotifications] = useState<boolean>(false);
  const [notificationFrequency, setNotificationFrequency] = useState<string>('Real-time');

  const [originalSettings, setOriginalSettings] = useState<{
    name: string;
    autoSaveChats: boolean;
    showTypingIndicator: boolean;
    defaultChatMode: string;
    theme: 'dark' | 'light';
    fontSize: string;
    compactMode: boolean;
    emailNotifications: boolean;
    browserNotifications: boolean;
    notificationFrequency: string;
  }>({
    name: '',
    autoSaveChats: true,
    showTypingIndicator: true,
    defaultChatMode: 'Standard',
    theme: 'dark',
    fontSize: 'Medium',
    compactMode: false,
    emailNotifications: true,
    browserNotifications: false,
    notificationFrequency: 'Real-time',
  });

  const [saving, setSaving] = useState<boolean>(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);

  const loadSettingsFromStorage = () => {
    try {
      const stored = localStorage.getItem('gp-ta-user-settings');
      if (stored) {
        const settings = JSON.parse(stored);
        setName(settings.name || '');
        setAutoSaveChats(settings.autoSaveChats !== undefined ? settings.autoSaveChats : true);
        setShowTypingIndicator(settings.showTypingIndicator !== undefined ? settings.showTypingIndicator : true);
        setDefaultChatMode(settings.defaultChatMode || 'Standard');
        setTheme(settings.theme === 'light' ? 'light' : 'dark');
        setFontSize(settings.fontSize || 'Medium');
        setCompactMode(settings.compactMode !== undefined ? settings.compactMode : false);
        setEmailNotifications(settings.emailNotifications !== undefined ? settings.emailNotifications : true);
        setBrowserNotifications(settings.browserNotifications !== undefined ? settings.browserNotifications : false);
        setNotificationFrequency(settings.notificationFrequency || 'Real-time');
        setEmail(settings.email || '');
        setIsPremium(settings.isPremium !== undefined ? settings.isPremium : false);

        setOriginalSettings({
          name: settings.name || '',
          autoSaveChats: settings.autoSaveChats !== undefined ? settings.autoSaveChats : true,
          showTypingIndicator: settings.showTypingIndicator !== undefined ? settings.showTypingIndicator : true,
          defaultChatMode: settings.defaultChatMode || 'Standard',
          theme: settings.theme === 'light' ? 'light' : 'dark',
          fontSize: settings.fontSize || 'Medium',
          compactMode: settings.compactMode !== undefined ? settings.compactMode : false,
          emailNotifications: settings.emailNotifications !== undefined ? settings.emailNotifications : true,
          browserNotifications: settings.browserNotifications !== undefined ? settings.browserNotifications : false,
          notificationFrequency: settings.notificationFrequency || 'Real-time',
        });
        return true;
      }
    } catch (error) {
      console.error('Error loading settings from localStorage:', error);
    }
    return false;
  };

  const saveSettingsToStorage = (data: any) => {
    try {
      const settings = {
        name: data.name || '',
        autoSaveChats: data.auto_save_chats !== undefined ? data.auto_save_chats : true,
        showTypingIndicator: data.show_typing_indicator !== undefined ? data.show_typing_indicator : true,
        defaultChatMode: data.default_chat_mode || 'Standard',
        theme: data.theme === 'light' ? 'light' : 'dark',
        fontSize: data.font_size || 'Medium',
        compactMode: data.compact_mode !== undefined ? data.compact_mode : false,
        emailNotifications: data.email_notifications !== undefined ? data.email_notifications : true,
        browserNotifications: data.browser_notifications !== undefined ? data.browser_notifications : false,
        notificationFrequency: data.notification_frequency || 'Real-time',
        email: data.email || '',
        isPremium: data.is_premium !== undefined ? data.is_premium : false,
      };
      localStorage.setItem('gp-ta-user-settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings to localStorage:', error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSettingsFromStorage();
    } else {
      setName('');
      setEmail('');
      setIsPremium(false);
      setAutoSaveChats(true);
      setShowTypingIndicator(true);
      setDefaultChatMode('Standard');
      setTheme('dark');
      setFontSize('Medium');
      setCompactMode(false);
      setEmailNotifications(true);
      setBrowserNotifications(false);
      setNotificationFrequency('Real-time');
      setOriginalSettings({
        name: '',
        autoSaveChats: true,
        showTypingIndicator: true,
        defaultChatMode: 'Standard',
        theme: 'dark',
        fontSize: 'Medium',
        compactMode: false,
        emailNotifications: true,
        browserNotifications: false,
        notificationFrequency: 'Real-time',
      });
      setShowConfirmDialog(false);
    }
  }, [isOpen]);

  const hasUnsavedChanges =
    name !== originalSettings.name ||
    autoSaveChats !== originalSettings.autoSaveChats ||
    showTypingIndicator !== originalSettings.showTypingIndicator ||
    defaultChatMode !== originalSettings.defaultChatMode ||
    theme !== originalSettings.theme ||
    fontSize !== originalSettings.fontSize ||
    compactMode !== originalSettings.compactMode ||
    emailNotifications !== originalSettings.emailNotifications ||
    browserNotifications !== originalSettings.browserNotifications ||
    notificationFrequency !== originalSettings.notificationFrequency;

  const handleSave = async (): Promise<boolean> => {
    if (!hasUnsavedChanges) return true;

    setSaving(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        console.error("No authentication token available");
        setSaving(false);
        return false;
      }

      const usersApiUrl = import.meta.env.VITE_USERS_API_URL || '';
      const apiUrl = `${usersApiUrl}/me`;

      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auto_save_chats: autoSaveChats,
          show_typing_indicator: showTypingIndicator,
          default_chat_mode: defaultChatMode,
          theme,
          font_size: fontSize,
          compact_mode: compactMode,
          email_notifications: emailNotifications,
          browser_notifications: browserNotifications,
          notification_frequency: notificationFrequency,
        }),
      });

      if (!response.ok) {
        console.error(`Save failed: ${response.status}`, await response.text());
        alert('Failed to save changes. Please try again.');
        setSaving(false);
        return false;
      }

      const savedSettings = {
        name,
        autoSaveChats,
        showTypingIndicator,
        defaultChatMode,
        theme,
        fontSize,
        compactMode,
        emailNotifications,
        browserNotifications,
        notificationFrequency,
      };

      setOriginalSettings(savedSettings);

      saveSettingsToStorage({
        name,
        auto_save_chats: autoSaveChats,
        show_typing_indicator: showTypingIndicator,
        default_chat_mode: defaultChatMode,
        theme,
        font_size: fontSize,
        compact_mode: compactMode,
        email_notifications: emailNotifications,
        browser_notifications: browserNotifications,
        notification_frequency: notificationFrequency,
        email,
        is_premium: isPremium,
      });

      setSaving(false);
      return true;
    } catch (error) {
      console.error('Error saving user data:', error);
      alert('Failed to save changes. Please try again.');
      setSaving(false);
      return false;
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowConfirmDialog(true);
    } else {
      onClose();
    }
  };

  const handleConfirmExit = () => {
    setName(originalSettings.name);
    setAutoSaveChats(originalSettings.autoSaveChats);
    setShowTypingIndicator(originalSettings.showTypingIndicator);
    setDefaultChatMode(originalSettings.defaultChatMode);
    setTheme(originalSettings.theme);
    setFontSize(originalSettings.fontSize);
    setCompactMode(originalSettings.compactMode);
    setEmailNotifications(originalSettings.emailNotifications);
    setBrowserNotifications(originalSettings.browserNotifications);
    setNotificationFrequency(originalSettings.notificationFrequency);
    setShowConfirmDialog(false);
    onClose();
  };

  const handleCancelExit = () => {
    setShowConfirmDialog(false);
  };

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
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={autoSaveChats}
                      onChange={(e) => setAutoSaveChats(e.target.checked)}
                    />
                    <div className={`w-11 h-6 rounded-full peer ${isDark ? 'bg-slate-600' : 'bg-gray-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-blue-600'} ${autoSaveChats ? (isDark ? 'bg-blue-600' : 'bg-blue-600') : ''}`}></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${themeClasses.label} font-medium`}>Show typing indicator</p>
                    <p className={`${themeClasses.footer} text-xs mt-1`}>Display when AI is typing</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={showTypingIndicator}
                      onChange={(e) => setShowTypingIndicator(e.target.checked)}
                    />
                    <div className={`w-11 h-6 rounded-full peer ${isDark ? 'bg-slate-600' : 'bg-gray-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-blue-600'} ${showTypingIndicator ? (isDark ? 'bg-blue-600' : 'bg-blue-600') : ''}`}></div>
                  </label>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
                    Default chat mode
                  </label>
                  <select
                    className={`w-full px-3 py-2 rounded-lg text-sm ${themeClasses.select}`}
                    value={defaultChatMode}
                    onChange={(e) => setDefaultChatMode(e.target.value)}
                  >
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
                    <button
                      onClick={() => setTheme('dark')}
                      className={`px-4 py-3 rounded-lg border-2 ${theme === 'dark' ? 'border-blue-500 bg-blue-500/20' : 'border-transparent'} ${themeClasses.inputContainer} ${themeClasses.label} font-medium`}
                    >
                      Dark
                    </button>
                    <button
                      onClick={() => setTheme('light')}
                      className={`px-4 py-3 rounded-lg border-2 ${theme === 'light' ? 'border-blue-500 bg-blue-500/20' : 'border-transparent'} ${themeClasses.inputContainer} ${themeClasses.label} font-medium`}
                    >
                      Light
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
                    Font size
                  </label>
                  <select
                    className={`w-full px-3 py-2 rounded-lg text-sm ${themeClasses.select}`}
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value)}
                  >
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
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={compactMode}
                      onChange={(e) => setCompactMode(e.target.checked)}
                    />
                    <div className={`w-11 h-6 rounded-full peer ${isDark ? 'bg-slate-600' : 'bg-gray-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-blue-600'} ${compactMode ? (isDark ? 'bg-blue-600' : 'bg-blue-600') : ''}`}></div>
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
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={emailNotifications}
                      onChange={(e) => setEmailNotifications(e.target.checked)}
                    />
                    <div className={`w-11 h-6 rounded-full peer ${isDark ? 'bg-slate-600' : 'bg-gray-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-blue-600'} ${emailNotifications ? (isDark ? 'bg-blue-600' : 'bg-blue-600') : ''}`}></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${themeClasses.label} font-medium`}>Browser notifications</p>
                    <p className={`${themeClasses.footer} text-xs mt-1`}>Show desktop notifications</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={browserNotifications}
                      onChange={(e) => setBrowserNotifications(e.target.checked)}
                    />
                    <div className={`w-11 h-6 rounded-full peer ${isDark ? 'bg-slate-600' : 'bg-gray-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-blue-600'} ${browserNotifications ? (isDark ? 'bg-blue-600' : 'bg-blue-600') : ''}`}></div>
                  </label>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
                    Notification frequency
                  </label>
                  <select
                    className={`w-full px-3 py-2 rounded-lg text-sm ${themeClasses.select}`}
                    value={notificationFrequency}
                    onChange={(e) => setNotificationFrequency(e.target.value)}
                  >
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
                  <p className={`text-xl font-semibold ${themeClasses.label}`}>{name || 'Loading...'}</p>
                  <p className={`text-sm ${themeClasses.footer} mt-1`}>{isPremium ? 'GP-TA Premium' : 'GP-TA Free'}</p>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    className={`w-full px-3 py-2 rounded-lg text-sm ${themeClasses.textarea}`}
                    disabled
                  />
                  <p className={`${themeClasses.footer} text-xs mt-1`}>Email cannot be changed</p>
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
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className={`w-full max-w-md rounded-2xl ${themeClasses.frostedPopup} p-6`}>
            <h3 className={`text-lg font-semibold ${themeClasses.label} mb-2`}>Unsaved Changes</h3>
            <p className={`${themeClasses.footer} mb-6`}>You have unsaved changes. Do you want to save them before closing?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelExit}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'} transition-colors cursor-pointer`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmExit}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-slate-600 hover:bg-slate-500 text-white' : 'bg-gray-300 hover:bg-gray-400 text-gray-900'} transition-colors cursor-pointer`}
              >
                Exit Without Saving
              </button>
              <button
                onClick={async () => {
                  const success = await handleSave();
                  if (success) {
                    setShowConfirmDialog(false);
                    onClose();
                  }
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} transition-colors cursor-pointer`}
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className={`w-full max-w-3xl h-[65vh] rounded-2xl ${themeClasses.frostedPopup} overflow-hidden flex flex-col`}>
          {/* Header */}
          <div className={`flex items-center justify-between p-6 border-b flex-shrink-0 ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
            <h2 className={`text-xl font-semibold ${themeClasses.label}`}>Settings</h2>
            <button
              onClick={handleClose}
              className={`${themeClasses.closeButton} rounded-lg p-2 cursor-pointer`}
              title="Close settings"
            >
              <span className="text-xl">×</span>
            </button>
          </div>

          {/* Unsaved Changes Banner */}
          {hasUnsavedChanges && (
            <div className={`px-6 py-3 border-b flex items-center justify-between ${isDark ? 'bg-yellow-600/20 border-yellow-600/30' : 'bg-yellow-50 border-yellow-200'}`}>
              <p className={`text-sm ${isDark ? 'text-yellow-200' : 'text-yellow-800'}`}>
                You have unsaved settings changes.
              </p>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  saving
                    ? 'opacity-50 cursor-not-allowed'
                    : isDark
                    ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                }`}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

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

