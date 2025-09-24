import type { KeyboardEvent } from "react";
import type { ChatConfig } from "../../types/chat";
import { COURSES, MODELS } from "../../constants/chat";
import SendIcon from "../icons/SendIcon";

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

export default function ChatInput({
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
            className={`flex items-center justify-center w-12 h-12 rounded-2xl ${themeClasses.sendButton} shadow-sm active:scale-95 cursor-pointer`}
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