import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { Citation, Message, ChatTab, ChatConfig } from "../../types/chat";
import { WEBSOCKET_URL, COURSES, MAX_NUMBER_OF_TABS, AFFIRMATIVES, NEGATIVES } from "../../constants/chat";
import { useTheme } from "../../hooks/useTheme";
import TabBar from "./TabBar";
import ChatInput from "./ChatInput";
import MessageBubble from "./MessageBubble";
import ExamplePrompts from "./ExamplePrompts";
import { usePersistedState } from "../../hooks/usePersistedState";
import PostGeneratorPopup from "./PostGeneratorPopup";

export default function PiazzaChat() {
  const isDark = useTheme();
  
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
  const [canPost, setCanPost] = useState(false);

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
    // Save scroll position of previous tab before switching
    const prevActiveTabId = tabScrollPositionsRef.current.get(activeTabId);
    
    // Restore scroll position for the new active tab
    restoreScrollPosition(activeTabId);
  }, [activeTabId, restoreScrollPosition]);

  // Memoized WebSocket creation function
  const getOrCreateWebSocket = useCallback((tabId: number): WebSocket => {
    let ws = wsConnectionsRef.current.get(tabId);
    
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      ws = new WebSocket(WEBSOCKET_URL);
      wsConnectionsRef.current.set(tabId, ws);
      
      ws.onopen = () => console.log(`WebSocket connected for tab ${tabId}`);
      ws.onclose = () => {
        console.log(`WebSocket disconnected for tab ${tabId}`);
        wsConnectionsRef.current.delete(tabId);
      };
      ws.onerror = (err) => {
        console.error(`WebSocket error for tab ${tabId}`, err);
        const assistantId = currentAssistantIdRef.current.get(tabId);
        if (assistantId) {
          updateAssistantMessage(tabId, "Something went wrong, please try again!");
        }
        // Stop loading state on error
        setTabLoading(tabId, false);
      };
      ws.onmessage = (event) => handleWebSocketMessage(event, tabId);
    }
    
    return ws;
  }, [setTabLoading]); // Added setTabLoading to dependencies

  // Cleanup WebSocket connections when component unmounts
  useEffect(() => {
    return () => {
      wsConnectionsRef.current.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
      wsConnectionsRef.current.clear();
    };
  }, []);

  // Optimized WebSocket message handler
  const handleWebSocketMessage = useCallback((event: MessageEvent, tabId: number) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      console.error("Invalid message format:", event.data);
      return;
    }

    // Batch state updates to reduce re-renders
    switch (data.type) {
      case "chat_done":
        messageBufferRef.current.delete(tabId);
        // Stop loading state when chat is done
        setTabLoading(tabId, false);
        // Ensure we scroll to bottom when streaming is complete
        if (tabId === activeTabId) {
          setTimeout(() => scrollToBottom(), 100);
        }
        break;
      case "chat_chunk":
        const currentBuffer = messageBufferRef.current.get(tabId) || "";
        const newBuffer = currentBuffer + data.message;
        messageBufferRef.current.set(tabId, newBuffer);
        updateAssistantMessage(tabId, newBuffer);
        break;
      case "progress_update":
        updateAssistantMessage(tabId, data.message);
        break;
      case "chat_start":
        messageBufferRef.current.set(tabId, "");
        updateAssistantMessage(tabId, "");
        // Start loading state when chat begins
        setTabLoading(tabId, true);
        // Enable auto-scroll when new message starts
        if (tabId === activeTabId) {
          shouldAutoScrollRef.current = true;
        }
        break;
      case "citations":
        if (data.citations && currentAssistantIdRef.current.has(tabId)) {
          addCitationsToAssistantMessage(tabId, data.citations);
        }
        break;
    }
  }, [activeTabId, scrollToBottom, setTabLoading]);

  // Optimized message update functions with reduced object creation
  const updateAssistantMessage = useCallback((tabId: number, text: string) => {
    setTabs(prev => {
      const assistantId = currentAssistantIdRef.current.get(tabId);
      return prev.map(tab => {
        if (tab.id !== tabId) return tab;
        
        const updatedMessages = tab.messages.map(m => 
          m.role === "assistant" && m.id === assistantId
            ? { ...m, text }
            : m
        );
        
        return { ...tab, messages: updatedMessages };
      });
    });
  }, [setTabs]);

  const addCitationsToAssistantMessage = useCallback((tabId: number, citations: Citation[]) => {
    setTabs(prev => {
      const assistantId = currentAssistantIdRef.current.get(tabId);
      return prev.map(tab => {
        if (tab.id !== tabId) return tab;
        
        const updatedMessages = tab.messages.map(m =>
          m.role === "assistant" && m.id === assistantId
            ? { ...m, citations }
            : m
        );
        
        return { ...tab, messages: updatedMessages };
      });
    });
  }, [setTabs]);

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

    // Handle affirmative responses
    if (AFFIRMATIVES.includes(trimmed.toLowerCase()) && canPost) {
      setCanPost(false);
      setIsPopupOpen(true);
      setPendingPostGeneration(true);
      setInput("");
      addMessagesToTab(activeTabId, [userMsg]);
      return;
    }

    if (NEGATIVES.includes(trimmed.toLowerCase()) && canPost) {
      setCanPost(false);
      const assistantMsg: Message = { 
        id: assistantMsgId, 
        role: "assistant", 
        text: "Okay, I won't generate a post for you!" 
      };
      setInput("");
      addMessagesToTab(activeTabId, [userMsg, assistantMsg]);
      return;
    }
    
    setCanPost(true);

    const assistantMsg: Message = { 
      id: assistantMsgId, 
      role: "assistant", 
      text: "Finding relevant Piazza posts..." 
    };

    currentAssistantIdRef.current.set(activeTabId, assistantMsgId);
    addMessagesToTab(activeTabId, [userMsg, assistantMsg]);
    setInput("");
    messageBufferRef.current.set(activeTabId, "");

    // Set loading state immediately when starting to send
    setTabLoading(activeTabId, true);

    const ws = getOrCreateWebSocket(activeTabId);
    
    const sendToWebSocket = () => {
      try {
        ws.send(JSON.stringify({
          action: "chat",
          message: trimmed,
          class: activeTab.selectedCourse.toLowerCase().replace(" ", ""),
          model: chatConfig.model,
          prioritizeInstructor: chatConfig.prioritizeInstructor,
        }));
      } catch (error) {
        console.error("Failed to send message:", error);
        updateAssistantMessage(activeTabId, "Something went wrong, please try again!");
        setTabLoading(activeTabId, false); // Stop loading on error
      }
    };

    if (ws.readyState === WebSocket.OPEN) {
      sendToWebSocket();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      const connectionTimeout = setTimeout(() => {
        updateAssistantMessage(activeTabId, "Something went wrong, please try again!");
        setTabLoading(activeTabId, false); // Stop loading on timeout
      }, 10000);
      
      ws.addEventListener('open', () => {
        clearTimeout(connectionTimeout);
        sendToWebSocket();
      }, { once: true });
      
      ws.addEventListener('error', () => {
        clearTimeout(connectionTimeout);
        updateAssistantMessage(activeTabId, "Something went wrong, please try again!");
        setTabLoading(activeTabId, false); // Stop loading on error
      }, { once: true });
    } else {
      updateAssistantMessage(activeTabId, "Something went wrong, please try again!");
      setTabLoading(activeTabId, false); // Stop loading if WebSocket is not available
    }
  }, [input, activeTabId, activeTab.selectedCourse, chatConfig, canPost, isCurrentTabLoading, addMessagesToTab, getOrCreateWebSocket, updateAssistantMessage, setTabLoading]);

  // Memoized popup handlers
  const handlePopupClose = useCallback(() => {
    setIsPopupOpen(false);
    if (pendingPostGeneration) {
      setPendingPostGeneration(false);
      addSimpleAIResponse("Okay, I won't generate a post for you!");
    }
  }, [pendingPostGeneration, addSimpleAIResponse]);

  const handlePostSuccess = useCallback(() => {
    setIsPopupOpen(false);
    setPendingPostGeneration(false);
    addSimpleAIResponse("I posted to Piazza for you! Keep an eye on Piazza for an answer to your question.");
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
      />
    </div>
  );
}