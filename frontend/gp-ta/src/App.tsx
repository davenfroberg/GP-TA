import { useState, useRef, useEffect, useCallback } from "react";
import type { KeyboardEvent } from "react";
import he from "he";

// Types
interface Citation {
  title: string;
  url: string;
  post_number?: string; // Optional post number for better citations
}

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  course?: string; // Add course to message data for user messages
  citations?: Citation[];
}

interface ChatTab {
  id: number;
  title: string;
  messages: Message[];
  selectedCourse: string; 
}

interface ChatConfig {
  prioritizeInstructor: boolean;
  model: string;
}

// Constants
const API_KEY = import.meta.env.VITE_GP_TA_API_KEY;
const API_ID = import.meta.env.VITE_GP_TA_API_ID;
const WEBSOCKET_URL = `wss://${API_ID}.execute-api.us-west-2.amazonaws.com/production/?api_key=${API_KEY}`;
const COURSES = ["CPSC 110", "CPSC 121", "CPSC 330", "CPSC 404", "CPSC 418"];
const MODELS = [
  { value: "gpt-5", label: "GPT-5" },
  { value: "gpt-5-mini", label: "GPT-5-mini" }
];
const ASSISTANT_GREETING_MESSAGE = "Hi, I'm GP-TA — how can I help with your course today?";
const EXAMPLE_PROMPTS = [
  "when is homework 1 due?",
  "how do I do question 5 on homework 2?",
  "what topics will be on the midterm?",
  "I missed an iClicker, is this okay?",
  "where are office hours held?",
  "how do I register for quiz 3?",
  "is lecture cancelled today?",
];
const MAX_NUMBER_OF_TABS = 6;

// Custom hook for theme detection
function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isDark;
}

