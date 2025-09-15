import { useState, useRef, useEffect } from "react";
import type { KeyboardEvent, ChangeEvent } from "react";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
}

export default function GlassChat() {
  const [course, setCourse] = useState<string>("CPSC 110");
  const [prioritizeInstructor, setPrioritizeInstructor] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", text: "Hi — how can I help with your course today?" },
    { id: 2, role: "user", text: "Explain recursion briefly." },
    { id: 3, role: "assistant", text: "Recursion is a function calling itself... (short summary)" },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed) return;

    const nextId = messages.length ? messages[messages.length - 1].id + 1 : 1;
    const userMsg: Message = { id: nextId, role: "user", text: trimmed };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    setTimeout(() => {
      const assistantMsg: Message = {
        id: nextId + 1,
        role: "assistant",
        text: `(${course}${prioritizeInstructor ? " • instructor-priority" : ""}) Received: ${trimmed}`,
      };
      setMessages((m) => [...m, assistantMsg]);
    }, 500);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function startNewChat() {
    setMessages([]);
    setInput("");
  }

  return (
  <div className="h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 flex flex-col text-white relative">
  {/* Header */}
  <div className="w-full flex justify-start items-center p-6 gap-4">
    <div className="text-2xl font-bold text-white">GP-TA</div>
  </div>

  <div className="relative flex-1 flex justify-center items-stretch" style={{ bottom: '40px' }}>
    <div className="w-full max-w-2xl flex flex-col rounded-2xl bg-white/6 backdrop-blur-lg border border-white/10 shadow-2xl h-full relative">
      {/* Top button */}
      <div className="flex justify-start p-4">
        <button
          onClick={startNewChat}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-sm text-white border border-white/20 shadow-sm"
        >
          New Chat
        </button>
      </div>

      {/* Scrollable messages clipped above the prompt */}
      <div
        ref={listRef}
        className="absolute top-[66px] bottom-[173px] left-0 right-0 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-600/70 scrollbar-track-transparent"
        style={{ backdropFilter: 'blur(6px)' }}
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} text={m.text} />
        ))}
      </div>

      {/* Prompt + Footer */}
      <div className="bg-white/6 absolute bottom-0 left-0 right-0 flex flex-col items-center gap-2 px-4 pb-4">
        {/* Prompt input */}
        <div className="bg-slate-800 p-4 rounded-xl w-full shadow-lg border border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <select
              value={course}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setCourse(e.target.value)}
              className="bg-slate-700 border border-white/20 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 text-white"
            >
              <option className="text-black">CPSC 110</option>
              <option className="text-black">CPSC 210</option>
              <option className="text-black">CPSC 330</option>
            </select>

            <div className="flex items-center text-sm gap-2 ml-2">
              <input
                id="prioritize"
                type="checkbox"
                checked={prioritizeInstructor}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPrioritizeInstructor(e.target.checked)}
                className="w-4 h-4 rounded bg-white/6 border-white/6 focus:ring-0"
              />
              <label htmlFor="prioritize" className="select-none text-white">
                Prioritize instructor answers
              </label>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <textarea
              value={input}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your question..."
              rows={1}
              className="resize-none flex-1 min-h-[44px] max-h-32 rounded-xl p-3 bg-slate-700 border border-white/20 placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm text-white"
            />

            <button
              onClick={sendMessage}
              aria-label="Send"
              className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-600 hover:bg-slate-500 border border-white/20 shadow-sm transition-transform active:scale-95 text-white"
            >
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
            </button>
          </div>
        </div>

        {/* Footer text */}
        <div className="text-xs text-white/40 text-center mt-2">
          GP-TA can make mistakes. Check important info • Made with love by{' '}
          <a href="https://linkedin.com/in/davenfroberg" target="_blank" rel="noopener noreferrer">
            <u>Daven Froberg</u>
          </a>
        </div>
      </div>
    </div>
  </div>
</div>
);





}

interface MessageBubbleProps {
  role: "user" | "assistant";
  text: string;
}

function MessageBubble({ role, text }: MessageBubbleProps) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}> 
      <div
        className={`max-w-[85%] break-words p-3 rounded-xl shadow-sm border ${
          isUser
            ? "bg-white/10 text-white backdrop-blur-sm border-white/8 rounded-br-2xl"
            : "bg-white/6 text-white backdrop-blur-sm border-white/6 rounded-bl-2xl"
        }`}
      >
        <div className="text-sm leading-5">{text}</div>
      </div>
    </div>
  );
}
