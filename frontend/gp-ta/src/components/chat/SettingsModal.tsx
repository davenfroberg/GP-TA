interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
  themeClasses: any;
}

export default function SettingsModal({ isOpen, onClose, onSignOut, themeClasses }: SettingsModalProps) {
  if (!isOpen) return null;

  const isDark = themeClasses.inactiveTab?.includes('text-slate-300');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className={`w-full max-w-sm p-6 rounded-2xl ${themeClasses.frostedPopup} space-y-4`}>
        <div className="flex items-center justify-between">
          <h2 className={`text-lg font-semibold ${themeClasses.label}`}>Settings</h2>
          <button
            onClick={onClose}
            className={`${themeClasses.closeButton} rounded-full p-1 px-3 cursor-pointer`}
            title="Close settings"
          >
            ×
          </button>
        </div>
        <p className={`${themeClasses.footer}`}>Account actions</p>
        <div className="space-y-2">
          <button
            onClick={onSignOut}
            className="w-full py-3 px-4 rounded-xl text-sm font-semibold border border-red-800 bg-red-300/50 hover:bg-red-800 text-white transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

