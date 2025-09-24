import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface PostGeneratorPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (details: string) => void;
  themeClasses: any; // your themeClasses from PiazzaChat
}

export default function PostGeneratorPopup({
  isOpen,
  onClose,
  onGenerate,
  themeClasses,
}: PostGeneratorPopupProps) {
  const [details, setDetails] = useState("");

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
            className={`w-full max-w-lg p-6 rounded-2xl border ${themeClasses.frostedPopup} shadow-2xl flex flex-col`}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h2 className={`text-lg font-semibold ${themeClasses.label}`}>
                Generate a Piazza Post
              </h2>
              <button onClick={onClose} className={`px-2 rounded-lg ${themeClasses.closeButton}`}>
                ✕
              </button>
            </div>

            {/* Instructions */}
            <p className={`text-sm mb-4 ${themeClasses.label} opacity-80`}>
              Please describe your post in more detail so we can generate a clear
              and helpful Piazza question.
            </p>

            {/* Textarea */}
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Type additional context here..."
              className={`flex-1 resize-none rounded-xl p-3 ${themeClasses.textarea} focus:outline-none focus:ring-2 focus:ring-blue-400`}
              style={{ minHeight: "150px" }}
            />

            {/* Footer */}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={onClose} className={`px-4 py-2 rounded-xl ${themeClasses.closeButton}`}>
                Cancel
              </button>
              <button
                onClick={() => {
                  onGenerate(details);
                  setDetails("");
                }}
                className={`px-4 py-2 rounded-xl ${themeClasses.sendButton} active:scale-95`}
                disabled={!details.trim()}
              >
                Generate Post
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
