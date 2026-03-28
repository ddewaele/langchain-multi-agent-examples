import { Search, Code, Palette, Brain, Wrench, Loader } from "lucide-react";
import type { ToolCall } from "../types";

const agentConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  supervisor: { icon: <Brain size={14} />, label: "Supervisor", color: "#8b5cf6" },
  researcher: { icon: <Search size={14} />, label: "Research Agent", color: "#3b82f6" },
  coder: { icon: <Code size={14} />, label: "Code Agent", color: "#10b981" },
  creative: { icon: <Palette size={14} />, label: "Creative Agent", color: "#f59e0b" },
  researcher_tools: { icon: <Wrench size={14} />, label: "Running tools", color: "#3b82f6" },
  coder_tools: { icon: <Wrench size={14} />, label: "Running tools", color: "#10b981" },
  creative_tools: { icon: <Wrench size={14} />, label: "Running tools", color: "#f59e0b" },
};

interface Props {
  activeAgent: string | null;
  activeTools: ToolCall[];
  isStreaming: boolean;
}

export function AgentStatus({ activeAgent, activeTools, isStreaming }: Props) {
  if (!isStreaming) return null;

  const config = activeAgent ? agentConfig[activeAgent] : null;

  return (
    <div className="agent-status">
      <div className="agent-status-inner">
        <Loader size={14} className="spinner" />
        {config ? (
          <>
            <span style={{ color: config.color }}>{config.icon}</span>
            <span>{config.label}</span>
          </>
        ) : (
          <span>Processing...</span>
        )}
        {activeTools.length > 0 && (
          <span className="active-tool">
            <Wrench size={12} />
            {activeTools[activeTools.length - 1].name}
          </span>
        )}
      </div>
    </div>
  );
}
