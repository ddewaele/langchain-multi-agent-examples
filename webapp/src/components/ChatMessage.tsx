import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  User,
  Bot,
  ChevronDown,
  ChevronRight,
  Wrench,
  Brain,
  Copy,
  Check,
  Search,
  Code,
  Palette,
} from "lucide-react";
import type { Message } from "../types";

const agentIcons: Record<string, React.ReactNode> = {
  researcher: <Search size={14} />,
  coder: <Code size={14} />,
  creative: <Palette size={14} />,
  supervisor: <Brain size={14} />,
};

const agentColors: Record<string, string> = {
  researcher: "#3b82f6",
  coder: "#10b981",
  creative: "#f59e0b",
  supervisor: "#8b5cf6",
};

interface Props {
  message: Message;
}

export function ChatMessage({ message }: Props) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`chat-message ${isUser ? "user" : "assistant"} ${isSystem ? "system" : ""}`}>
      <div className="message-avatar">
        {isUser ? (
          <div className="avatar user-avatar">
            <User size={16} />
          </div>
        ) : (
          <div
            className="avatar bot-avatar"
            style={{ borderColor: message.agent ? agentColors[message.agent] : "#8b5cf6" }}
          >
            {message.agent ? agentIcons[message.agent] || <Bot size={16} /> : <Bot size={16} />}
          </div>
        )}
      </div>

      <div className="message-body">
        {/* Agent badge */}
        {message.agent && !isUser && (
          <div className="agent-badge" style={{ color: agentColors[message.agent] }}>
            {agentIcons[message.agent]}
            <span>{message.agent}</span>
          </div>
        )}

        {/* Reasoning collapsible */}
        {message.reasoning && (
          <div className="reasoning-section">
            <button
              className="reasoning-toggle"
              onClick={() => setShowReasoning(!showReasoning)}
            >
              <Brain size={14} />
              <span>Reasoning</span>
              {showReasoning ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showReasoning && (
              <div className="reasoning-content">{message.reasoning}</div>
            )}
          </div>
        )}

        {/* Tool calls collapsible */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="tools-section">
            <button className="tools-toggle" onClick={() => setShowTools(!showTools)}>
              <Wrench size={14} />
              <span>
                {message.toolCalls.length} tool{message.toolCalls.length > 1 ? "s" : ""} used
              </span>
              {showTools ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showTools && (
              <div className="tools-list">
                {message.toolCalls.map((tc, i) => (
                  <div key={i} className="tool-call">
                    <div className="tool-name">{tc.name}</div>
                    <pre className="tool-args">{JSON.stringify(tc.args, null, 2)}</pre>
                    {tc.result && <pre className="tool-result">{tc.result}</pre>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message content */}
        <div className="message-content">
          {isUser ? (
            <>
              <p>{message.content}</p>
              {message.attachments?.map((att, i) => (
                <div key={i} className="attachment">
                  {att.type === "image" ? (
                    <img src={att.url} alt={att.name} className="attachment-image" />
                  ) : (
                    <div className="attachment-file">{att.name}</div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ children, ...props }) => (
                  <div className="code-block-wrapper">
                    <pre {...props}>{children}</pre>
                  </div>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* Copy button for assistant messages */}
        {!isUser && message.content && (
          <button className="copy-btn" onClick={handleCopy} title="Copy">
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}