export default function GlassChat() {
  const isDark = useTheme();
  
  // State management
  const [tabs, setTabs] = useState<ChatTab[]>([{ 
    id: Date.now(), 
    title: "Chat 1", 
    messages: [],
    selectedCourse: COURSES[0]
  }]);
  const [activeTabId, setActiveTabId] = useState<number>(Date.now());
  const [chatConfig, setChatConfig] = useState<ChatConfig>({
    prioritizeInstructor: false,
    model: "gpt-5"
  });
  const [input, setInput] = useState<string>("");
  const [editingTab, setEditingTab] = useState<{id: number, title: string} | null>(null);

  // Refs - now track per tab
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

  // Greeting animation
  const startGreeting = useCallback(() => {
    const assistantId = Date.now();
    
    // Add empty assistant message
    addMessagesToTab(activeTabId, [{ id: assistantId, role: "assistant", text: "" }]);

    // Type out greeting character by character
    let index = 0;
    const typeChar = () => {
      index++;
      setTabs(prev =>
        prev.map(tab =>
          tab.id === activeTabId
            ? {
                ...tab,
                messages: tab.messages.map(m =>
                  m.id === assistantId
                    ? { ...m, text: ASSISTANT_GREETING_MESSAGE.slice(0, index) }
                    : m
                ),
              }
            : tab
        )
      );

      if (index < ASSISTANT_GREETING_MESSAGE.length) {
        setTimeout(typeChar, 4 + Math.random());
      }
    };

    typeChar();
  }, [activeTabId, addMessagesToTab]);

  // Message sending - improved to show message immediately
  const sendMessage = useCallback(() => {
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
      : "bg-blue-400 hover:bg-blue-300 hover:border-blue-400 border border-blue-500 text-white",
    
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
          
          {/* Tab Bar - Now with frosted glass effect and higher z-index */}
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
              onTabTitleChange={(title) => setEditingTab(prev => prev ? { ...prev, title } : null)}
              onNewTab={createNewTab}
              themeClasses={themeClasses}
            />
          </div>

          {/* Fade mask for messages that scroll under the tab bar - covers bottom half */}
          <div className={`absolute top-6 left-0 right-0 h-5 ${themeClasses.fadeMask} z-20 pointer-events-none`} />

          {/* Messages - Now can scroll under the tab bar */}
          <div
            ref={messagesContainerRef}
            className="absolute top-0 bottom-[153px] left-0 right-0 overflow-y-auto p-6 pt-16 space-y-3 z-10"
            style={{ 
              backdropFilter: "blur(6px)",
              scrollbarWidth: 'none'  // Hides scrollbar in Firefox
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
    </div>
  );
}

// Example Prompts Component
interface ExamplePromptsProps {
  themeClasses: any;
}

function ExamplePrompts({ themeClasses }: ExamplePromptsProps) {
  const [currentText, setCurrentText] = useState<string>("");
  const [currentPromptIndex, setCurrentPromptIndex] = useState<number>(0);
  const [isTyping, setIsTyping] = useState<boolean>(true);

  useEffect(() => {
    const currentPrompt = EXAMPLE_PROMPTS[currentPromptIndex];
    
    if (isTyping) {
      // Typing phase
      if (currentText.length < currentPrompt.length) {
        const timeout = setTimeout(() => {
          setCurrentText(currentPrompt.slice(0, currentText.length + 1));
        }, 30 + Math.random() * 90); // Variable typing speed for natural feel
        
        return () => clearTimeout(timeout);
      } else {
        // Finished typing, wait then start backspacing
        const timeout = setTimeout(() => {
          setIsTyping(false);
        }, 2000); // Wait 2 seconds before backspacing
        
        return () => clearTimeout(timeout);
      }
    } else {
      // Backspacing phase
      if (currentText.length > 0) {
        const timeout = setTimeout(() => {
          setCurrentText(currentText.slice(0, -1));
        }, 30); // Faster backspacing
        
        return () => clearTimeout(timeout);
      } else {
        // Finished backspacing, move to next prompt
        const timeout = setTimeout(() => {
          setCurrentPromptIndex((prev) => (prev + 1) % EXAMPLE_PROMPTS.length);
          setIsTyping(true);
        }, 500); // Brief pause before next prompt
        
        return () => clearTimeout(timeout);
      }
    }
  }, [currentText, currentPromptIndex, isTyping]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
      
        {/* Main Title */}
        <h1 className={`text-3xl font-bold mb-2 ${themeClasses.label}`}>
          Welcome to GP-TA
        </h1>
        
        {/* Subtitle */}
        <p className={`text-lg opacity-70 mb-8 ${themeClasses.label}`}>
          Your AI Piazza companion
        </p>
        
        {/* Animated Example Prompt */}
        <div className="max-w-md mx-auto">
          <p className={`text-sm opacity-60 mb-3 ${themeClasses.label}`}>
            Try asking something like:
          </p>
          
          <div className={`relative p-4 rounded-xl border ${themeClasses.inputContainer} min-h-[60px] flex items-center justify-center`}>
            <span className={`text-lg ${themeClasses.label}`}>
              {currentText}
              <span className={`inline-block w-0.5 h-6 ml-1 ${isTyping ? 'animate-pulse' : ''} ${themeClasses.label === 'text-white' ? 'bg-white' : 'bg-gray-900'}`} />
            </span>
          </div>
        </div>
        
        {/* Helpful hint */}
        <div className="max-w-md mx-auto">
          <p className={`text-xs opacity-50 mt-6 ${themeClasses.label}`}>
            GP-TA answers are based only on your course's Piazza posts. <br/>If something hasn't been discussed there, GP-TA won't know about it.
          </p>
        </div>
      </div>
    </div>
  );
}

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

function TabBar({
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
            className={`flex items-center group px-3 py-2.5 text-sm select-none cursor-pointer ${
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
                className={`ml-3 px-2 py-0.5 -m-1 opacity-0 group-hover:opacity-100 rounded-sm ${themeClasses.closeButton}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        
        {tabs.length < MAX_NUMBER_OF_TABS && (
          <button
            onClick={onNewTab}
            className={`px-4 py-2 ${themeClasses.inactiveTab.includes('text-slate-300') ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

// Chat Input Component
interface ChatInputProps {
  input: string;
  chatConfig: ChatConfig;
  currentCourse: string;
  onInputChange: (value: string) => void;
  onConfigChange: (key: keyof ChatConfig, value: string | boolean) => void;
  onCourseChange: (course: string) => void;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  themeClasses: any;
}

function ChatInput({
  input,
  chatConfig,
  currentCourse,
  onInputChange,
  onConfigChange,
  onCourseChange,
  onSend,
  onKeyDown,
  themeClasses
}: ChatInputProps) {
  return (
    <div className={`${themeClasses.inputArea} absolute bottom-0 left-0 right-0 flex flex-col items-center gap-2 px-4 pb-1 rounded-b-2xl z-30`}>
      <div className={`p-5 rounded-3xl w-full shadow-lg ${themeClasses.inputContainer}`}>
        
        {/* Config Row */}
        <div className="flex items-center gap-3 mb-2">
          <select
            value={currentCourse}
            onChange={(e) => onCourseChange(e.target.value)}
            className={`${themeClasses.select} text-sm rounded-md px-3 py-2`}
          >
            {COURSES.map(course => (
              <option key={course} value={course} className="text-black">
                {course}
              </option>
            ))}
          </select>

          <div className="flex items-center text-sm gap-2 ml-2">
            <input
              id="prioritize"
              type="checkbox"
              checked={chatConfig.prioritizeInstructor}
              onChange={(e) => onConfigChange('prioritizeInstructor', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="prioritize" className={`select-none ${themeClasses.label}`}>
              Prioritize instructor answers
            </label>
          </div>

          <select
            value={chatConfig.model}
            onChange={(e) => onConfigChange('model', e.target.value)}
            className={`ml-auto ${themeClasses.select} text-xs rounded-md px-2 py-2`}
          >
            {MODELS.map(model => (
              <option key={model.value} value={model.value} className="text-black">
                {model.label}
              </option>
            ))}
          </select>
        </div>

        {/* Input Row */}
        <div className="flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type your question..."
            rows={1}
            className={`resize-none flex-1 min-h-[44px] max-h-32 rounded-xl p-3 ${themeClasses.textarea} text-sm`}
          />
          <button
            onClick={onSend}
            aria-label="Send"
            className={`flex items-center justify-center w-12 h-12 rounded-xl ${themeClasses.sendButton} shadow-sm active:scale-95`}
          >
            <SendIcon />
          </button>
        </div>
      </div>
      
      {/* Footer */}
      <div className={`text-xs ${themeClasses.footer} text-center`}>
        GP-TA can make mistakes. Check important info • Made with love by{" "}
        <a
          href="https://linkedin.com/in/davenfroberg"
          target="_blank"
          rel="noopener noreferrer"
        >
          <u>Daven Froberg</u>
        </a>
      </div>
    </div>
  );
}

// Message Bubble Component
interface MessageBubbleProps extends Message {
  themeClasses: any;
  isFirstMessage?: boolean;
}

function MessageBubble({ role, text, course, citations, themeClasses, isFirstMessage }: MessageBubbleProps) {
  const [visibleCitations, setVisibleCitations] = useState<number>(0);
  const [hasAnimated, setHasAnimated] = useState<boolean>(false);
  const isUser = role === "user";

  // Initialize state based on whether we have citations
  useEffect(() => {
    if (citations && citations.length > 0) {
      if (!hasAnimated) {
        // First time seeing citations - animate them in
        setVisibleCitations(0);
        setHasAnimated(true);
        
        const timeouts: number[] = [];
        
        citations.forEach((_, index) => {
          const timeout = setTimeout(() => {
            setVisibleCitations(prev => prev + 1);
          }, 50 + (index * 75));
          timeouts.push(timeout);
        });
        
        return () => {
          timeouts.forEach(timeout => clearTimeout(timeout));
        };
      } else {
        // Already animated - show all immediately
        setVisibleCitations(citations.length);
      }
    }
  }, [citations]);
  
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${isFirstMessage ? "mt-6" : ""}`}>
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[85%]`}>
        <div
          className={`break-words p-3 rounded-xl shadow-sm border relative group ${
            isUser
              ? `${themeClasses.userBubble} rounded-br-2xl`
              : `${themeClasses.assistantBubble} rounded-bl-2xl`
          }`}
        >
          <div className="text-sm leading-5 whitespace-pre-wrap">
            {text}
          </div>
          
          {isUser && course && (
            <div className={`absolute bottom-full right-0 mb-2 px-2 py-1 ${themeClasses.tooltip} text-xs rounded opacity-70 whitespace-nowrap pointer-events-none z-10`}>
              {course}
            </div>
          )}
        </div>

        {/* Citations */}
        {!isUser && citations && citations.length > 0 && (
          <div className="mt-2 space-y-1 w-full">
            <div className={`text-xs ${themeClasses.label} mb-1 opacity-70`}>
              Related Piazza threads:
            </div>
            {citations.map((citation, index) => (
              <div
                key={index}
                className={`transition-all duration-300 ease-out transform ${
                  index < visibleCitations
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2'
                }`}
              >
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block p-2 rounded-lg text-xs border transition-colors hover:opacity-80 ${
                    themeClasses.assistantBubble
                  } hover:scale-[1.02] transform transition-transform w-full`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-1 h-1 rounded-full bg-blue-500 mt-1.5"></div>
                    <span className="leading-4">
                      {he.decode(citation.title)}
                    </span>
                  </div>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Send Icon Component
function SendIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      width="20"
      height="20"
      stroke="currentColor"
      className="stroke-[1.5]"
    >
      <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}