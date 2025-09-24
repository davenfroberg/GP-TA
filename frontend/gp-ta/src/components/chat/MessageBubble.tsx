import { useState, useEffect } from "react";
import he from "he";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Message } from "../../types/chat";

// Message Bubble Component
interface MessageBubbleProps extends Message {
  themeClasses: any;
  isFirstMessage?: boolean;
}

export default function MessageBubble({ 
  role, 
  text, 
  course, 
  citations, 
  themeClasses, 
  isFirstMessage 
}: MessageBubbleProps) {
  const [visibleCitations, setVisibleCitations] = useState<number>(0);
  const isUser = role === "user";

  // Initialize state based on whether we have citations
  useEffect(() => {
    if (citations && citations.length > 0) {
      setVisibleCitations(0);
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
          <div className="text-sm leading-5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Custom code block component
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const isInline = !match;
                  
                  return !isInline ? (
                    <SyntaxHighlighter
                      style={tomorrow as any}
                      language={match[1]}
                      PreTag="div"
                      className="rounded-md"
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>
                      {children}
                    </code>
                  );
                },
                // Custom paragraph component to preserve spacing
                p({ children }) {
                  return <p className="mb-2 last:mb-0">{children}</p>;
                },
                // Custom list components
                ul({ children }) {
                  return <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>;
                },
                // Custom blockquote
                blockquote({ children }) {
                  return (
                    <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-2">
                      {children}
                    </blockquote>
                  );
                },
                // Custom headers
                h1({ children }) {
                  return <h1 className="text-lg font-bold mb-2">{children}</h1>;
                },
                h2({ children }) {
                  return <h2 className="text-base font-bold mb-2">{children}</h2>;
                },
                h3({ children }) {
                  return <h3 className="text-sm font-bold mb-1">{children}</h3>;
                },
                // Custom link styling
                a({ href, children }) {
                  return (
                    <a 
                      href={href} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700 underline"
                    >
                      {children}
                    </a>
                  );
                },
                // Custom table styling
                table({ children }) {
                  return (
                    <table className="border-collapse border border-gray-300 w-full mb-2 text-xs">
                      {children}
                    </table>
                  );
                },
                th({ children }) {
                  return (
                    <th className="border border-gray-300 px-2 py-1 bg-gray-100 font-semibold">
                      {children}
                    </th>
                  );
                },
                td({ children }) {
                  return (
                    <td className="border border-gray-300 px-2 py-1">
                      {children}
                    </td>
                  );
                },
              }}
            >
              {text}
            </ReactMarkdown>
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