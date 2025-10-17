import { useState, useEffect, useMemo, memo, useRef } from "react";
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
  onNotifyMe?: (messageId: number) => void;
  onPostToPiazza?: (messageId: number) => void;
}

// Memoized Citation Component
const CitationItem = memo(({ 
  citation, 
  index, 
  isVisible, 
  shouldAnimate,
  themeClasses 
}: {
  citation: any;
  index: number;
  isVisible: boolean;
  shouldAnimate: boolean;
  themeClasses: any;
}) => (
  <div
    className={`${
      shouldAnimate 
        ? `transition-all duration-300 ease-out transform ${
            isVisible
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2'
          }`
        : 'opacity-100 translate-y-0'
    }`}
  >
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block p-2 rounded-lg text-xs border transition-colors hover:opacity-80 ${
        themeClasses.citation
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
));

CitationItem.displayName = 'CitationItem';

function MessageBubble({ 
  id,
  role, 
  text, 
  course, 
  citations, 
  needsMoreContext,
  notificationCreated,
  notificationLoading,
  themeClasses, 
  isFirstMessage,
  onNotifyMe,
  onPostToPiazza
}: MessageBubbleProps) {
  const [visibleCitations, setVisibleCitations] = useState<number>(0);
  const [shouldAnimateCitations, setShouldAnimateCitations] = useState<boolean>(false);
  const previousCitationsLengthRef = useRef<number>(0);
  const hasAnimatedRef = useRef<boolean>(false);
  const isUser = role === "user";

  // Memoize markdown components to prevent recreation on every render
  const markdownComponents = useMemo(() => ({
    code({ node, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = !match;
      
      return !isInline ? (
        <SyntaxHighlighter
          style={tomorrow as any}
          language={match[1]}
          PreTag="div"
          className="rounded-md my-2"
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code 
          className={`px-1 py-0.5 rounded text-sm ${themeClasses.inlineCode}`} 
          {...props}
        >
          {children}
        </code>
      );
    },
    p({ children }: any) {
      return <p className="mb-2 last:mb-0">{children}</p>;
    },
    ul({ children }: any) {
      return <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>;
    },
    ol({ children }: any) {
      return <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>;
    },
    blockquote({ children }: any) {
      return (
        <blockquote className={`border-l-4 pl-4 italic my-2 ${themeClasses.blockquote}`}>
          {children}
        </blockquote>
      );
    },
    h1({ children }: any) {
      return <h1 className="text-lg font-bold mb-2">{children}</h1>;
    },
    h2({ children }: any) {
      return <h2 className="text-base font-bold mb-2">{children}</h2>;
    },
    h3({ children }: any) {
      return <h3 className="text-sm font-bold mb-1">{children}</h3>;
    },
    a({ href, children }: any) {
      return (
        <a 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer"
          className={`underline ${themeClasses.link}`}
        >
          {children}
        </a>
      );
    },
    table({ children }: any) {
      return (
        <table className={`border-collapse border w-full mb-2 text-xs ${themeClasses.tableBorder}`}>
          {children}
        </table>
      );
    },
    th({ children }: any) {
      return (
        <th className={`border px-2 py-1 font-semibold ${themeClasses.tableHeader}`}>
          {children}
        </th>
      );
    },
    td({ children }: any) {
      return (
        <td className={`border px-2 py-1 ${themeClasses.tableBorder}`}>
          {children}
        </td>
      );
    },
  }), [themeClasses]);

  // Enhanced citation animation effect
  useEffect(() => {
    if (!citations?.length) {
      setVisibleCitations(0);
      setShouldAnimateCitations(false);
      hasAnimatedRef.current = false;
      previousCitationsLengthRef.current = 0;
      return;
    }
    
    const currentLength = citations.length;
    const previousLength = previousCitationsLengthRef.current;
    
    const isFirstTimeReceived = previousLength === 0 && currentLength > 0;
    const hasNewCitations = currentLength > previousLength;
    
    if (isFirstTimeReceived || (hasNewCitations && !hasAnimatedRef.current)) {
      setShouldAnimateCitations(true);
      setVisibleCitations(0);
      hasAnimatedRef.current = true;
      
      const timeoutId = setTimeout(() => {
        let currentVisible = 0;
        const interval = setInterval(() => {
          currentVisible += 1;
          setVisibleCitations(currentVisible);
          
          if (currentVisible >= currentLength) {
            clearInterval(interval);
          }
        }, 75);
        
        return () => clearInterval(interval);
      }, 50);
      
      previousCitationsLengthRef.current = currentLength;
      return () => clearTimeout(timeoutId);
    } else {
      setShouldAnimateCitations(false);
      setVisibleCitations(currentLength);
      previousCitationsLengthRef.current = currentLength;
    }
  }, [citations?.length]);

  const bubbleClasses = useMemo(() => 
    `break-words p-3 rounded-xl shadow-sm border relative group ${
      isUser
        ? `${themeClasses.userBubble} rounded-br-2xl`
        : `${themeClasses.assistantBubble} rounded-bl-2xl`
    }`, [isUser, themeClasses.userBubble, themeClasses.assistantBubble]
  );

  const containerClasses = useMemo(() => 
    `flex ${isUser ? "justify-end" : "justify-start"} ${isFirstMessage ? "mt-6" : ""}`,
    [isUser, isFirstMessage]
  );

  return (
    <div className={containerClasses}>
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[80%]`}>
        <div className={bubbleClasses}>
          <div className="text-sm leading-5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
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
        {/* Needs More Context Buttons */}
        {!isUser && (
          <div className="mt-3 flex gap-2 w-full">
            <button
              onClick={() => onNotifyMe?.(id)}
              disabled={notificationLoading || notificationCreated}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                notificationCreated
                  ? 'bg-gray-400 opacity-60'
                  : notificationLoading
                  ? `${themeClasses.sendButton} cursor-wait opacity-80`
                  : `${themeClasses.sendButton} hover:scale-[1.02] transform cursor-pointer`
              }`}
            >
              {notificationLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating...
                </span>
              ) : notificationCreated ? (
                '✓ Notification Created!'
              ) : (
                '🔔 Create Notification'
              )}
            </button>
            {!isUser && needsMoreContext && (
            <button
              onClick={() => onPostToPiazza?.(id)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                themeClasses.sendButton
              } hover:scale-[1.02] transform cursor-pointer`}
            >
              📮 Post to Piazza
            </button>
            )}
          </div>
        )}
        
        {/* Citations */}
        {!isUser && (citations?.length ?? 0) > 0 && (
          <div className="mt-2 space-y-1 w-full">
            <div className={`text-xs ${themeClasses.label} mb-1 opacity-70`}>
              Related Piazza threads:
            </div>
            {(citations ?? []).map((citation, index) => (
              <CitationItem
                key={`${citation.url}-${index}`}
                citation={citation}
                index={index}
                isVisible={index < visibleCitations}
                shouldAnimate={shouldAnimateCitations}
                themeClasses={themeClasses}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.text === nextProps.text &&
    prevProps.role === nextProps.role &&
    prevProps.course === nextProps.course &&
    prevProps.isFirstMessage === nextProps.isFirstMessage &&
    prevProps.needsMoreContext === nextProps.needsMoreContext &&
    prevProps.notificationCreated === nextProps.notificationCreated &&
    prevProps.notificationLoading === nextProps.notificationLoading &&
    JSON.stringify(prevProps.citations) === JSON.stringify(nextProps.citations) &&
    prevProps.themeClasses.userBubble === nextProps.themeClasses.userBubble &&
    prevProps.themeClasses.assistantBubble === nextProps.themeClasses.assistantBubble &&
    prevProps.themeClasses.inlineCode === nextProps.themeClasses.inlineCode &&
    prevProps.themeClasses.blockquote === nextProps.themeClasses.blockquote &&
    prevProps.themeClasses.link === nextProps.themeClasses.link &&
    prevProps.themeClasses.tableBorder === nextProps.themeClasses.tableBorder &&
    prevProps.themeClasses.tableHeader === nextProps.themeClasses.tableHeader &&
    prevProps.themeClasses.tooltip === nextProps.themeClasses.tooltip &&
    prevProps.themeClasses.label === nextProps.themeClasses.label &&
    prevProps.themeClasses.citation === nextProps.themeClasses.citation &&
    prevProps.themeClasses.sendButton === nextProps.themeClasses.sendButton
  );
});