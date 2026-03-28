import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * Extended state for the multi-agent system.
 * Inherits MessagesAnnotation (messages array with reducer)
 * and adds routing/metadata fields.
 */
export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  /** Which specialist agent is currently active */
  activeAgent: Annotation<string>({ reducer: (_, b) => b, default: () => "supervisor" }),
  /** Reasoning trace from the supervisor */
  reasoning: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  /** Tool calls being executed (for UI visualization) */
  toolCalls: Annotation<Array<{ name: string; args: Record<string, unknown>; result?: string }>>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

export type AgentStateType = typeof AgentState.State;
