import { fetchAuthSession } from "aws-amplify/auth";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

interface PostGeneratorPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onPostSuccess?: (postLink: string) => void;
  themeClasses: any; // themeClasses from PiazzaChat
  activeTab?: any; // activeTab from PiazzaChat
  messageId?: number | null; // The ID of the assistant message that was clicked
}

type PopupState = 'input' | 'generating' | 'editing' | 'posting';

// Course folder mappings with hierarchical structure
interface FolderItem {
  name: string;
  children?: string[];
}

const COURSE_FOLDERS: Record<string, FolderItem[]> = {
  "CPSC 110": [
    { name: "logistics" },
    { name: "lectures" },
    {
      name: "labs",
      children: ["general_lab_questions", "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7", "lab8", "lab9", "lab10", "lab11"]
    },
    { name: "problem_sets",
      children: ["general_problem_set_questions", "ps1", "ps2", "ps3", "ps4", "ps5", "ps6", "ps7", "ps8", "ps9", "ps10", "ps11"]
    },
    { name: "exams",
      children: ["general_exam_questions", "mt1", "mt2", "final"]
    },
    { name: "other" }
  ],
  "CPSC 121": [
    { name: "logistics" },
    { name: "other" },
    { name: "lecture" },
    { name: "homework" },
    {
      name: "labs",
      children: ["lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7", "lab8", "lab9"]
    },
    { name: "practice_questions",
      children: ["pq1", "pq2", "pq3", "pq4", "pq5", "pq6", "pq7", "pq8", "pq9", "pq10", "pq11", "pq_labs"]
    },
    { name: "quizzes",
      children: ["q0", "q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10", "q11"]
    },
    { name: "final" },
    { name: "examlets" }
  ],
  "CPSC 330": [
    { name: "logistics" },
    { name: "lecture" },
    { name: "hw1" },
    { name: "hw2" },
    { name: "hw3" },
    { name: "hw4" },
    { name: "hw5" },
    { name: "hw6" },
    { name: "hw7" },
    { name: "hw8" },
    { name: "hw9" },
    { name: "exam" },
    { name: "other" },
    { name: "grading_concerns" },
    { name: "iclicker" },
    { name: "midterm" }
  ],
  "CPSC 404": [
    { name: "exams" },
    { name: "logistics" },
    { name: "other" },
    { name: "lecture" },
    { name: "in_class_exercises" },
    { name: "sql_server_lab" }
  ],
  "CPSC 418": [
    { name: "exam" },
    { name: "logistics" },
    { name: "other" },
    {
      name: "exams",
      children: ["mt1", "mt2", "final"]
    },
    { name: "bug_bounties" },
    { name: "pikas",
      children: ["pika1", "pika2", "pika3", "pika4", "pika5", "pika6", "pika7", "pika8", "pika9", "pika10"]
    },
    { name: "lecture" },
    { name: "hw",
      children: ["hw1", "hw2", "hw3", "hw4", "hw5", "hw6", "hw7"]
    }
  ]
};

