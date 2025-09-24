
import { useState, useRef, useEffect, useCallback } from "react";
import type { KeyboardEvent } from "react";
import type { Citation, Message, ChatTab, ChatConfig } from "../../types/chat";
import { WEBSOCKET_URL, COURSES, MAX_NUMBER_OF_TABS } from "../../constants/chat";
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
 // With this:
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

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const wsConnectionsRef = useRef<Map<number, WebSocket>>(new Map()); // Map tabId -> WebSocket
  const messageBufferRef = useRef<Map<number, string>>(new Map()); // Map tabId -> message buffer
  const currentAssistantIdRef = useRef<Map<number, number>>(new Map()); // Map tabId -> assistant message ID

  // Derived state
  const activeTab = tabs.find(t => t.id === activeTabId)!;

  // Auto-scroll messages (only for active tab)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [activeTab.messages]);

  // WebSocket management - create connections per tab
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
        // Update assistant message with error
        const assistantId = currentAssistantIdRef.current.get(tabId);
        if (assistantId) {
          updateAssistantMessage(tabId, "Something went wrong, please try again!");
        }
      };
      ws.onmessage = (event) => handleWebSocketMessage(event, tabId);
    }
    
    return ws;
  }, []);

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

  // WebSocket message handler - now takes tabId as parameter
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
        messageBufferRef.current.delete(tabId);
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
        break;
      case "citations":
        if (data.citations && currentAssistantIdRef.current.has(tabId)) {
          addCitationsToAssistantMessage(tabId, data.citations);
        }
        break;
    }
  }, []);

  // Message management - now takes tabId as parameter
  const updateAssistantMessage = useCallback((tabId: number, text: string) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId
          ? {
              ...tab,
              messages: tab.messages.map(m =>
                m.role === "assistant" && m.id === currentAssistantIdRef.current.get(tabId)
                  ? { ...m, text }
                  : m
              ),
            }
          : tab
      )
    );
  }, []);

  const addCitationsToAssistantMessage = useCallback((tabId: number, citations: Citation[]) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId
          ? {
              ...tab,
              messages: tab.messages.map(m =>
                m.role === "assistant" && m.id === currentAssistantIdRef.current.get(tabId)
                  ? { ...m, citations }
                  : m
              ),
            }
          : tab
      )
    );
  }, []);

  const addMessagesToTab = useCallback((tabId: number, newMessages: Message[]) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId
          ? { ...tab, messages: [...tab.messages, ...newMessages] }
          : tab
      )
    );
  }, []);

  // Message sending
  const sendMessage = useCallback(() => {
    setIsPopupOpen(true)
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsgId = Date.now();
    const assistantMsgId = userMsgId + 1;
    
    const userMsg: Message = { 
      id: userMsgId, 
      role: "user", 
      text: trimmed,
      course: activeTab.selectedCourse
    };
    const assistantMsg: Message = { 
      id: assistantMsgId, 
      role: "assistant", 
      text: "Finding relevant Piazza posts..." 
    };

    // Track this assistant message for the current tab
    currentAssistantIdRef.current.set(activeTabId, assistantMsgId);
    
    // Immediately add messages to UI
    addMessagesToTab(activeTabId, [userMsg, assistantMsg]);
    setInput("");
    messageBufferRef.current.set(activeTabId, "");

    // Now handle WebSocket connection and sending
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
      }
    };

    if (ws.readyState === WebSocket.OPEN) {
      sendToWebSocket();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      // Add timeout for connection attempt
      const connectionTimeout = setTimeout(() => {
        updateAssistantMessage(activeTabId, "Something went wrong, please try again!");
      }, 10000); // 10 second timeout
      
      ws.addEventListener('open', () => {
        clearTimeout(connectionTimeout);
        sendToWebSocket();
      }, { once: true });
      
      ws.addEventListener('error', () => {
        clearTimeout(connectionTimeout);
        updateAssistantMessage(activeTabId, "Something went wrong, please try again!");
      }, { once: true });
    } else {
      // WebSocket is in CLOSED state
      updateAssistantMessage(activeTabId, "Something went wrong, please try again!");
    }
  }, [input, activeTabId, activeTab.selectedCourse, chatConfig, addMessagesToTab, getOrCreateWebSocket, updateAssistantMessage]);

  // Tab management
  const createNewTab = useCallback(() => {
    if (tabs.length >= MAX_NUMBER_OF_TABS) return;
    const id = Date.now();
    let nextNumber = tabs.length + 1;
    const newTab: ChatTab = { 
      id, 
      title: `Chat ${nextNumber}`, 
      messages: [],
      selectedCourse: COURSES[0] // Default to first course for new tabs
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
  }, [tabs.length]);

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
  }, []);

  const closeTab = useCallback((tabId: number) => {
    setTabs(prev => {
      if (prev.length === 1) return prev;
      
      const tabIndex = prev.findIndex(t => t.id === tabId);
      const newTabs = prev.filter(t => t.id !== tabId);

      // Clean up refs and WebSocket connection for closed tab
      messageBufferRef.current.delete(tabId);
      currentAssistantIdRef.current.delete(tabId);
      
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
          // Create new tab if none exist
          const newId = Date.now();
          setActiveTabId(newId);
          return [{ 
            id: newId, 
            title: "Chat 1", 
            messages: [],
            selectedCourse: COURSES[0] // Default to first course
          }];
        }
      }
      
      return newTabs;
    });
  }, [activeTabId]);

  // Course change handler - updates the current tab's course
  const handleCourseChange = useCallback((newCourse: string) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === activeTabId
          ? { ...tab, selectedCourse: newCourse }
          : tab
      )
    );
  }, [activeTabId]);

  // Event handlers
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleConfigChange = (key: keyof ChatConfig, value: string | boolean) => {
    setChatConfig(prev => ({ ...prev, [key]: value }));
  };

  // Theme-based class names
  const themeClasses = {
    background: isDark 
      ? "bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white" 
      : "bg-gradient-to-b from-blue-50 via-white to-blue-100 text-gray-900",
    
    mainContainer: isDark 
      ? "" 
      : "",

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
    
    inputArea: isDark 
      ? "" 
      : "",
    
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
    
    footer: isDark 
      ? "text-white/40" 
      : "text-gray-500",
    
    closeButton: isDark 
      ? "text-slate-400 group-hover:text-white hover:bg-slate-600" 
      : "text-gray-400 group-hover:text-gray-600 hover:bg-gray-200",
    
    tooltip: isDark
      ? "bg-slate-800 text-white" 
      : "bg-slate-300 text-black",
    
    editInput: isDark 
      ? "bg-slate-600 text-white" 
      : "bg-white text-gray-900",
    
    label: isDark 
      ? "text-white" 
      : "text-gray-700",
    
    logo: isDark 
      ? "bg-gradient-to-br from-slate-500 to-blue-700" 
      : "bg-gradient-to-br from-slate-500 to-blue-700",
      
    fadeMask: isDark
      ? "bg-gradient-to-b from-transparent to-slate-900"
      : "bg-gradient-to-b from-transparent to-blue-50"
  };

  return (
    <div className={`h-screen ${themeClasses.background} flex flex-col relative`}>
      <div className="relative flex-1 flex justify-center items-stretch my-3">
        <div className={`w-full max-w-5xl flex flex-col rounded-2xl ${themeClasses.mainContainer} relative overflow-hidden`}>
          
          {/* Tab Bar */}
          <div className={`relative z-30`}>
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

          {/* Fade mask for messages that scroll under the tab bar - covers bottom half */}
          <div className={`absolute top-6 left-0 right-0 h-5 ${themeClasses.fadeMask} z-20 pointer-events-none`} />

          {/* Messages*/}
          <div
            ref={messagesContainerRef}
            className="absolute top-0 bottom-[153px] left-0 right-0 overflow-y-auto p-6 pt-16 space-y-3 z-10"
            style={{ 
              backdropFilter: "blur(6px)",
              scrollbarWidth: 'none'  // Hides scrollbar
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
        onClose={() => setIsPopupOpen(false)}
        onGenerate={() => {
          setIsPopupOpen(false);
          console.log("HELLO WORLD!!!")
        }}
        themeClasses={themeClasses}
      />
    </div>
  );
}