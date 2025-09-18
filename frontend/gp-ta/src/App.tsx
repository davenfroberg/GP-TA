import { useState, useRef, useEffect, useCallback } from "react";
import type { KeyboardEvent } from "react";

// Types
interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
}

interface ChatTab {
  id: number;
  title: string;
  messages: Message[];
}

interface ChatConfig {
  course: string;
  prioritizeInstructor: boolean;
  model: string;
}

// Constants
const API_KEY = import.meta.env.VITE_GP_TA_API_KEY;
const API_ID = import.meta.env.VITE_GP_TA_API_ID;
const WEBSOCKET_URL = `wss://${API_ID}.execute-api.us-west-2.amazonaws.com/production/?api_key=${API_KEY}`;
const BROWSER_STORAGE_KEYS = {
  TABS: "glasschat_tabs",
  ACTIVE_TAB_ID: "glasschat_activeTabId"
};
const COURSES = ["CPSC 110", "CPSC 121", "CPSC 330", "CPSC 404", "CPSC 418"];
const MODELS = [
  { value: "gpt-5", label: "GPT-5" },
  { value: "gpt-5-mini", label: "GPT-5-mini" }
];
const ASSISTANT_GREETING_MESSAGE = "Hi — how can I help with your course today?";

export default function GlassChat() {
  // State management
  const [tabs, setTabs] = useState<ChatTab[]>(loadTabsFromStorage);
  const [activeTabId, setActiveTabId] = useState<number>(loadActiveTabIdFromStorage);
  const [chatConfig, setChatConfig] = useState<ChatConfig>({
    course: "CPSC 110",
    prioritizeInstructor: false,
    model: "gpt-5"
  });
  const [input, setInput] = useState<string>("");
  const [editingTab, setEditingTab] = useState<{id: number, title: string} | null>(null);

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const messageBufferRef = useRef<string>("");
  const currentAssistantIdRef = useRef<number | null>(null);

  // Derived state
  const activeTab = tabs.find(t => t.id === activeTabId)!;

  // Storage helpers
  function loadTabsFromStorage(): ChatTab[] {
    try {
      const stored = localStorage.getItem(BROWSER_STORAGE_KEYS.TABS);
      return stored ? JSON.parse(stored) : createDefaultTab();
    } catch {
      return createDefaultTab();
    }
  }

  function loadActiveTabIdFromStorage(): number {
    const stored = localStorage.getItem(BROWSER_STORAGE_KEYS.ACTIVE_TAB_ID);
    return stored ? parseInt(stored, 10) : Date.now();
  }

  function createDefaultTab(): ChatTab[] {
    return [{ id: Date.now(), title: "Chat 1", messages: [] }];
  }

  // Effects for persistence
  useEffect(() => {
    localStorage.setItem(BROWSER_STORAGE_KEYS.TABS, JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem(BROWSER_STORAGE_KEYS.ACTIVE_TAB_ID, activeTabId.toString());
  }, [activeTabId]);

  // Auto-scroll messages
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [activeTab.messages]);

  // Initialize greeting for new tabs
  useEffect(() => {
    if (activeTab.messages.length === 0) {
      startGreeting();
    }
  }, [activeTabId, tabs]);

  // WebSocket management
  useEffect(() => {
    const ws = new WebSocket(WEBSOCKET_URL);
    wsRef.current = ws;

    ws.onopen = () => console.log("WebSocket connected");
    ws.onclose = () => console.log("WebSocket disconnected");
    ws.onerror = (err) => console.error("WebSocket error", err);
    ws.onmessage = handleWebSocketMessage;

    return () => ws.close();
  }, [activeTabId]);

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      console.error("Invalid message format:", event.data);
      return;
    }

    switch (data.type) {
      case "chat_done":
        messageBufferRef.current = "";
        break;
      case "chat_chunk":
        messageBufferRef.current += data.message;
        updateAssistantMessage(messageBufferRef.current);
        break;
      case "progress_update":
        updateAssistantMessage(data.message);
        break;
      case "chat_start":
        messageBufferRef.current = "";
        updateAssistantMessage("");
        break;
    }
  }, [activeTabId]);

  // Message management
  const updateAssistantMessage = useCallback((text: string) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === activeTabId
          ? {
              ...tab,
              messages: tab.messages.map(m =>
                m.role === "assistant" && m.id === currentAssistantIdRef.current
                  ? { ...m, text }
                  : m
              ),
            }
          : tab
      )
    );
  }, [activeTabId]);

  const addMessagesToActiveTab = useCallback((newMessages: Message[]) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === activeTabId
          ? { ...tab, messages: [...tab.messages, ...newMessages] }
          : tab
      )
    );
  }, [activeTabId]);

  const clearActiveTabMessages = useCallback(() => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === activeTabId
          ? { ...tab, messages: [] }
          : tab
      )
    );
  }, [activeTabId]);

  // Greeting animation
  const startGreeting = useCallback(() => {
    const assistantId = Date.now();
    
    // Add empty assistant message
    addMessagesToActiveTab([{ id: assistantId, role: "assistant", text: "" }]);

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
  }, [activeTabId, addMessagesToActiveTab]);

  // Message sending
  const sendMessage = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const userMsgId = Date.now();
    const assistantMsgId = userMsgId + 1;
    
    const userMsg: Message = { id: userMsgId, role: "user", text: trimmed };
    const assistantMsg: Message = { 
      id: assistantMsgId, 
      role: "assistant", 
      text: "Finding relevant Piazza posts..." 
    };

    currentAssistantIdRef.current = assistantMsgId;
    addMessagesToActiveTab([userMsg, assistantMsg]);
    setInput("");
    messageBufferRef.current = "";

    // Send WebSocket message
    wsRef.current.send(JSON.stringify({
      action: "chat",
      message: trimmed,
      class: chatConfig.course.toLowerCase().replace(" ", ""),
      model: chatConfig.model,
      prioritizeInstructor: chatConfig.prioritizeInstructor,
    }));
  }, [input, chatConfig, addMessagesToActiveTab]);

  // Tab management
  const createNewTab = useCallback(() => {
    const id = Date.now();
    const newTab: ChatTab = { 
      id, 
      title: `Chat ${tabs.length + 1}`, 
      messages: [] 
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

      // Handle active tab switching if we're closing the active tab
      if (tabId === activeTabId) {
        const nextTab = newTabs[tabIndex - 1] || newTabs[tabIndex] || newTabs[0];
        if (nextTab) {
          setActiveTabId(nextTab.id);
        } else {
          // Create new tab if none exist
          const newId = Date.now();
          setActiveTabId(newId);
          return [{ id: newId, title: "Chat 1", messages: [] }];
        }
      }
      
      return newTabs;
    });
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

  return (
    <div className="h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 flex flex-col text-white relative">
      <div className="relative flex-1 flex justify-center items-stretch my-3">
        <div className="w-full max-w-4xl flex flex-col rounded-2xl bg-white/6 backdrop-blur-lg border border-white/10 shadow-2xl relative">
          
          {/* Tab Bar */}
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
          />

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            className="absolute top-[42px] bottom-[153px] left-0 right-0 overflow-y-auto p-6 space-y-3 scrollbar-thin scrollbar-thumb-slate-600/10 scrollbar-track-transparent"
            style={{ backdropFilter: "blur(6px)" }}
          >
            {activeTab.messages.map((message) => (
              <MessageBubble key={message.id} {...message} />
            ))}
          </div>

          {/* Input Area */}
          <ChatInput
            input={input}
            chatConfig={chatConfig}
            onInputChange={setInput}
            onConfigChange={handleConfigChange}
            onSend={sendMessage}
            onKeyDown={handleKeyDown}
          />
          
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
  onNewTab
}: TabBarProps) {
  return (
    <div className="flex items-center bg-slate-800 rounded-t-2xl overflow-x-auto pl-7">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex items-center group px-3 py-2.5 border-r border-slate-700 text-sm select-none cursor-pointer ${
            activeTabId === tab.id
              ? "bg-slate-700 text-white rounded-sm"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-sm"
          }`}
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
              className="bg-slate-600 text-white rounded text-sm outline-none"
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
              className="ml-3 px-1.5 py-0.5 -m-1 text-slate-400 group-hover:text-white opacity-0 group-hover:opacity-100 transition rounded-sm hover:bg-slate-600"
            >
              ×
            </button>

          )}
        </div>
      ))}
      
      <button
        onClick={onNewTab}
        className="px-3 py-2 text-slate-300 hover:text-white"
      >
        +
      </button>
    </div>
  );
}

// Chat Input Component
interface ChatInputProps {
  input: string;
  chatConfig: ChatConfig;
  onInputChange: (value: string) => void;
  onConfigChange: (key: keyof ChatConfig, value: string | boolean) => void;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

function ChatInput({
  input,
  chatConfig,
  onInputChange,
  onConfigChange,
  onSend,
  onKeyDown
}: ChatInputProps) {
  return (
    <div className="bg-white/6 absolute bottom-0 left-0 right-0 flex flex-col items-center gap-2 px-4 pb-1">
      <div className="p-4 rounded-xl w-full shadow-lg border border-white/20">
        
        {/* Config Row */}
        <div className="flex items-center gap-3 mb-2">
          <select
            value={chatConfig.course}
            onChange={(e) => onConfigChange('course', e.target.value)}
            className="bg-slate-700 border border-white/20 text-sm rounded-md px-3 py-2 text-white"
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
              className="w-4 h-4 rounded bg-white/6 border-white/6"
            />
            <label htmlFor="prioritize" className="select-none text-white">
              Prioritize instructor answers
            </label>
          </div>

          <select
            value={chatConfig.model}
            onChange={(e) => onConfigChange('model', e.target.value)}
            className="ml-auto bg-slate-600 border border-white/20 text-xs rounded-md px-2 py-2 text-white"
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
            className="resize-none flex-1 min-h-[44px] max-h-32 rounded-xl p-3 bg-slate-700 border border-white/20 placeholder-white/60 text-sm text-white"
          />
          <button
            onClick={onSend}
            aria-label="Send"
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-600 hover:bg-slate-500 border border-white/20 shadow-sm active:scale-95 text-white"
          >
            <SendIcon />
          </button>
        </div>
      </div>
      
      {/* Footer */}
      <div className="text-xs text-white/40 text-center">
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
function MessageBubble({ role, text }: Message) {
  const isUser = role === "user";
  
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] break-words p-3 rounded-xl shadow-sm border ${
          isUser
            ? "bg-white/20 text-white border-white/8 rounded-br-2xl"
            : "bg-white/6 text-white border-white/6 rounded-bl-2xl"
        }`}
      >
        <div className="text-sm leading-5 whitespace-pre-wrap">
          {text}
        </div>
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