export default function PostGeneratorPopup({
  isOpen,
  onClose,
  onPostSuccess,
  themeClasses,
  activeTab,
  messageId,
}: PostGeneratorPopupProps) {
  const [details, setDetails] = useState("");
  const [state, setState] = useState<PopupState>('input');
  const [editableTitle, setEditableTitle] = useState("");
  const [editableContent, setEditableContent] = useState("");
  const [postAnonymously, setPostAnonymously] = useState(true);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedCourse, setSelectedCourse] = useState("");

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
      setEditableTitle("");
      setEditableContent("");
      setPostAnonymously(true);
      setSelectedFolders(new Set());
      setExpandedFolders(new Set());
      setSelectedCourse("");
    }
  }, [isOpen]);

  // Set initial course when popup opens - use course from the message if available
  useEffect(() => {
    if (isOpen && activeTab && messageId) {
      // Find the course from the original user message
      type Message = { id: number; role: string; text: string; course?: string };
      const messages: Message[] = activeTab.messages;
      const assistantIndex = messages.findIndex((m: Message) => m.id === messageId && m.role === "assistant");

      if (assistantIndex !== -1 && assistantIndex > 0) {
        const userMessage = messages[assistantIndex - 1];
        if (userMessage && userMessage.role === "user" && userMessage.course) {
          setSelectedCourse(userMessage.course);
          return;
        }
      }
    }

    // Fallback to activeTab's selected course
    if (isOpen && activeTab?.selectedCourse) {
      setSelectedCourse(activeTab.selectedCourse);
    }
  }, [isOpen, activeTab, messageId]);

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
    setEditableTitle("");
    setEditableContent("");
    setPostAnonymously(true);
    setSelectedFolders(new Set(["General"]));
    setExpandedFolders(new Set());
    setSelectedCourse("");
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
      // Get the specific assistant message and corresponding user message
      if (!activeTab) {
        setState('input');
        return;
      }

      type Message = { id: number; role: string; text: string; course?: string };
      const messages: Message[] = activeTab.messages;

      // Find the specific assistant message by messageId, or fall back to the last one
      let assistantMessage: Message | undefined;
      let originalQuestion = "";
      let messageCourse: string | undefined;

      if (messageId) {
        // Find the specific assistant message that was clicked
        const assistantIndex = messages.findIndex((m: Message) => m.id === messageId && m.role === "assistant");

        if (assistantIndex !== -1) {
          assistantMessage = messages[assistantIndex];
          // The user's message should be right before this assistant message
          if (assistantIndex > 0) {
            const userMessage = messages[assistantIndex - 1];
            if (userMessage && userMessage.role === "user") {
              originalQuestion = userMessage.text;
              messageCourse = userMessage.course;
            }
          }
        }
      }

      // Fallback to latest messages if messageId not found or not provided
      if (!assistantMessage) {
        const assistantMessages = messages.filter((m: Message) => m.role === "assistant");
        assistantMessage = assistantMessages[assistantMessages.length - 1];
        const userMessages = messages.filter((m: Message) => m.role === "user");
        if (userMessages.length >= 2) {
          const userMessage = userMessages[userMessages.length - 2];
          originalQuestion = userMessage.text;
          messageCourse = userMessage.course;
        }
      }

      // Update selected course if we found one from the message
      if (messageCourse) {
        setSelectedCourse(messageCourse);
      }

      // Get JWT token for authentication
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        throw new Error("No authentication token available. Please log in again.");
      }

      const response = await fetch(`https://${import.meta.env.VITE_PIAZZA_POST_ID}.execute-api.us-west-2.amazonaws.com/prod/generate-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          llm_attempt: assistantMessage?.text || "",
          original_question: originalQuestion,
          additional_context: additionalContext
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

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

    // Get JWT token for authentication
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();

    if (!idToken) {
      throw new Error("No authentication token available. Please log in again.");
    }

    try {
      const response = await fetch(`https://${import.meta.env.VITE_PIAZZA_POST_ID}.execute-api.us-west-2.amazonaws.com/prod/post-to-piazza`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          api_key: import.meta.env.VITE_GP_TA_API_KEY,
          course: selectedCourse || activeTab?.selectedCourse || "CPSC 110",
          post_type: "question",
          post_folders: getSelectedPaths(),
          post_subject: editableTitle,
          post_content: editableContent,
          anonymous: postAnonymously
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Call success callback and close popup
        if (onPostSuccess) {
          onPostSuccess(data.post_link);
        }
      } else {
        throw new Error(data.error || 'Failed to post to Piazza');
      }

    } catch (error) {
      console.error('Error posting to Piazza:', error);
      setState('editing'); // Go back to editing state on error
    }
  };

  // Get available folders for the current course
  const getAvailableFolders = () => {
    const course = selectedCourse || activeTab?.selectedCourse;
    if (!course) return [{ name: "General" }];
    return COURSE_FOLDERS[course] || [{ name: "General" }];
  };

  // Handle folder selection
  const handleFolderSelect = (folderName: string, keepDropdownOpen = false) => {
    setSelectedFolders(prev => {
      const newSet = new Set(prev);
      const folder = getAvailableFolders().find(f => f.name === folderName);

      if (newSet.has(folderName)) {
        // Deselecting parent - also deselect all children
        newSet.delete(folderName);
        if (folder?.children) {
          folder.children.forEach(child => {
            newSet.delete(`${folderName}/${child}`);
          });
        }
      } else {
        // Selecting parent
        newSet.add(folderName);
      }
      return newSet;
    });

    // Close other dropdowns when selecting a folder (unless keeping dropdown open)
    if (!keepDropdownOpen) {
      setExpandedFolders(new Set());
    }
  };

  // Handle dropdown toggle (without selecting the folder)
  const handleDropdownToggle = (folderName: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderName)) {
        newSet.delete(folderName);
      } else {
        newSet.add(folderName);
      }
      return newSet;
    });
  };

  // Handle subfolder selection
  const handleSubFolderSelect = (parentFolderName: string, subFolderName: string) => {
    setSelectedFolders(prev => {
      const newSet = new Set(prev);
      const fullPath = `${parentFolderName}:${subFolderName}`;

      if (newSet.has(fullPath)) {
        newSet.delete(fullPath);
      } else {
        newSet.add(fullPath);
        // Also select the parent folder when selecting a child
        newSet.add(parentFolderName);
      }
      return newSet;
    });
  };

  // Check if a folder is selected
  const isFolderSelected = (folderName: string) => {
    return selectedFolders.has(folderName);
  };

  // Check if a subfolder is selected
  const isSubFolderSelected = (parentFolderName: string, subFolderName: string) => {
    return selectedFolders.has(`${parentFolderName}:${subFolderName}`);
  };

  // Get all selected paths
  const getSelectedPaths = () => {
    return Array.from(selectedFolders);
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
        and helpful Piazza question. Be as specific as possible.
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

       {/* Course Display */}
       <div className="mb-3">
         <div className="flex items-center gap-2">
           <span className={`text-sm font-medium ${themeClasses.label}`}>
             Posting to:
           </span>
           <span className={`px-2 py-1 rounded text-sm ${themeClasses.textarea} bg-gray-50 dark:bg-gray-750`}>
             {selectedCourse || "Select a course"}
           </span>
         </div>
       </div>

      {/* Folder Selection */}
      <div className="mb-3">
        <label className={`block text-sm font-medium ${themeClasses.label} mb-2`}>
          Select Folder
        </label>
        <div className="flex flex-wrap gap-2">
          {getAvailableFolders().map((folder) => (
            <div key={folder.name} className="relative">
              <div className="flex">
                {folder.children ? (
                  <>
                    <button
                      onClick={() => handleDropdownToggle(folder.name)}
                      className={`px-3 py-1.5 rounded-l-lg text-sm font-medium transition-colors border-2 ${
                        isFolderSelected(folder.name)
                          ? "bg-blue-500 text-white border-blue-500"
                          : `${themeClasses.textarea} hover:bg-gray-100 dark:hover:bg-gray-700 border-transparent`
                      }`}
                    >
                      {folder.name}
                    </button>
                    <button
                      onClick={() => handleDropdownToggle(folder.name)}
                      className={`px-2 py-1.5 rounded-r-lg text-xs transition-colors border-2 border-l-0 ${
                        isFolderSelected(folder.name)
                          ? "bg-blue-500 text-blue-200 border-blue-500"
                          : `${themeClasses.textarea} hover:bg-gray-100 dark:hover:bg-gray-700 border-transparent`
                      }`}
                    >
                      {expandedFolders.has(folder.name) ? '▼' : '▶'}
                    </button>
                  </>
                ) : (
                    <button
                      onClick={() => handleFolderSelect(folder.name)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                        isFolderSelected(folder.name)
                          ? "bg-blue-500 text-white border-blue-500"
                          : `${themeClasses.textarea} hover:bg-gray-100 dark:hover:bg-gray-700 border-transparent`
                      }`}
                    >
                      {folder.name}
                    </button>
                )}
              </div>

              {/* Subfolder dropdown */}
              {folder.children && expandedFolders.has(folder.name) && (
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 min-w-max">
                  {/* Parent folder option */}
                  <button
                    onClick={() => handleFolderSelect(folder.name, true)}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors rounded-t-lg ${
                      isFolderSelected(folder.name)
                        ? "bg-blue-400 text-white"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    {folder.name}
                  </button>
                  {/* Child folders */}
                  {folder.children.map((subFolder) => (
                    <button
                      key={subFolder}
                      onClick={() => handleSubFolderSelect(folder.name, subFolder)}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors last:rounded-b-lg ${
                        isSubFolderSelected(folder.name, subFolder)
                          ? "bg-blue-400 text-white"
                          : "hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      {subFolder}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
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

      {/* Anonymous Post Checkbox */}
      <div className="flex items-center mb-6">
        <input
          type="checkbox"
          id="postAnonymouslyEdit"
          checked={postAnonymously}
          onChange={(e) => setPostAnonymously(e.target.checked)}
          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
        />
        <label htmlFor="postAnonymouslyEdit" className={`ml-2 text-sm font-medium ${themeClasses.label}`}>
          Post anonymously
        </label>
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
          className={`px-4 py-2 rounded-xl ${themeClasses.sendButton} ${(!editableTitle.trim() || !editableContent.trim() || selectedFolders.size === 0) ? "opacity-30 hover:opacity-37" : "active:scale-95 cursor-pointer"}`}
          disabled={!editableTitle.trim() || !editableContent.trim() || selectedFolders.size === 0}
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
