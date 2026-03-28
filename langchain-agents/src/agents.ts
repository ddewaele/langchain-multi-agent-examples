import { createAgent, tool } from "langchain";
import { z } from "zod";
import { researchTools, codeTools, creativeTools } from "./tools.js";

/**
 * Multi-agent supervisor using LangChain.js `createAgent`.
 *
 * Architecture: Supervisor (createAgent) with three specialist subagents
 * wrapped as tools. The supervisor decides which specialist to invoke
 * and synthesizes the final response.
 *
 * This is the "agents-as-tools" pattern — NO manual LangGraph graph
 * construction. Each createAgent call builds an internal ReAct graph.
 */

const MODEL = process.env.LLM_MODEL || "anthropic:claude-sonnet-4-20250514";

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
Always provide thorough, well-structured answers with clear explanations.`,
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

// ── Subagent Tool Wrappers ──

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

const callResearcher = tool(
  async ({ task }) => {
    const result = await researchAgent.invoke({
      messages: [{ role: "user", content: task }],
    });
    const lastMsg = result.messages[result.messages.length - 1];
    return extractText(lastMsg?.content) || "Research complete but no content returned.";
  },
  {
    name: "research",
    description: "Delegate to the Research specialist for factual questions, web search, information gathering, and data analysis",
    schema: z.object({
      task: z.string().describe("The research task or question to investigate"),
    }),
  }
);

const callCoder = tool(
  async ({ task }) => {
    const result = await coderAgent.invoke({
      messages: [{ role: "user", content: task }],
    });
    const lastMsg = result.messages[result.messages.length - 1];
    return extractText(lastMsg?.content) || "Code task complete but no content returned.";
  },
  {
    name: "code",
    description: "Delegate to the Code specialist for writing code, debugging, code review, technical explanations, and programming tasks",
    schema: z.object({
      task: z.string().describe("The coding task or question"),
    }),
  }
);

const callCreative = tool(
  async ({ task }) => {
    const result = await creativeAgent.invoke({
      messages: [{ role: "user", content: task }],
    });
    const lastMsg = result.messages[result.messages.length - 1];
    return extractText(lastMsg?.content) || "Creative task complete but no content returned.";
  },
  {
    name: "creative",
    description: "Delegate to the Creative specialist for writing, brainstorming, content creation, copywriting, and creative tasks",
    schema: z.object({
      task: z.string().describe("The creative task or writing request"),
    }),
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

export { researchAgent, coderAgent, creativeAgent };
