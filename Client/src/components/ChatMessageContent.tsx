import { FC, useState, memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/utils";

interface ChatMessageContentProps {
  content: string;
  isUser: boolean;
}

interface CodeBlockProps {
  language?: string;
  code: string;
  isUser: boolean;
}

const CodeBlock: FC<CodeBlockProps> = ({ language, code, isUser }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code to clipboard:", err);
    }
  };

  return (
    <div
      className={cn(
        "relative my-2.5 rounded-xl overflow-hidden border shadow-sm font-mono text-xs text-left",
        isUser
          ? "bg-slate-950/85 border-white/20 text-cyan-100"
          : "bg-zinc-950/90 border-white/[0.08] text-zinc-200"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-3.5 py-1.5 border-b select-none",
          isUser
            ? "bg-white/[0.08] border-white/10 text-cyan-200"
            : "bg-white/[0.03] border-white/[0.06] text-zinc-400"
        )}
      >
        <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code block"
          className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-sans font-medium transition-colors cursor-pointer",
            isUser
              ? "hover:bg-white/15 text-cyan-200 hover:text-white"
              : "hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
          )}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-3.5 custom-scrollbar leading-relaxed">
        <pre className="m-0 p-0 font-mono text-[12px] whitespace-pre">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

export const ChatMessageContent: FC<ChatMessageContentProps> = memo(({ content, isUser }) => {
  return (
    <div className={cn(
      "w-full text-xs sm:text-[13px] leading-relaxed break-words",
      isUser ? "text-white" : "text-zinc-200"
    )}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1({ children }) {
            return (
              <h1 className={cn(
                "text-sm sm:text-base font-bold tracking-tight mt-3 mb-1.5 first:mt-0 pb-1 border-b",
                isUser ? "text-white border-white/20" : "text-white border-white/[0.08]"
              )}>
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className={cn(
                "text-xs sm:text-sm font-semibold tracking-tight mt-2.5 mb-1 first:mt-0",
                isUser ? "text-white font-bold" : "text-cyan-300"
              )}>
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className={cn(
                "text-xs sm:text-[13px] font-semibold mt-2 mb-1 first:mt-0",
                isUser ? "text-white" : "text-zinc-100"
              )}>
                {children}
              </h3>
            );
          },
          h4({ children }) {
            return (
              <h4 className={cn(
                "text-xs font-semibold mt-1.5 mb-0.5 first:mt-0",
                isUser ? "text-white" : "text-zinc-200"
              )}>
                {children}
              </h4>
            );
          },

          // Paragraphs
          p({ children }) {
            return (
              <p className="my-1.5 first:mt-0 last:mb-0 leading-relaxed">
                {children}
              </p>
            );
          },

          // Bold & Italic
          strong({ children }) {
            return (
              <strong className={cn(
                "font-semibold tracking-tight",
                isUser ? "text-white drop-shadow-sm font-bold" : "text-white font-semibold"
              )}>
                {children}
              </strong>
            );
          },
          em({ children }) {
            return (
              <em className={cn("italic", isUser ? "text-white/90" : "text-zinc-300")}>
                {children}
              </em>
            );
          },

          // Lists
          ul({ children }) {
            return (
              <ul className={cn(
                "my-1.5 pl-4 sm:pl-5 space-y-1 list-disc text-xs sm:text-[13px] leading-relaxed",
                isUser ? "marker:text-white/80" : "marker:text-cyan-400"
              )}>
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol className={cn(
                "my-1.5 pl-4 sm:pl-5 space-y-1 list-decimal text-xs sm:text-[13px] leading-relaxed",
                isUser ? "marker:text-white/80 font-medium" : "marker:text-cyan-400 font-mono"
              )}>
                {children}
              </ol>
            );
          },
          li({ children }) {
            return (
              <li className="leading-relaxed pl-0.5">
                {children}
              </li>
            );
          },

          // Blockquote
          blockquote({ children }) {
            return (
              <blockquote className={cn(
                "my-2 pl-3 py-1 rounded-r-lg border-l-2 text-xs italic",
                isUser
                  ? "border-white/60 bg-black/15 text-white/90"
                  : "border-cyan-400 bg-white/[0.02] text-zinc-300"
              )}>
                {children}
              </blockquote>
            );
          },

          // Code blocks & inline code
          pre({ children }) {
            return <div className="not-prose my-1">{children}</div>;
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");
            const isBlock = Boolean(match || className?.includes("language-") || codeString.includes("\n"));

            if (isBlock) {
              return (
                <CodeBlock
                  language={match ? match[1] : undefined}
                  code={codeString}
                  isUser={isUser}
                />
              );
            }

            return (
              <code
                className={cn(
                  "px-1.5 py-0.5 rounded-md font-mono text-[11px] sm:text-xs border transition-colors inline my-0.5",
                  isUser
                    ? "bg-black/30 text-cyan-100 border-white/20"
                    : "bg-white/[0.08] text-cyan-300 border-white/[0.08]"
                )}
                {...props}
              >
                {children}
              </code>
            );
          },

          // Tables
          table({ children }) {
            return (
              <div className="my-2.5 w-full overflow-x-auto rounded-xl border border-white/[0.08] custom-scrollbar">
                <table className={cn(
                  "w-full text-left border-collapse text-xs",
                  isUser ? "bg-black/20 text-white" : "bg-zinc-950/40 text-zinc-200"
                )}>
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead className={cn(
                "border-b text-[11px] font-semibold uppercase tracking-wider",
                isUser
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-white/[0.04] border-white/[0.08] text-zinc-300"
              )}>
                {children}
              </thead>
            );
          },
          th({ children }) {
            return <th className="py-2.5 px-3.5 font-semibold text-left border-b border-white/[0.08]">{children}</th>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-white/[0.04]">{children}</tbody>;
          },
          tr({ children }) {
            return (
              <tr className={cn(
                "transition-colors",
                isUser ? "hover:bg-white/[0.06]" : "hover:bg-white/[0.02]"
              )}>
                {children}
              </tr>
            );
          },
          td({ children }) {
            return (
              <td className={cn(
                "py-2 px-3.5 leading-relaxed align-top",
                isUser ? "text-white/90" : "text-zinc-300"
              )}>
                {children}
              </td>
            );
          },

          // Links
          a({ href, children }) {
            return (
              <a
                href={href}
                onClick={(e) => {
                  if (href && (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:"))) {
                    e.preventDefault();
                    import("@tauri-apps/plugin-opener")
                      .then(({ openUrl }) => openUrl(href))
                      .catch(() => window.open(href, "_blank", "noopener,noreferrer"));
                  }
                }}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "underline underline-offset-2 transition-colors cursor-pointer font-medium break-all",
                  isUser
                    ? "text-cyan-100 hover:text-white"
                    : "text-cyan-400 hover:text-cyan-300"
                )}
              >
                {children}
              </a>
            );
          },

          // Horizontal rule
          hr() {
            return (
              <hr className={cn(
                "my-2.5 border-0 border-t",
                isUser ? "border-white/20" : "border-white/[0.08]"
              )} />
            );
          },

          // Task lists checkboxes
          input({ type, checked, ...props }) {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  disabled
                  className="mr-1.5 rounded border-white/20 bg-white/10 text-cyan-500 focus:ring-0 accent-cyan-400 align-middle"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
});

ChatMessageContent.displayName = "ChatMessageContent";
