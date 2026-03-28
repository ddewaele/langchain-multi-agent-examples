import { createAgent } from "langchain";
import {
  createSubAgentMiddleware,
  createPatchToolCallsMiddleware,
  type SubAgent,
} from "deepagents";
import { researchTools, codeTools, creativeTools, allTools } from "./tools.js";

/**
 * Multi-agent supervisor using deepagents subagent middleware on top of
 * LangChain's createAgent.
 *
 * We use createAgent (not createDeepAgent) to avoid the Zod v3/v4
 * incompatibility in the filesystem middleware, but we still get the
 * deep agents features we want: subagent delegation and tool call patching.
 */

const MODEL = process.env.LLM_MODEL || "anthropic:claude-sonnet-4-20250514";

// ── Specialist SubAgents ──

const researchSubAgent: SubAgent = {
  name: "researcher",
  description: "Research specialist for factual questions, web search, information gathering, data analysis, and current events.",
  systemPrompt: `You are a Research specialist. You excel at:
- Finding and synthesizing information
- Answering factual questions accurately
- Providing well-sourced, comprehensive answers

Use your tools to search for current information when needed.
IMPORTANT: Limit yourself to a maximum of 2-3 tool calls per request. Do NOT keep searching repeatedly — gather what you need quickly, then synthesize a thorough answer from what you have.`,
  tools: researchTools as any,
  model: MODEL,
};

const coderSubAgent: SubAgent = {
  name: "coder",
  description: "Code specialist for writing code, debugging, code review, technical explanations, and programming tasks.",
  systemPrompt: `You are a Code specialist. You excel at:
- Writing clean, efficient, well-documented code
- Debugging and fixing issues
- Code review and analysis
- Explaining technical concepts

IMPORTANT: Write code DIRECTLY in your response using markdown code blocks.
Do NOT try to execute code. You are a code WRITER, not a runner.
Only use tools to look up documentation or calculate something.`,
  tools: codeTools as any,
  model: MODEL,
};

const creativeSubAgent: SubAgent = {
  name: "creative",
  description: "Creative specialist for writing, brainstorming, content creation, copywriting, and creative tasks.",
  systemPrompt: `You are a Creative specialist. You excel at:
- Writing compelling content (articles, stories, copy)
- Brainstorming and ideation
- Structuring and outlining documents
- Adapting tone and style to the audience

Create engaging, well-structured content that matches the requested style.`,
  tools: creativeTools as any,
  model: MODEL,
};

// ── Build agent with deepagents middleware (no filesystem) ──

const subAgentMiddleware = createSubAgentMiddleware({
  defaultModel: MODEL,
  defaultTools: allTools as any,
  subagents: [researchSubAgent, coderSubAgent, creativeSubAgent],
});

const patchMiddleware = createPatchToolCallsMiddleware();

// NOTE: Do NOT pass `tools` to createAgent — the subAgentMiddleware injects
// the `task` tool automatically. Passing tools here would duplicate them
// (Anthropic API rejects duplicate tool names).
export const agent = createAgent({
  name: "deep_supervisor",
  model: MODEL,
  middleware: [subAgentMiddleware, patchMiddleware] as any,
  systemPrompt: `You are a Supervisor agent that coordinates a team of specialists.

Your team (available via the task tool):
- **researcher**: Facts, web search, data analysis, current events
- **coder**: Writing code, debugging, code review, technical explanations
- **creative**: Writing, brainstorming, content creation, copywriting

How to work:
1. Analyze the user's request
2. Delegate to the appropriate specialist using the task tool
3. Present the specialist's response, adding synthesis or context as needed

For simple greetings or meta-questions, respond directly without delegating.
When the specialist returns a complete answer, present it as-is (preserve code blocks and formatting).`,
});
