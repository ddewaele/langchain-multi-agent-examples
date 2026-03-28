import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  User, Bot, ChevronDown, ChevronRight, Wrench, Brain,
  Copy, Check, Search, Code, Palette, Loader, GitBranch,
} from "lucide-react";
import type { Message, AgentStep } from "../types";

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

function StepItem({ step, defaultOpen = false }: { step: AgentStep; defaultOpen?: boolean }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const color = step.agent ? agentColors[step.agent] || "#8b5cf6" : "#71717a";
  const icon = step.type === "subagent"
    ? (step.agent ? agentIcons[step.agent] : <GitBranch size={13} />)
    : <Wrench size={13} />;

  const hasChildren = step.children && step.children.length > 0;
  const hasContent = step.result || step.args;

  return (
    <div className="step-item">
      <button className="step-header" onClick={() => setExpanded(!expanded)}>
        <span className="step-chevron">
          {(hasChildren || hasContent) ? (
            expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : <span style={{ width: 12 }} />}
        </span>
        {step.status === "running" ? (
          <Loader size={13} className="spinner" style={{ color }} />
        ) : (
          <span style={{ color }}>{icon}</span>
        )}
        <span className="step-name" style={{ color: step.type === "subagent" ? color : undefined }}>
          {step.name}
        </span>
        {step.type === "tool" && step.status === "done" && (
          <span className="step-done-badge">done</span>
        )}
        {hasChildren && (
          <span className="step-count">{step.children!.length} tool{step.children!.length > 1 ? "s" : ""}</span>
        )}
      </button>

      {expanded && (
        <div className="step-body">
          {/* Tool args */}
          {step.args && Object.keys(step.args).length > 0 && (
            <pre className="step-args">{JSON.stringify(step.args, null, 2)}</pre>
          )}
          {/* Subagent result — show preview, full content is in message body */}
          {step.result && step.type === "subagent" && (
            <div className="step-result">
              <div className="step-result-label">Response preview</div>
              <div className="step-result-preview">
                {step.result.slice(0, 300)}{step.result.length > 300 ? "..." : ""}
              </div>
            </div>
          )}
          {/* Tool result */}
          {step.result && step.type === "tool" && (
            <div className="step-result">
              <div className="step-result-label">Result</div>
              <pre className="step-result-content">{step.result}</pre>
            </div>
          )}
          {/* Child steps */}
          {hasChildren && (
            <div className="step-children">
              {step.children!.map((child) => (
                <StepItem key={child.id} step={child} defaultOpen={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ message }: Props) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const [showTools, setShowTools] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasSteps = message.steps && message.steps.length > 0;
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0 && !hasSteps;

  return (
    <div className={`chat-message ${isUser ? "user" : "assistant"} ${isSystem ? "system" : ""}`}>
      <div className="message-avatar">
        {isUser ? (
          <div className="avatar user-avatar"><User size={16} /></div>
        ) : (
          <div className="avatar bot-avatar" style={{ borderColor: message.agent ? agentColors[message.agent] : "#8b5cf6" }}>
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
            <button className="reasoning-toggle" onClick={() => setShowReasoning(!showReasoning)}>
              <Brain size={14} />
              <span>Reasoning</span>
              {showReasoning ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showReasoning && <div className="reasoning-content">{message.reasoning}</div>}
          </div>
        )}

        {/* Execution steps (new rich view) */}
        {hasSteps && (
          <div className="steps-section">
            <button className="steps-toggle" onClick={() => setShowSteps(!showSteps)}>
              <GitBranch size={14} />
              <span>Execution</span>
              <span className="steps-summary">
                {message.steps!.length} agent{message.steps!.length > 1 ? "s" : ""}
                {(() => {
                  const totalTools = message.steps!.reduce((n, s) => n + (s.children?.length || 0), 0);
                  return totalTools > 0 ? `, ${totalTools} tool call${totalTools > 1 ? "s" : ""}` : "";
                })()}
              </span>
              {showSteps ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showSteps && (
              <div className="steps-list">
                {message.steps!.map((step) => (
                  <StepItem key={step.id} step={step} defaultOpen={true} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Legacy tool calls (for backends that don't emit steps) */}
        {hasToolCalls && (
          <div className="tools-section">
            <button className="tools-toggle" onClick={() => setShowTools(!showTools)}>
              <Wrench size={14} />
              <span>{message.toolCalls!.length} tool{message.toolCalls!.length > 1 ? "s" : ""} used</span>
              {showTools ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showTools && (
              <div className="tools-list">
                {message.toolCalls!.map((tc, i) => (
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
                  <div className="code-block-wrapper"><pre {...props}>{children}</pre></div>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {!isUser && message.content && (
          <button className="copy-btn" onClick={handleCopy} title="Copy">
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}
