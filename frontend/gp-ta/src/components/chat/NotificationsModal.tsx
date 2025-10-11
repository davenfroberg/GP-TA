import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";

interface Notification {
  id: string;
  query: string;
  course_name: string;
}

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeClasses: any;
  onNotificationsUpdate: () => void;
  loading: boolean;
}

export default function NotificationsModal({ isOpen, onClose, themeClasses, onNotificationsUpdate, loading }: NotificationsModalProps) {
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('gp-ta-notifications');
      setNotifications(stored ? JSON.parse(stored) : []);
    }
  }, [isOpen]);


  const handleDelete = async (notificationId: string) => {
    setDeletingIds(prev => new Set(prev).add(notificationId));

    try {
      // Load fresh data from localStorage first
      const currentNotifications = JSON.parse(localStorage.getItem('gp-ta-notifications') || '[]');
      const notification = currentNotifications.find((n: Notification) => n.id === notificationId);
      if (!notification) {
        setDeletingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(notificationId);
          return newSet;
        });
        return;
      }

      const url = new URL(`https://${import.meta.env.VITE_PIAZZA_POST_ID}.execute-api.us-west-2.amazonaws.com/prod/notify`);
      url.searchParams.append('user_query', notification.query);
      url.searchParams.append('course_display_name', notification.course_name);

      await fetch(url.toString(), { method: 'DELETE' });

      // Update localStorage with fresh read
      const freshNotifications = JSON.parse(localStorage.getItem('gp-ta-notifications') || '[]');
      const updatedNotifications = freshNotifications.filter((n: Notification) => n.id !== notificationId);
      localStorage.setItem('gp-ta-notifications', JSON.stringify(updatedNotifications));
      
      // Update local state from localStorage
      setNotifications(updatedNotifications);
      
      // Notify parent to refresh its state
      onNotificationsUpdate();
    } catch (error) {
      console.error("Error deleting notification:", error);
    } finally {
      setDeletingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(notificationId);
        return newSet;
      });
    }
  };

  // Group notifications by course
  const notificationsByCourse = notifications.reduce((acc, notification) => {
    if (!acc[notification.course_name]) {
      acc[notification.course_name] = [];
    }
    acc[notification.course_name].push(notification);
    return acc;
  }, {} as Record<string, Notification[]>);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`relative w-full max-w-2xl max-h-[80vh] rounded-2xl ${themeClasses.frostedPopup} overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Notifications</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${themeClasses.closeButton} cursor-pointer`}
          >
            <X className="w-5 h-5 " />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg opacity-60">No notifications active</p>
              <p className="text-sm opacity-40 mt-2">
                Create a notification by following the prompt after asking a question that has insufficient Piazza context.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(notificationsByCourse).map(([courseName, courseNotifications]) => (
                <div key={courseName}>
                  <h3 className="text-lg font-semibold mb-3 opacity-80">{courseName}</h3>
                  <div className="space-y-2">
                    {courseNotifications.map(notification => (
                      <div
                        key={notification.id}
                        className={`p-4 rounded-lg ${themeClasses.assistantBubble} border flex items-start justify-between gap-3`}
                      >
                        <div className="flex-1">
                          <p className="text-sm">{notification.query}</p>
                        </div>
                        <button
                          onClick={() => handleDelete(notification.id)}
                          disabled={deletingIds.has(notification.id)}
                          className={`p-1.5 rounded transition-colors flex-shrink-0 ${
                            deletingIds.has(notification.id) 
                              ? 'opacity-50 cursor-not-allowed' 
                              : themeClasses.closeButton
                          }`}
                          title="Delete notification"
                        >
                          {deletingIds.has(notification.id) ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}