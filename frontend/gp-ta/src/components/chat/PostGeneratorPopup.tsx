import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

interface PostGeneratorPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onPostSuccess?: () => void;
  themeClasses: any; // themeClasses from PiazzaChat
  activeTab?: any; // activeTab from PiazzaChat
}

type PopupState = 'input' | 'generating' | 'editing' | 'posting';

interface GeneratedPost {
  post_title: string;
  post_content: string;
}

export default function PostGeneratorPopup({
  isOpen,
  onClose,
  onPostSuccess,
  themeClasses,
  activeTab,
}: PostGeneratorPopupProps) {
  const [details, setDetails] = useState("");
  const [state, setState] = useState<PopupState>('input');
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [editableTitle, setEditableTitle] = useState("");
  const [editableContent, setEditableContent] = useState("");

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
  if (isOpen && state === "input" && inputRef.current) {
    inputRef.current.focus();
  }
}, [isOpen, state]);

  // Reset state when popup opens/closes
  useEffect(() => {
    if (!isOpen) {
      setDetails("");
      setState('input');
      setGeneratedPost(null);
      setEditableTitle("");
      setEditableContent("");
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleCancel = () => {
    setDetails("");
    setState('input');
    setGeneratedPost(null);
    setEditableTitle("");
    setEditableContent("");
    onClose();
  };

  const handleGenerate = async () => {
    setState('generating');
    
    try {
      // Call the original onGenerate function but don't close popup
      // We'll need to modify the parent component to handle this differently
      await generatePost(details);
    } catch (error) {
      console.error('Error generating post:', error);
      setState('input');
    }
  };

  const generatePost = async (additionalContext: string) => {
    try {
      // Get the last assistant response and second-to-last user message from activeTab
      if (!activeTab) {
        setState('input');
        return;
      }
      
      type Message = { role: string; text: string };
      const messages: Message[] = activeTab.messages;
      const lastAssistantMessage = messages.filter((m: Message) => m.role === "assistant").pop();
      const userMessages = messages.filter((m: Message) => m.role === "user");
      const originalQuestion = userMessages.length >= 2 ? userMessages[userMessages.length - 2].text : "";
      
      const response = await fetch(`https://${import.meta.env.VITE_PIAZZA_POST_ID}.execute-api.us-west-2.amazonaws.com/prod/generate-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          llm_attempt: lastAssistantMessage?.text || "",
          original_question: originalQuestion,
          additional_context: additionalContext
        })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      setGeneratedPost(data);
      setEditableTitle(data.post_title);
      setEditableContent(data.post_content);
      setState('editing');
      
    } catch (error) {
      console.error('Error generating post:', error);
      setState('input');
    }
  };

  const handlePost = async () => {
    setState('posting');
    
    // Simulate 3 second loading
    setTimeout(() => {
      // Call success callback and close popup
      if (onPostSuccess) {
        onPostSuccess();
      }
    }, 3000);
  };

  const renderInputState = () => (
    <>
      {/* Header */}
      <div className="flex justify-between items-center mb-4 border-b pb-2">
        <h2 className={`text-lg font-semibold ${themeClasses.label}`}>
          Generate a Piazza Post
        </h2>
      </div>

      {/* Instructions */}
      <p className={`text-sm mb-4 ${themeClasses.label} opacity-80`}>
        Please describe your post in more detail so we can generate a clear
        and helpful Piazza question.
      </p>

      {/* Textarea */}
      <textarea
        ref={inputRef}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Type additional context here..."
        className={`flex-1 resize-none rounded-xl p-3 ${themeClasses.textarea} focus:outline-none focus:ring-2 focus:ring-blue-400`}
        style={{ minHeight: "150px" }}
      />

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-6">
        <button 
          onClick={handleCancel}
          className={`px-4 py-2 rounded-xl ${themeClasses.closeButton} cursor-pointer`}
        >
          Cancel
        </button>
        <button
          onClick={handleGenerate}
          className={`px-4 py-2 rounded-xl ${themeClasses.sendButton} ${!details.trim() ? "opacity-30 hover:opacity-37" : "active:scale-95 cursor-pointer"}`}
          disabled={!details.trim()}
        >
          Generate Post
        </button>
      </div>
    </>
  );

  const renderGeneratingState = () => (
    <>
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-green-500 mb-4"></div>
        <p className={`text-lg font-medium ${themeClasses.label}`}>
          Generating your post...
        </p>
        <p className={`text-sm ${themeClasses.label} opacity-60 mt-2`}>
          This may take a moment
        </p>
      </div>
    </>
  );

  const renderEditingState = () => (
    <>
      {/* Header */}
      <div className="flex justify-between items-center mb-4 border-b pb-2">
        <h2 className={`text-lg font-semibold ${themeClasses.label}`}>
          Review Your Post
        </h2>
      </div>

      {/* Title Input */}
      <div className="mb-4">
        <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
          Post Title
        </label>
        <input
          type="text"
          value={editableTitle}
          onChange={(e) => setEditableTitle(e.target.value)}
          className={`w-full rounded-xl p-3 ${themeClasses.textarea} focus:outline-none focus:ring-2 focus:ring-blue-400`}
          placeholder="Enter post title..."
        />
      </div>

      {/* Content Textarea */}
      <div className="mb-6">
        <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
          Post Content
        </label>
        <textarea
          value={editableContent}
          onChange={(e) => setEditableContent(e.target.value)}
          className={`w-full resize-none rounded-xl p-3 ${themeClasses.textarea} focus:outline-none focus:ring-2 focus:ring-blue-400`}
          style={{ minHeight: "200px" }}
          placeholder="Enter post content..."
        />
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3">
        <button 
          onClick={handleCancel}
          className={`px-4 py-2 rounded-xl ${themeClasses.closeButton} cursor-pointer`}
        >
          Cancel
        </button>
        <button
          onClick={handlePost}
          className={`px-4 py-2 rounded-xl ${themeClasses.sendButton} ${(!editableTitle.trim() || !editableContent.trim()) ? "opacity-30 hover:opacity-37" : "active:scale-95 cursor-pointer"}`}
          disabled={!editableTitle.trim() || !editableContent.trim()}
        >
          Post to Piazza
        </button>
      </div>
    </>
  );

  const renderPostingState = () => (
    <>
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-500 mb-4"></div>
        <p className={`text-lg font-medium ${themeClasses.label}`}>
          Posting to Piazza...
        </p>
        <p className={`text-sm ${themeClasses.label} opacity-60 mt-2`}>
          Almost done!
        </p>
      </div>
    </>
  );

  const renderCurrentState = () => {
    switch (state) {
      case 'input':
        return renderInputState();
      case 'generating':
        return renderGeneratingState();
      case 'editing':
        return renderEditingState();
      case 'posting':
        return renderPostingState();
      default:
        return renderInputState();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={`w-full max-w-4xl p-6 rounded-2xl border ${themeClasses.frostedPopup} shadow-2xl flex flex-col`}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
          >
            {renderCurrentState()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}