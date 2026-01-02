import { useState, useMemo, memo } from "react";
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
  isVisible,
  shouldAnimate,
  themeClasses
}: {
  citation: any;
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

// In-line Citation Component
const InlineCitation = memo(({
  postNumber,
  citation,
  themeClasses
}: {
  postNumber: string;
  citation?: any;
  themeClasses: any;
}) => {
  if (!citation) {
    return <span className="text-gray-400">@{postNumber}</span>;
  }

  const citationUrl = citation?.url;

  if (!citationUrl) {
    return <span className="text-gray-400">@{postNumber}</span>;
  }

  // Ensure URL is absolute and valid
  let absoluteUrl = citationUrl;
  if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
    absoluteUrl = `https://${absoluteUrl}`;
  }

  // Validate URL before rendering
  if (!absoluteUrl || absoluteUrl === '#' || absoluteUrl === window.location.href) {
    return <span className="text-gray-400">@{postNumber}</span>;
  }

  return (
    <a
      href={absoluteUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        // Stop event propagation to prevent any parent handlers from interfering
        e.stopPropagation();
        // Don't prevent default - let the browser handle navigation
      }}
      style={{ pointerEvents: 'auto', zIndex: 10 }}
      className={`inline-flex items-center justify-center min-w-fit h-5 px-1.5 mx-0.5 text-xs font-medium rounded-sm align-baseline transition-all hover:scale-110 cursor-pointer no-underline ${
        themeClasses.inlineCitation || 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800'
      }`}
      title={citation.title || `Post @${postNumber}`}
    >
      @{postNumber}
    </a>
  );
});

InlineCitation.displayName = 'InlineCitation';

// Process text to replace citation markers with markdown links
// Note: This runs before markdown parsing, so we need to avoid processing citations
// inside code blocks. We'll do a simple check to avoid common code block patterns.
function processCitations(text: string, citationMap?: Record<string, any>): string {
  if (!citationMap) return text;

  // Split text by code blocks to avoid processing citations inside them
  const codeBlockRegex = /```[\s\S]*?```|`[^`]+`/g;
  const parts: Array<{ text: string; isCode: boolean }> = [];
  let lastIndex = 0;
  let match;

  // Find all code blocks
  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      parts.push({ text: text.substring(lastIndex, match.index), isCode: false });
    }
    // Add code block
    parts.push({ text: match[0], isCode: true });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ text: text.substring(lastIndex), isCode: false });
  }

  // Process only non-code parts
  return parts.map(part => {
    if (part.isCode) {
      return part.text; // Keep code blocks as-is
    }

    // Match citation patterns like @123, @456, etc.
    // Format: @ followed by one or more digits
    return part.text.replace(/@(\d+)/g, (match, postNum, offset, string) => {
      // Check if this is part of an email address or other @ usage
      const before = string.substring(Math.max(0, offset - 1), offset);
      // If preceded by a letter or digit, it might be part of an email, skip it
      if (before && /[a-zA-Z0-9]/.test(before)) {
        return match;
      }

      // Look up citation by post number (as string key)
      const citation = citationMap[postNum];

      if (citation && citation.url) {
        // Replace with a markdown link using a special URL format
        // Format: @123 -> [@123](#citation-123) - we'll detect this in the link handler
        return `[@${postNum}](#citation-${postNum})`;
      }

      // Citation not found - return plain text without link
      return match;
    });
  }).join('');
}

