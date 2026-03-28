import { createAgent, tool } from "langchain";
import { z } from "zod";
import { researchTools, codeTools, creativeTools } from "./tools.js";
import type { EventEmitter } from "events";

/**
 * Multi-agent supervisor using LangChain.js `createAgent`.
 * Agents-as-tools pattern with subagent step streaming.
 */

const MODEL = process.env.LLM_MODEL || "anthropic:claude-sonnet-4-20250514";

// ── Event bus for streaming subagent internals to the server ──

type StepListener = (step: {
  type: "subagent_start" | "subagent_tool" | "subagent_tool_result" | "subagent_done";
  agent: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  content?: string;
}) => void;

let stepListener: StepListener | null = null;

export function onStep(listener: StepListener) {
  stepListener = listener;
}

export function clearStepListener() {
  stepListener = null;
}

function emitStep(step: Parameters<StepListener>[0]) {
  stepListener?.(step);
}

// ── Helpers ──

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }
  return JSON.stringify(content);
}

// ── Specialist Agents ──

const researchAgent = createAgent({
  name: "research_agent",
  model: MODEL,
  tools: researchTools,
  systemPrompt: `You are a Research specialist. You excel at:
- Finding and synthesizing information
- Answering factual questions accurately
- Providing well-sourced, comprehensive answers

Use your tools to search for current information when needed.
IMPORTANT: Limit yourself to a maximum of 2-3 tool calls per request. Do NOT keep searching repeatedly — gather what you need quickly, then synthesize a thorough answer from what you have.`,
});

const coderAgent = createAgent({
  name: "coder_agent",
  model: MODEL,
  tools: codeTools,
  systemPrompt: `You are a Code specialist. You excel at:
- Writing clean, efficient, well-documented code
- Debugging and fixing issues
- Code review and analysis
- Explaining technical concepts

IMPORTANT: Write code DIRECTLY in your response using markdown code blocks.
Do NOT try to execute code. You are a code WRITER, not a runner.
Only use tools to look up documentation or calculate something.`,
});

const creativeAgent = createAgent({
  name: "creative_agent",
  model: MODEL,
  tools: creativeTools,
  systemPrompt: `You are a Creative specialist. You excel at:
- Writing compelling content (articles, stories, copy)
- Brainstorming and ideation
- Structuring and outlining documents
- Adapting tone and style to the audience

Create engaging, well-structured content that matches the requested style.`,
});

// ── Subagent wrappers that stream internal steps ──

async function runSubagentWithSteps(
  agent: ReturnType<typeof createAgent>,
  agentName: string,
  task: string
): Promise<string> {
  emitStep({ type: "subagent_start", agent: agentName });

  let finalContent = "";

  // Stream the subagent to capture its internal tool calls
  const stream = await agent.stream(
    { messages: [{ role: "user", content: task }] },
    { streamMode: "updates" as any, recursionLimit: 20 }
  );

  for await (const chunk of stream) {
    for (const [nodeName, update] of Object.entries(chunk as Record<string, any>)) {
      if (update?.messages) {
        for (const msg of update.messages) {
          const msgType = msg?._getType?.();

          // AI message with tool calls
          if ((msgType === "ai" || msgType === "AIMessageChunk") && msg?.tool_calls?.length) {
            for (const tc of msg.tool_calls) {
              emitStep({
                type: "subagent_tool",
                agent: agentName,
                toolName: tc.name,
                toolArgs: tc.args,
              });
            }
          }

          // Tool result messages
          if (msgType === "tool") {
            const result = extractText(msg.content);
            emitStep({
              type: "subagent_tool_result",
              agent: agentName,
              toolName: msg.name || "tool",
              toolResult: result.slice(0, 500),
            });
          }

          // Final AI message (no tool calls)
          if ((msgType === "ai" || msgType === "AIMessageChunk") && !msg?.tool_calls?.length) {
            const text = extractText(msg.content);
            if (text) finalContent = text;
          }
        }
      }
    }
  }

  emitStep({ type: "subagent_done", agent: agentName, content: finalContent });
  return finalContent || "Task complete.";
}

const callResearcher = tool(
  async ({ task }) => runSubagentWithSteps(researchAgent as any, "researcher", task),
  {
    name: "research",
    description: "Delegate to the Research specialist for factual questions, web search, information gathering, and data analysis",
    schema: z.object({ task: z.string().describe("The research task or question") }),
  }
);

const callCoder = tool(
  async ({ task }) => runSubagentWithSteps(coderAgent as any, "coder", task),
  {
    name: "code",
    description: "Delegate to the Code specialist for writing code, debugging, code review, technical explanations",
    schema: z.object({ task: z.string().describe("The coding task or question") }),
  }
);

const callCreative = tool(
  async ({ task }) => runSubagentWithSteps(creativeAgent as any, "creative", task),
  {
    name: "creative",
    description: "Delegate to the Creative specialist for writing, brainstorming, content creation",
    schema: z.object({ task: z.string().describe("The creative task or writing request") }),
  }
);

// ── Supervisor Agent ──

export const supervisor = createAgent({
  name: "supervisor",
  model: MODEL,
  tools: [callResearcher, callCoder, callCreative],
  systemPrompt: `You are a Supervisor agent that coordinates a team of specialists.

Your team:
- **research**: Facts, web search, data analysis, current events
- **code**: Writing code, debugging, code review, technical explanations
- **creative**: Writing, brainstorming, content creation, copywriting

How to work:
1. Analyze the user's request
2. Delegate to the appropriate specialist(s) using the tools
3. Present the specialist's response to the user, adding any synthesis or context needed

For simple greetings or meta-questions, respond directly without delegating.
When the specialist returns a complete answer, present it as-is (don't summarize away important details like code blocks).`,
});
