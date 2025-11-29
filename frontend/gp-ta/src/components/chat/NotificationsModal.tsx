import { useState, useEffect, useRef } from "react";
import { Bell, X, Plus } from "lucide-react";
import { COURSES } from "../../constants/chat";
import type { Notification } from "../../types/chat";
import { motion, AnimatePresence } from "framer-motion";

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
  const notificationsRef = useRef<Notification[]>([]);
  const [newTopicQuery, setNewTopicQuery] = useState<string>("");
  const [newTopicCourse, setNewTopicCourse] = useState<string>(COURSES[0]);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isCreateView, setIsCreateView] = useState<boolean>(false);
  
  // Keep ref in sync with state
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem("gp-ta-notifications");
      const parsed = stored ? JSON.parse(stored) : [];
      // Ensure all notifications have IDs (API returns without IDs)
      const withIds = parsed.map((n: Notification) => {
        if (!n.id) {
          // Generate a stable ID based on query and course_name
          return {
            ...n,
            id: `${n.query}-${n.course_name}`.replace(/\s+/g, "-").toLowerCase(),
          };
        }
        return n;
      });
      setNotifications(withIds);
      // Update localStorage with IDs if we added any
      const needsIdUpdate = withIds.some((_: Notification, i: number) => !parsed[i]?.id);
      if (needsIdUpdate) {
        localStorage.setItem("gp-ta-notifications", JSON.stringify(withIds));
      }

      // Reset create view state when opening
      setIsCreateView(false);
      setNewTopicQuery("");
      setNewTopicCourse(COURSES[0]);
    }
  }, [isOpen]);

  const handleDelete = async (notificationId: string) => {
    setDeletingIds(prev => new Set(prev).add(notificationId));

    try {
      // Read from ref to get the latest notifications without triggering state updates
      const currentNotifications = notificationsRef.current;
      const notificationToDelete = currentNotifications.find((n: Notification) => n.id === notificationId);

      if (!notificationToDelete) {
        setDeletingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(notificationId);
          return newSet;
        });
        return;
      }

      const url = new URL(
        `https://${import.meta.env.VITE_PIAZZA_POST_ID}.execute-api.us-west-2.amazonaws.com/prod/notify`
      );
      url.searchParams.append("user_query", notificationToDelete.query);
      url.searchParams.append("course_display_name", notificationToDelete.course_name);

      const deleteResponse = await fetch(url.toString(), { method: "DELETE" });
      
      if (!deleteResponse.ok) {
        throw new Error(`Delete failed: ${deleteResponse.status}`);
      }

      // Update state - remove only the notification with the exact matching ID
      // Use functional update to ensure we're working with current state
      setNotifications(prev => {
        // Filter out only the notification with matching ID
        const updated = prev.filter((n: Notification) => {
          const shouldKeep = n.id !== notificationId;
          return shouldKeep;
        });
        
        // Only update localStorage if we actually removed something
        if (updated.length < prev.length) {
          localStorage.setItem("gp-ta-notifications", JSON.stringify(updated));
        } else {
          console.warn('No notification was removed - ID not found or already deleted');
        }
        
        return updated;
      });
      
      // Notify parent after state update is complete
      // Use requestAnimationFrame to ensure React has processed our state update
      requestAnimationFrame(() => {
        onNotificationsUpdate();
      });
    } catch (error) {
      console.error("Error deleting notification:", error);
      // On error, reload from localStorage to ensure consistency
      const stored = localStorage.getItem("gp-ta-notifications");
      setNotifications(stored ? JSON.parse(stored) : []);
    } finally {
      setDeletingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(notificationId);
        return newSet;
      });
    }
  };

  const handleCreate = async () => {
    const trimmedQuery = newTopicQuery.trim();
    if (!trimmedQuery || !newTopicCourse) {
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(
        `https://${import.meta.env.VITE_PIAZZA_POST_ID}.execute-api.us-west-2.amazonaws.com/prod/notify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_query: trimmedQuery,
            course_display_name: newTopicCourse,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const notificationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newNotification: Notification = {
        id: notificationId,
        query: trimmedQuery,
        course_name: newTopicCourse,
      };

      setNotifications((prev) => {
        const updated = [...prev, newNotification];
        localStorage.setItem("gp-ta-notifications", JSON.stringify(updated));
        return updated;
      });

      setNewTopicQuery("");

      // On successful creation, return to the list view
      setIsCreateView(false);

      // Notify parent after state update is complete
      requestAnimationFrame(() => {
        onNotificationsUpdate();
      });
    } catch (error) {
      console.error("Error creating notification:", error);
    } finally {
      setIsCreating(false);
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={`relative w-full max-w-2xl max-h-[80vh] rounded-2xl ${themeClasses.frostedPopup} overflow-hidden flex flex-col`}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
          >
            {/* Backdrop click catcher (use a full-screen overlay behind modal) */}
            <div
              className="absolute inset-0 -z-10"
              onClick={onClose}
            />
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6" />
            <h2 className="text-2xl font-bold">
              {isCreateView ? "New Followed Topic" : "Followed Topics"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!isCreateView && (
              <button
                onClick={() => setIsCreateView(true)}
                className={`p-2 rounded-lg transition-colors ${themeClasses.closeButton} cursor-pointer`}
                title="Add followed topic"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${themeClasses.closeButton} cursor-pointer`}
            >
              <X className="w-5 h-5 " />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current" />
            </div>
          ) : (
            <>
              {isCreateView ? (
                <div className="max-w-xl mx-auto">
                  <div className="flex justify-start mb-2">
                    <button
                      type="button"
                      onClick={() => setIsCreateView(false)}
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full border text-sm opacity-80 hover:opacity-100 hover:scale-105 transition-all ${themeClasses.assistantBubble}`}
                      title="Back to followed topics"
                    >
                      ←
                    </button>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <select
                        value={newTopicCourse}
                        onChange={(e) => setNewTopicCourse(e.target.value)}
                        className={`w-full sm:w-40 px-3 py-2 rounded-lg text-sm ${themeClasses.select}`}
                      >
                        {COURSES.map((course) => (
                          <option key={course} value={course}>
                            {course}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={newTopicQuery}
                        onChange={(e) => setNewTopicQuery(e.target.value)}
                        placeholder='Describe the topic you want to follow (e.g., "midterm logistics")'
                        className={`flex-1 px-3 py-2 rounded-lg text-sm ${themeClasses.textarea}`}
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={handleCreate}
                        disabled={isCreating || !newTopicQuery.trim()}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          isCreating || !newTopicQuery.trim()
                            ? "opacity-60 cursor-not-allowed"
                            : `${themeClasses.sendButton} hover:scale-[1.02] transform cursor-pointer`
                        }`}
                      >
                        {isCreating ? "Creating..." : "Follow Topic"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-lg opacity-60">No followed topics yet</p>
                  <p className="text-sm opacity-40 mt-2">
                    Click the plus button in the top-right or use the &quot;Follow Topic&quot; button in chat to start
                    following topics. You can unfollow a topic at any time.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(notificationsByCourse).map(([courseName, courseNotifications]) => (
                    <div key={courseName}>
                      <h3 className="text-lg font-semibold mb-3 opacity-80">{courseName}</h3>
                      <div className="space-y-2">
                        {courseNotifications.map((notification) => (
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
                                  ? "opacity-50 cursor-not-allowed"
                                  : themeClasses.closeButton
                              }`}
                              title="Unfollow topic"
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
            </>
          )}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}