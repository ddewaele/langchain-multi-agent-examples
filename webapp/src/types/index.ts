export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent?: string;
  toolCalls?: ToolCall[];
  steps?: AgentStep[];
  reasoning?: string;
  timestamp: string;
  attachments?: Attachment[];
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

/** An execution step in the agent pipeline (supervisor call, subagent call, tool call, etc.) */
export interface AgentStep {
  id: string;
  type: "agent" | "tool" | "subagent";
  name: string;
  /** Agent that owns this step */
  agent?: string;
  args?: Record<string, unknown>;
  result?: string;
  /** Nested steps (e.g., subagent's own tool calls) */
  children?: AgentStep[];
  status: "running" | "done" | "error";
  timestamp: string;
}

export interface Attachment {
  type: "image" | "file";
  name: string;
  url: string;
  mimeType?: string;
}

export interface Thread {
  id: string;
  title: string;
  messages: Array<{ role: string; content: string; metadata?: Record<string, unknown> }>;
  createdAt: string;
  updatedAt: string;
}

export interface StreamEvent {
  event: string;
  data: unknown;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
}