function MessageBubble({
  id,
  role,
  text,
  course,
  citations,
  citationMap,
  needsMoreContext,
  notificationCreated,
  notificationLoading,
  postedToPiazza,
  isLoading,
  themeClasses,
  isFirstMessage,
  onNotifyMe,
  onPostToPiazza
}: MessageBubbleProps) {
  const [isCitationsExpanded, setIsCitationsExpanded] = useState<boolean>(false);
  const isUser = role === "user";

  // Process text to handle citations
  const processedText = useMemo(() => {
    if (!citationMap || role === "user") return text;
    return processCitations(text, citationMap);
  }, [text, citationMap, role]);

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
    a({ href, children, ...props }: any) {
      // Handle empty or invalid hrefs first
      if (!href || href === '#' || href.trim() === '') {
        // Check if this might be a citation that wasn't processed correctly
        const textContent = typeof children === 'string' ? children :
                           (Array.isArray(children) ? children.join('') : String(children));
        const citationMatch = textContent.match(/^@(\d+)$/);
        if (citationMatch && citationMap) {
          const postNumber = citationMatch[1];
          const citation = (citationMap as Record<string, any>)?.[postNumber];
          if (citation && citation.url) {
            return (
              <InlineCitation
                postNumber={postNumber}
                citation={citation}
                themeClasses={themeClasses}
              />
            );
          }
        }
        // Not a citation, just return the text without a link
        return <span className={themeClasses.link}>{children}</span>;
      }

      // Check if this is a citation link (using #citation-<post_number> format)
      if (href && href.startsWith('#citation-')) {
        const postNumber = href.replace('#citation-', '');
        const citation = (citationMap as Record<string, any>)?.[postNumber];

        if (citation?.url) {
          return (
            <InlineCitation
              postNumber={postNumber}
              citation={citation}
              themeClasses={themeClasses}
            />
          );
        }
        return <span className="text-gray-400">@{postNumber}</span>;
      }

      // For regular links, ensure href is valid
      if (href === window.location.href) {
        return <span className={themeClasses.link}>{children}</span>;
      }

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline ${themeClasses.link}`}
          {...props}
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
  }), [themeClasses, citationMap]);


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
        {role === "assistant" && isLoading ? (
          <div className="text-sm font-medium text-blue-400/60 animate-shimmer">
            Finding relevant Piazza posts…
          </div>
        ) : (
          <div className={bubbleClasses}>
            <div className="text-sm leading-5">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {processedText}
              </ReactMarkdown>
            </div>
            {isUser && course && (
              <div className={`absolute bottom-full right-0 mb-2 px-2 py-1 ${themeClasses.tooltip} text-xs rounded opacity-70 whitespace-nowrap pointer-events-none z-10`}>
                {course}
              </div>
            )}
          </div>
        )}
        {/* Needs More Context Buttons */}
        {!isUser && needsMoreContext && (
          <div className="mt-3 flex gap-2 w-full">
            <button
              onClick={() => onNotifyMe?.(id)}
              disabled={notificationLoading || notificationCreated}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                notificationCreated
                  ? 'bg-gray-400 opacity-60 cursor-not-allowed'
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
                  Following...
                </span>
              ) : notificationCreated ? (
                '✓ Topic Followed'
              ) : (
                '🔔 Follow Topic'
              )}
            </button>
            <button
              onClick={() => onPostToPiazza?.(id)}
              disabled={postedToPiazza}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                postedToPiazza
                  ? 'bg-gray-400 opacity-60 cursor-not-allowed'
                  : `${themeClasses.sendButton} hover:scale-[1.02] transform cursor-pointer`
              }`}
            >
              {postedToPiazza ? '✓ Posted to Piazza' : '📮 Post to Piazza'}
            </button>
          </div>
        )}

        {/* Citations - Collapsible */}
        {!isUser && (citations?.length ?? 0) > 0 && (
          <div className="mt-2 w-full">
            <button
              onClick={() => setIsCitationsExpanded(!isCitationsExpanded)}
              className={`flex items-center gap-2 text-xs ${themeClasses.label} mb-1 opacity-70 hover:opacity-100 transition-opacity cursor-pointer`}
            >
              <span className="transition-transform duration-200" style={{ transform: isCitationsExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                ▶
              </span>
              <span>Related Piazza threads</span>
            </button>
            {isCitationsExpanded && (
              <div className="space-y-1">
                {(citations ?? []).map((citation, index) => (
                  <CitationItem
                    key={`${citation.url}-${index}`}
                    citation={citation}
                    isVisible={true}
                    shouldAnimate={false}
                    themeClasses={themeClasses}
                  />
                ))}
              </div>
            )}
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
    prevProps.isLoading === nextProps.isLoading &&
    JSON.stringify(prevProps.citations) === JSON.stringify(nextProps.citations) &&
    JSON.stringify(prevProps.citationMap) === JSON.stringify(nextProps.citationMap) &&
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
