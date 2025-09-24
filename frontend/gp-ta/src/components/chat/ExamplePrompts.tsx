import { useState, useEffect } from "react";
import { EXAMPLE_PROMPTS } from "../../constants/chat";

// Example Prompts Component
interface ExamplePromptsProps {
  themeClasses: any;
}

export default function ExamplePrompts({ themeClasses }: ExamplePromptsProps) {
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