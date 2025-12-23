import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { Citation, Message, ChatTab, ChatConfig, Notification } from "../../types/chat";
import { WEBSOCKET_URL, COURSES, MAX_NUMBER_OF_TABS} from "../../constants/chat";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../contexts/AuthContext";
import { fetchAuthSession } from "aws-amplify/auth";
import TabBar from "./TabBar";
import ChatInput from "./ChatInput";
import MessageBubble from "./MessageBubble";
import ExamplePrompts from "./ExamplePrompts";
import { usePersistedState } from "../../hooks/usePersistedState";
import PostGeneratorPopup from "./PostGeneratorPopup";
import NotificationsModal from "./NotificationsModal";
import SettingsModal from "./SettingsModal";


export default function PiazzaChat() {
  const isDark = useTheme();
  const { logout } = useAuth();

  // State management
  const [tabs, setTabs] = usePersistedState<ChatTab[]>('gp-ta-tabs', [{
    id: Date.now(),
    title: "Chat 1",
    messages: [],
    selectedCourse: COURSES[0]
  }]);
  const [activeTabId, setActiveTabId] = usePersistedState<number>('gp-ta-active-tab', Date.now());
  const [chatConfig, setChatConfig] = useState<ChatConfig>({
    prioritizeInstructor: false,
    model: "gpt-5"
  });
  const [input, setInput] = useState<string>("");
  const [editingTab, setEditingTab] = useState<{id: number, title: string} | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [pendingPostGeneration, setPendingPostGeneration] = useState(false);
  const [postToPiazzaMessageId, setPostToPiazzaMessageId] = useState<number | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const stored = localStorage.getItem('gp-ta-notifications');
    return stored ? JSON.parse(stored) : [];
  });
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [lastSeenCount, setLastSeenCount] = useState<number>(() => {
  const stored = localStorage.getItem('gp-ta-last-seen-notification-count');
  return stored ? parseInt(stored, 10) : 0;
});

  // Add loading state to track which tabs are processing messages
  const [loadingTabs, setLoadingTabs] = useState<Set<number>>(new Set());

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const wsConnectionsRef = useRef<Map<number, WebSocket>>(new Map());
  const messageBufferRef = useRef<Map<number, string>>(new Map());
  const currentAssistantIdRef = useRef<Map<number, number>>(new Map());
  const isUserScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef<boolean>(true);
  const tabScrollPositionsRef = useRef<Map<number, number>>(new Map());
  const responseTimeoutRef = useRef<Map<number, number>>(new Map());

  // Memoized derived state
  const activeTab = useMemo(() =>
    tabs.find(t => t.id === activeTabId)!,
    [tabs, activeTabId]
  );

  // Check if current tab is loading
  const isCurrentTabLoading = useMemo(() =>
    loadingTabs.has(activeTabId),
    [loadingTabs, activeTabId]
  );

  const hasUnseenNotifications = useMemo(() =>
    notifications.length > lastSeenCount,
    [notifications.length, lastSeenCount]
  );

  // Helper functions to manage loading state
  const setTabLoading = useCallback((tabId: number, loading: boolean) => {
    setLoadingTabs(prev => {
      const newSet = new Set(prev);
      if (loading) {
        newSet.add(tabId);
      } else {
        newSet.delete(tabId);
      }
      return newSet;
    });
  }, []);

  // Memoized theme classes to prevent recreation on every render
  const themeClasses = useMemo(() => ({
    background: isDark
      ? "bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white"
      : "bg-gradient-to-b from-blue-50 via-white to-blue-100 text-gray-900",
    mainContainer: isDark ? "" : "",
    frostedPopup: isDark
      ? "bg-white/10 border border-white/20 text-white backdrop-blur-sm shadow-2xl"
      : "bg-white/80 border border-gray-300/40 text-gray-900 backdrop-blur-md shadow-2xl",
    tabBar: isDark
      ? "bg-slate-800/60 border border-gray-600/50 backdrop-blur-lg"
      : "border border-gray-300/50 bg-gray-50/40 backdrop-blur-lg",
    activeTab: isDark
      ? "bg-slate-700 text-white border-b-2 border-blue-500"
      : "bg-white text-gray-900 border-b-2 border-blue-500",
    inactiveTab: isDark
      ? "text-slate-300 hover:bg-slate-700"
      : "text-gray-600 hover:bg-gray-200/40",
    inputArea: isDark ? "" : "",
    inputContainer: isDark
      ? "border border-white/20 bg-white/6 backdrop-blur-sm"
      : "border border-gray-300/50 bg-gray-50/50 backdrop-blur-sm",
    select: isDark
      ? "bg-slate-700 border border-white/20 text-white"
      : "bg-white border border-gray-300 text-gray-900",
    textarea: isDark
      ? "bg-slate-700 border border-white/20 placeholder-white/60 text-white"
      : "bg-white border border-gray-300 placeholder-gray-400 text-gray-900",
    sendButton: isDark
      ? "bg-slate-600 hover:bg-slate-500 border border-white/20 text-white"
      : "bg-black hover:bg-black/80 text-white",
    userBubble: isDark
      ? "bg-white/20 text-white border-white/8"
      : "bg-slate-100 text-black border-slate-500/20",
    assistantBubble: isDark
      ? "bg-white/6 text-white border-white/6"
      : "bg-white text-gray-900 border-gray-200/50 shadow-sm",
    citation: isDark
      ? "bg-white/6 text-white border-white/6"
      : "bg-white text-gray-900 border-gray-200/50 shadow-sm",
    footer: isDark ? "text-white/40" : "text-gray-500",
    closeButton: isDark
      ? "text-slate-400 group-hover:text-white hover:bg-slate-600"
      : "text-gray-400 group-hover:text-gray-600 hover:bg-gray-200",
    tooltip: isDark ? "bg-slate-900 text-white" : "bg-slate-300 text-black",
    editInput: isDark ? "bg-slate-600 text-white" : "bg-white text-gray-900",
    label: isDark ? "text-white" : "text-gray-700",
    logo: isDark
      ? "bg-gradient-to-br from-slate-500 to-blue-700"
      : "bg-gradient-to-br from-slate-500 to-blue-700",
    fadeMask: isDark
      ? "bg-gradient-to-b from-transparent to-slate-900"
      : "bg-gradient-to-b from-transparent to-blue-50",
    inlineCode: isDark
      ? "bg-white/10 text-white border border-white/20"
      : "bg-gray-100 text-gray-800 border border-gray-200",
    blockquote: isDark ? "border-gray-600 text-gray-300" : "border-gray-300 text-gray-600",
    link: isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-500 hover:text-blue-700",
    tableborder: isDark ? "border-gray-600" : "border-gray-300",
    tableHeader: isDark ? "border-gray-600 bg-white/10" : "border-gray-300 bg-gray-100"
  }), [isDark]);

  const isNearBottom = useCallback(() => {
    if (!messagesContainerRef.current) return true;
    const container = messagesContainerRef.current;
    const threshold = 100; // pixels from bottom
    return container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
  }, []);

  // Improved auto-scroll function
  const scrollToBottom = useCallback((force: boolean = false) => {
    if (!messagesContainerRef.current) return;

    // Only auto-scroll if user hasn't manually scrolled up or if forced
    if (!force && !shouldAutoScrollRef.current) return;

    const container = messagesContainerRef.current;

    // Use smooth scrolling for better UX
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  }, []);

  // Save scroll position for current tab before switching
  const saveCurrentScrollPosition = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const scrollPosition = messagesContainerRef.current.scrollTop;
    tabScrollPositionsRef.current.set(activeTabId, scrollPosition);
  }, [activeTabId]);

  // Restore scroll position for a specific tab
  const restoreScrollPosition = useCallback((tabId: number) => {
    if (!messagesContainerRef.current) return;

    const savedPosition = tabScrollPositionsRef.current.get(tabId);
    if (savedPosition !== undefined) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = savedPosition;

          // Update auto-scroll state based on restored position
          const isAtBottom = isNearBottom();
          shouldAutoScrollRef.current = isAtBottom;
        }
      });
    } else {
      // If no saved position, scroll to bottom (new tab behavior)
      setTimeout(() => scrollToBottom(true), 10);
    }
  }, [isNearBottom, scrollToBottom]);


  // Handle scroll events to detect user scrolling
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    // Save current scroll position for active tab
    saveCurrentScrollPosition();

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Check if user is scrolling manually
    const wasNearBottom = isNearBottom();

    // If user scrolled away from bottom, disable auto-scroll
    if (!wasNearBottom) {
      shouldAutoScrollRef.current = false;
      isUserScrollingRef.current = true;
    } else {
      // If user is at/near bottom, re-enable auto-scroll
      shouldAutoScrollRef.current = true;
      isUserScrollingRef.current = false;
    }

    // Reset scroll detection after a delay
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
      if (isNearBottom()) {
        shouldAutoScrollRef.current = true;
      }
    }, 150);
  }, [isNearBottom, saveCurrentScrollPosition]);


  // Add scroll listener to messages container
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  // Auto-scroll when messages change (with improved logic)
  useEffect(() => {
    // Always scroll for new messages if we should auto-scroll
    if (shouldAutoScrollRef.current) {
      // Small delay to ensure DOM is updated
      const timeoutId = setTimeout(() => {
        scrollToBottom();
      }, 10);
      return () => clearTimeout(timeoutId);
    }
  }, [activeTab.messages, scrollToBottom]);

  // Force scroll to bottom when switching tabs or sending new message
  useEffect(() => {
    // Restore scroll position for the new active tab
    restoreScrollPosition(activeTabId);
  }, [activeTabId, restoreScrollPosition]);

  // Fetch notifications only once
  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const response = await fetch(`https://${import.meta.env.VITE_PIAZZA_POST_ID}.execute-api.us-west-2.amazonaws.com/prod/notify`);
      const data = await response.json();
      setNotifications(data);
      localStorage.setItem('gp-ta-notifications', JSON.stringify(data));
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);




  // Cleanup WebSocket connections when component unmounts
  useEffect(() => {
    return () => {
      wsConnectionsRef.current.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
      wsConnectionsRef.current.clear();
      // Clean up all timeouts on unmount
      responseTimeoutRef.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
      responseTimeoutRef.current.clear();
    };
  }, []);

  const addMessagesToTab = useCallback((tabId: number, newMessages: Message[]) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId
          ? { ...tab, messages: [...tab.messages, ...newMessages] }
          : tab
      )
    );

    // Force scroll to bottom when adding new messages
    if (tabId === activeTabId) {
      shouldAutoScrollRef.current = true;
      setTimeout(() => scrollToBottom(true), 10);
    }
  }, [setTabs, activeTabId, scrollToBottom]);

  // Optimized simple AI response
  const addSimpleAIResponse = useCallback((responseText: string) => {
    const assistantMsgId = Date.now();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      text: responseText
    };
    addMessagesToTab(activeTabId, [assistantMsg]);
  }, [activeTabId, addMessagesToTab]);

  // Optimized WebSocket message handler
  const handleWebSocketMessage = useCallback((event: MessageEvent, tabId: number) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      console.error("Invalid message format:", event.data);
      return;
    }

    switch (data.type) {
      case "chat_done":
        // Clear timeout on completion
        const doneTimeoutId = responseTimeoutRef.current.get(tabId);
        if (doneTimeoutId) {
          clearTimeout(doneTimeoutId);
          responseTimeoutRef.current.delete(tabId);
        }
        messageBufferRef.current.delete(tabId);
        setTabLoading(tabId, false);

        // Ensure loading state on the assistant message itself is cleared
        setTabs(prev => {
          const assistantId = currentAssistantIdRef.current.get(tabId);
          if (!assistantId) return prev;

          return prev.map(tab => {
            if (tab.id !== tabId) return tab;

            const updatedMessages = tab.messages.map(m =>
              m.role === "assistant" && m.id === assistantId
                ? { ...m, isLoading: false }
                : m
            );

            return { ...tab, messages: updatedMessages };
          });
        });

        // Handle needs_more_context flag
        if (data.needs_more_context !== undefined) {
          setTabs(prev => {
            const assistantId = currentAssistantIdRef.current.get(tabId);
            return prev.map(tab => {
              if (tab.id !== tabId) return tab;

              const updatedMessages = tab.messages.map(m =>
                m.role === "assistant" && m.id === assistantId
                  ? { ...m, needsMoreContext: data.needs_more_context }
                  : m
              );

              return { ...tab, messages: updatedMessages };
            });
          });
        }

        if (tabId === activeTabId) {
          setTimeout(() => scrollToBottom(), 100);
        }
        break;
      case "prompt":
        break;
      case "chat_chunk":
        // Clear timeout when we receive actual content
        const chunkTimeoutId = responseTimeoutRef.current.get(tabId);
        if (chunkTimeoutId) {
          clearTimeout(chunkTimeoutId);
          responseTimeoutRef.current.delete(tabId);
        }
        const currentBuffer = messageBufferRef.current.get(tabId) || "";
        const newBuffer = currentBuffer + data.message;
        messageBufferRef.current.set(tabId, newBuffer);
        updateAssistantMessage(tabId, newBuffer);
        break;
      case "progress_update":
        // Clear timeout on progress updates (indicates server is responding)
        const progressTimeoutId = responseTimeoutRef.current.get(tabId);
        if (progressTimeoutId) {
          clearTimeout(progressTimeoutId);
          responseTimeoutRef.current.delete(tabId);
        }
        updateAssistantMessage(tabId, data.message);
        break;
      case "chat_start":
        // Don't clear timeout on chat_start - this is just an acknowledgment
        // The timeout should remain active until we get actual content or completion
        messageBufferRef.current.set(tabId, "");
        updateAssistantMessage(tabId, "");
        setTabLoading(tabId, true);
        if (tabId === activeTabId) {
          shouldAutoScrollRef.current = true;
        }
        break;
      case "citations":
        if (data.citations && currentAssistantIdRef.current.has(tabId)) {
          addCitationsToAssistantMessage(tabId, data.citations, data.citation_map);
        }
        break;
    }
  }, [activeTabId, scrollToBottom, setTabLoading, setTabs]);

  const handleNotificationsUpdate = useCallback(() => {
    // Reload notifications from localStorage
    const stored = localStorage.getItem('gp-ta-notifications');
    setNotifications(stored ? JSON.parse(stored) : []);
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  }, [logout]);

  const handleNotifyMe = useCallback(async (messageId: number) => {
    try {
      // Set loading state
      setTabs(prev =>
        prev.map(tab =>
          tab.id === activeTabId
            ? {
                ...tab,
                messages: tab.messages.map(m =>
                  m.id === messageId
                    ? { ...m, notificationLoading: true }
                    : m
                )
              }
            : tab
        )
      );

      // Find the assistant message index
      const assistantMessageIndex = activeTab.messages.findIndex(m => m.id === messageId);

      if (assistantMessageIndex === -1) {
        console.error("Assistant message not found");
        setTabs(prev =>
          prev.map(tab =>
            tab.id === activeTabId
              ? {
                  ...tab,
                  messages: tab.messages.map(m =>
                    m.id === messageId
                      ? { ...m, notificationLoading: false }
                      : m
                  )
                }
              : tab
          )
        );
        addSimpleAIResponse("Sorry, I couldn't process your notification request.");
        return;
      }

      // The user's message should be right before the assistant's message
      const usersMessageIndex = assistantMessageIndex - 1;

      if (usersMessageIndex < 0 || !activeTab.messages[usersMessageIndex]?.text) {
        console.error("User message not found or empty");
        setTabs(prev =>
          prev.map(tab =>
            tab.id === activeTabId
              ? {
                  ...tab,
                  messages: tab.messages.map(m =>
                    m.id === messageId
                      ? { ...m, notificationLoading: false }
                      : m
                  )
                }
              : tab
          )
        );
        addSimpleAIResponse("Sorry, I couldn't find your original question.");
        return;
      }

      const userMessage = activeTab.messages[usersMessageIndex];
      const userQuery = userMessage.text;
      // Use the course from the user message, fallback to activeTab.selectedCourse if not set
      const messageCourse = userMessage.course || activeTab.selectedCourse;

      const response = await fetch(`https://${import.meta.env.VITE_PIAZZA_POST_ID}.execute-api.us-west-2.amazonaws.com/prod/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_query: userQuery,
          course_display_name: messageCourse
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      await response.json();

      if (response.status === 201) {
        const notificationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newNotification = {
          id: notificationId,
          query: userQuery,
          course_name: messageCourse
        };
        setNotifications(prev => {
          const updated = [...prev, newNotification];
          localStorage.setItem('gp-ta-notifications', JSON.stringify(updated));
          return updated;
        });
      }

      // Set notification as created
      setTabs(prev =>
        prev.map(tab =>
          tab.id === activeTabId
            ? {
                ...tab,
                messages: tab.messages.map(m =>
                  m.id === messageId
                    ? { ...m, notificationLoading: false, notificationCreated: true }
                    : m
                )
              }
            : tab
        )
      );
    } catch (error) {
      console.error("Error in handleNotifyMe:", error);
      // Reset loading state on error
      setTabs(prev =>
        prev.map(tab =>
          tab.id === activeTabId
            ? {
                ...tab,
                messages: tab.messages.map(m =>
                  m.id === messageId
                    ? { ...m, notificationLoading: false }
                    : m
                )
              }
            : tab
        )
      );
      addSimpleAIResponse("Sorry, something went wrong with your notification request. Please try again.");
    }
  }, [activeTabId, activeTab.messages, activeTab.selectedCourse, addSimpleAIResponse, setTabs]);

  const handlePostToPiazza = useCallback((messageId: number) => {
    // Store the message ID and open the post generator popup
    setPostToPiazzaMessageId(messageId);
    setIsPopupOpen(true);
    setPendingPostGeneration(true);
  }, []);


  // Optimized message update functions with reduced object creation
  const updateAssistantMessage = useCallback((tabId: number, text: string) => {
    setTabs(prev => {
      const assistantId = currentAssistantIdRef.current.get(tabId);
      return prev.map(tab => {
        if (tab.id !== tabId) return tab;

        const updatedMessages = tab.messages.map(m =>
          m.role === "assistant" && m.id === assistantId
            ? { ...m, text, isLoading: false }
            : m
        );

        return { ...tab, messages: updatedMessages };
      });
    });
  }, [setTabs]);

  // Memoized WebSocket creation function
  const getOrCreateWebSocket = useCallback(async (tabId: number): Promise<WebSocket> => {
    let ws = wsConnectionsRef.current.get(tabId);

    if (!ws || ws.readyState === WebSocket.CLOSED) {
      // Get JWT token from Cognito session
      try {
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();

        if (!idToken) {
          throw new Error("No authentication token available. Please log in again.");
        }

        // Build WebSocket URL with JWT token (remove any existing query params)
        // TODO: FIX THIS INCREDIBLY INSECURE!!!
        const baseUrl = WEBSOCKET_URL.split('?')[0];
        const wsUrl = `${baseUrl}?token=${encodeURIComponent(idToken)}`;
        ws = new WebSocket(wsUrl);
        wsConnectionsRef.current.set(tabId, ws);

        ws.onclose = () => {
          wsConnectionsRef.current.delete(tabId);
        };
        ws.onerror = (err) => {
          console.error(`WebSocket error for tab ${tabId}`, err);
          // Clear timeout on error
          const timeout = responseTimeoutRef.current.get(tabId);
          if (timeout) {
            clearTimeout(timeout);
            responseTimeoutRef.current.delete(tabId);
          }
          const assistantId = currentAssistantIdRef.current.get(tabId);
          if (assistantId) {
            updateAssistantMessage(tabId, "Something went wrong, please try again!");
          }
          // Stop loading state on error
          setTabLoading(tabId, false);
        };
        ws.onmessage = (event) => handleWebSocketMessage(event, tabId);
      } catch (error) {
        console.error("Failed to get authentication token:", error);
        setTabLoading(tabId, false);
        throw new Error("Authentication failed. Please log in again.");
      }
    }

    return ws;
  }, [setTabLoading, handleWebSocketMessage, updateAssistantMessage]); // Added dependencies

  const addCitationsToAssistantMessage = useCallback((tabId: number, citations: Citation[], citationMap?: Record<number, Citation>) => {
    setTabs(prev => {
      const assistantId = currentAssistantIdRef.current.get(tabId);
      return prev.map(tab => {
        if (tab.id !== tabId) return tab;

        const updatedMessages = tab.messages.map(m =>
          m.role === "assistant" && m.id === assistantId
            ? { ...m, citations, citationMap }
            : m
        );

        return { ...tab, messages: updatedMessages };
      });
    });
  }, [setTabs]);

  // Optimized sendMessage with reduced state updates
  const sendMessage = useCallback(() => {
    // Prevent sending if tab is currently loading
    if (isCurrentTabLoading) return;

    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsgId = Date.now();
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      text: trimmed,
      course: activeTab.selectedCourse
    };

    const assistantMsgId = userMsgId + 1;

    const assistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      text: "Finding relevant Piazza posts...",
      isLoading: true
    };

    currentAssistantIdRef.current.set(activeTabId, assistantMsgId);
    addMessagesToTab(activeTabId, [userMsg, assistantMsg]);
    setInput("");
    messageBufferRef.current.set(activeTabId, "");

    // Set loading state immediately when starting to send
    setTabLoading(activeTabId, true);

    // Clear any existing timeout for this tab
    const existingTimeout = responseTimeoutRef.current.get(activeTabId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      responseTimeoutRef.current.delete(activeTabId);
    }

    // Set a 20-second timeout for response
    // Capture tabId in closure to ensure we use the correct tab even if user switches
    const tabIdForTimeout = activeTabId;
    const timeoutId = window.setTimeout(() => {
      // Double-check the timeout still exists (wasn't cleared) and matches
      const currentTimeout = responseTimeoutRef.current.get(tabIdForTimeout);
      if (currentTimeout === timeoutId) {
        updateAssistantMessage(tabIdForTimeout, "Request timed out. Please try again.");
        setTabLoading(tabIdForTimeout, false);
        responseTimeoutRef.current.delete(tabIdForTimeout);
      }
    }, 20000);
    responseTimeoutRef.current.set(activeTabId, timeoutId);

    // Get or create WebSocket connection (async)
    getOrCreateWebSocket(activeTabId)
      .then(async (ws) => {
        const sendToWebSocket = async () => {
          try {
            // Get fresh JWT token for each message
            const session = await fetchAuthSession();
            const idToken = session.tokens?.idToken?.toString();

            if (!idToken) {
              throw new Error("No authentication token available. Please log in again.");
            }

            ws.send(JSON.stringify({
              action: "chat",
              message: trimmed,
              course_name: activeTab.selectedCourse.toLowerCase().replace(" ", ""),
              model: chatConfig.model,
              prioritizeInstructor: chatConfig.prioritizeInstructor,
              token: idToken, // Include JWT token in message
            }));
          } catch (error: any) {
            console.error("Failed to send message:", error);
            // Clear timeout on error
            const timeout = responseTimeoutRef.current.get(activeTabId);
            if (timeout) {
              clearTimeout(timeout);
              responseTimeoutRef.current.delete(activeTabId);
            }
            updateAssistantMessage(activeTabId, error.message || "Something went wrong, please try again!");
            setTabLoading(activeTabId, false); // Stop loading on error
          }
        };

        if (ws.readyState === WebSocket.OPEN) {
          sendToWebSocket().catch((error) => {
            console.error("Error sending message:", error);
          });
        } else if (ws.readyState === WebSocket.CONNECTING) {
          const connectionTimeout = setTimeout(() => {
            // Clear response timeout on connection timeout
            const timeout = responseTimeoutRef.current.get(activeTabId);
            if (timeout) {
              clearTimeout(timeout);
              responseTimeoutRef.current.delete(activeTabId);
            }
            updateAssistantMessage(activeTabId, "Something went wrong, please try again!");
            setTabLoading(activeTabId, false); // Stop loading on timeout
          }, 10000);

          ws.addEventListener('open', () => {
            clearTimeout(connectionTimeout);
            sendToWebSocket().catch((error) => {
              console.error("Error sending message:", error);
            });
          }, { once: true });

          ws.addEventListener('error', () => {
            // Clear response timeout on error
            const timeout = responseTimeoutRef.current.get(activeTabId);
            if (timeout) {
              clearTimeout(timeout);
              responseTimeoutRef.current.delete(activeTabId);
            }
            clearTimeout(connectionTimeout);
            updateAssistantMessage(activeTabId, "Something went wrong, please try again!");
            setTabLoading(activeTabId, false); // Stop loading on error
          }, { once: true });
        } else {
          // Clear response timeout if WebSocket is not available
          const timeout = responseTimeoutRef.current.get(activeTabId);
          if (timeout) {
            clearTimeout(timeout);
            responseTimeoutRef.current.delete(activeTabId);
          }
          updateAssistantMessage(activeTabId, "Something went wrong, please try again!");
          setTabLoading(activeTabId, false); // Stop loading if WebSocket is not available
        }
      })
      .catch((error) => {
        console.error("Failed to create WebSocket connection:", error);
        // Clear timeout on error
        const timeout = responseTimeoutRef.current.get(activeTabId);
        if (timeout) {
          clearTimeout(timeout);
          responseTimeoutRef.current.delete(activeTabId);
        }
        updateAssistantMessage(activeTabId, error.message || "Authentication failed. Please log in again.");
        setTabLoading(activeTabId, false);
      });
  }, [input, activeTabId, activeTab.selectedCourse, chatConfig, isCurrentTabLoading, addMessagesToTab, getOrCreateWebSocket, updateAssistantMessage, setTabLoading]);

  // Memoized popup handlers
  const handlePopupClose = useCallback(() => {
    setIsPopupOpen(false);
    setPostToPiazzaMessageId(null);
    if (pendingPostGeneration) {
      setPendingPostGeneration(false);
    }
  }, [pendingPostGeneration, addSimpleAIResponse]);

  const handlePostSuccess = useCallback((postLink: string) => {
    setIsPopupOpen(false);
    setPostToPiazzaMessageId(null);
    setPendingPostGeneration(false);
    const message = "I posted to Piazza for you! Keep an eye on Piazza for an answer to your question. See your post [here!](" + postLink + ")";
    addSimpleAIResponse(message);
  }, [addSimpleAIResponse]);

  // Optimized tab management functions
  const createNewTab = useCallback(() => {
    if (tabs.length >= MAX_NUMBER_OF_TABS) return;
    const id = Date.now();
    const nextNumber = tabs.length + 1;
    const newTab: ChatTab = {
      id,
      title: `Chat ${nextNumber}`,
      messages: [],
      selectedCourse: COURSES[0]
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
  }, [tabs.length, setTabs, setActiveTabId]);

  const startEditingTab = useCallback((tabId: number, currentTitle: string) => {
    setEditingTab({ id: tabId, title: currentTitle });
  }, []);

  const saveTabTitle = useCallback((tabId: number, newTitle: string) => {
    setTabs(prev =>
      prev.map(t =>
        t.id === tabId
          ? { ...t, title: newTitle.trim() || "Untitled" }
          : t
      )
    );
    setEditingTab(null);
  }, [setTabs]);

  const closeTab = useCallback((tabId: number) => {
    setTabs(prev => {
      if (prev.length === 1) return prev;

      const tabIndex = prev.findIndex(t => t.id === tabId);
      const newTabs = prev.filter(t => t.id !== tabId);

      // Clean up refs and WebSocket connection for closed tab
      messageBufferRef.current.delete(tabId);
      currentAssistantIdRef.current.delete(tabId);
      tabScrollPositionsRef.current.delete(tabId); // Clean up scroll position

      // Clean up timeout for closed tab
      const timeout = responseTimeoutRef.current.get(tabId);
      if (timeout) {
        clearTimeout(timeout);
        responseTimeoutRef.current.delete(tabId);
      }

      // Clean up loading state for closed tab
      setTabLoading(tabId, false);

      const ws = wsConnectionsRef.current.get(tabId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      wsConnectionsRef.current.delete(tabId);

      // Handle active tab switching if we're closing the active tab
      if (tabId === activeTabId) {
        const nextTab = newTabs[tabIndex - 1] || newTabs[tabIndex] || newTabs[0];
        if (nextTab) {
          setActiveTabId(nextTab.id);
        } else {
          const newId = Date.now();
          setActiveTabId(newId);
          return [{
            id: newId,
            title: "Chat 1",
            messages: [],
            selectedCourse: COURSES[0]
          }];
        }
      }

      return newTabs;
    });
  }, [activeTabId, setTabs, setActiveTabId, setTabLoading]);

  // In your parent component that manages the tabs
  useEffect(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (activeTab) {
      document.title = `${activeTab.title} | GP-TA`;
    } else {
      document.title = 'GP-TA';
    }
  }, [activeTabId, tabs]);

  const handleCourseChange = useCallback((newCourse: string) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === activeTabId
          ? { ...tab, selectedCourse: newCourse }
          : tab
      )
    );
  }, [activeTabId, setTabs]);

  // Memoized event handlers
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const handleConfigChange = useCallback((key: keyof ChatConfig, value: string | boolean) => {
    setChatConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleNotificationsToggle = useCallback(() => {
    setIsNotificationsOpen(prev => {
      if (!prev) {
        // Opening the modal - reload from localStorage and mark as seen
        const stored = localStorage.getItem('gp-ta-notifications');
        const currentNotifications = stored ? JSON.parse(stored) : [];
        setNotifications(currentNotifications);
        setLastSeenCount(currentNotifications.length);
        localStorage.setItem('gp-ta-last-seen-notification-count', currentNotifications.length.toString());
      }
      return !prev;
    });
  }, []);

  return (
    <div className={`h-screen ${themeClasses.background} flex flex-col relative`}>
      <div className="relative flex-1 flex justify-center items-stretch my-3">
        <div className={`w-full max-w-5xl flex flex-col rounded-2xl ${themeClasses.mainContainer} relative overflow-hidden`}>

          {/* Tab Bar */}
          <div className="relative z-30">
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              editingTab={editingTab}
              onTabClick={setActiveTabId}
              onTabDoubleClick={startEditingTab}
              onTabClose={closeTab}
              onTabTitleSave={saveTabTitle}
              onTabTitleCancel={() => setEditingTab(null)}
              onTabTitleChange={(title: string) => setEditingTab(prev => prev ? { ...prev, title } : null)}
              onNewTab={createNewTab}
              themeClasses={themeClasses}
              onNotificationsClick={handleNotificationsToggle}
              hasUnseenNotifications={hasUnseenNotifications}
              onSettingsClick={() => setIsSettingsOpen(true)}
            />
          </div>

          {/* Fade mask */}
          <div className={`absolute top-6 left-0 right-0 h-5 ${themeClasses.fadeMask} z-20 pointer-events-none`} />

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            className="absolute top-0 bottom-[153px] left-0 right-0 overflow-y-auto p-6 pt-16 space-y-3 z-10"
            style={{
              backdropFilter: "blur(6px)",
              scrollbarWidth: 'none'
            }}
          >
            {activeTab.messages.length === 0 ? (
              <ExamplePrompts themeClasses={themeClasses} />
            ) : (
              activeTab.messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  {...message}
                  themeClasses={themeClasses}
                  isFirstMessage={index === 0}
                  onNotifyMe={handleNotifyMe}
                  onPostToPiazza={handlePostToPiazza}
                />
              ))
            )}
          </div>

          {/* Input Area */}
          <ChatInput
            input={input}
            chatConfig={chatConfig}
            currentCourse={activeTab.selectedCourse}
            isLoading={isCurrentTabLoading}
            onInputChange={setInput}
            onConfigChange={handleConfigChange}
            onCourseChange={handleCourseChange}
            onSend={sendMessage}
            onKeyDown={handleKeyDown}
            themeClasses={themeClasses}
          />

        </div>
      </div>
      <PostGeneratorPopup
        isOpen={isPopupOpen}
        onClose={handlePopupClose}
        onPostSuccess={handlePostSuccess}
        themeClasses={themeClasses}
        activeTab={activeTab}
        messageId={postToPiazzaMessageId}
      />
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        themeClasses={themeClasses}
        onNotificationsUpdate={handleNotificationsUpdate}
        loading={notificationsLoading}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSignOut={handleSignOut}
        themeClasses={themeClasses}
      />
    </div>
  );
}
