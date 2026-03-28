import { createDeepAgent } from "deepagents";
import type { SubAgent } from "deepagents";
import { researchTools, codeTools, creativeTools, allTools } from "./tools.js";

/**
 * Multi-agent supervisor using deepagents `createDeepAgent`.
 *
 * Architecture: A parent deep agent with three specialist subagents.
 * The built-in `task` tool automatically handles delegation.
 *
 * Deep Agents add planning (write_todos), filesystem, summarization,
 * and subagent spawning on top of LangGraph — batteries included.
 */

const MODEL = process.env.LLM_MODEL || "anthropic:claude-sonnet-4-20250514";

// ── Specialist SubAgents ──

const researchSubAgent: SubAgent = {
  name: "researcher",
  description: "Research specialist for factual questions, web search, information gathering, data analysis, and current events. Use this agent when you need to find information or answer factual questions.",
  systemPrompt: `You are a Research specialist. You excel at:
- Finding and synthesizing information
- Answering factual questions accurately
- Providing well-sourced, comprehensive answers

Use your tools to search for current information when needed.
Always provide thorough, well-structured answers with clear explanations.`,
  tools: researchTools as any,
  model: MODEL,
};

const coderSubAgent: SubAgent = {
  name: "coder",
  description: "Code specialist for writing code, debugging, code review, technical explanations, architecture decisions, and programming tasks. Use this agent for anything code-related.",
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
  description: "Creative specialist for writing, brainstorming, content creation, copywriting, storytelling, and creative tasks. Use this agent for any writing or creative work.",
  systemPrompt: `You are a Creative specialist. You excel at:
- Writing compelling content (articles, stories, copy)
- Brainstorming and ideation
- Structuring and outlining documents
- Adapting tone and style to the audience

Create engaging, well-structured content that matches the requested style.`,
  tools: creativeTools as any,
  model: MODEL,
};

// ── Deep Agent (Supervisor) ──

export const agent: any = createDeepAgent({
  name: "deep_supervisor",
  model: MODEL,
  tools: allTools as any,
  subagents: [researchSubAgent, coderSubAgent, creativeSubAgent],
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
