/**
 * Deep Agents Showcase — Full createDeepAgent with all batteries.
 *
 * This demonstrates every core capability of deep agents:
 * - Planning via write_todos (task decomposition)
 * - Filesystem tools (write_file, read_file, edit_file, ls, glob, grep)
 * - Specialized subagents with context isolation
 * - Persistent memory across conversations (via StateBackend)
 * - Tool call error recovery (patchToolCalls)
 * - Automatic context summarization
 *
 * The Zod v3/v4 patch (imported first) fixes the runtime incompatibility
 * between zod@3.25.x's v3 compat layer and deep agents' v4 schemas.
 */

// MUST be first import — patches Zod before any schema creation
import "./zod-patch.js";

import { createDeepAgent, StateBackend, type SubAgent } from "deepagents";
import { MemorySaver, InMemoryStore } from "@langchain/langgraph";
import { researchTools, codeTools, writingTools, allTools } from "./tools.js";

const MODEL = process.env.LLM_MODEL || "anthropic:claude-sonnet-4-20250514";

// ── Checkpointer & Store (persistence) ──

/** Checkpointer: persists graph state within a thread (conversation memory) */
export const checkpointer = new MemorySaver();

/** Store: persists data across threads (long-term memory, shared workspace) */
export const store = new InMemoryStore();

// ── Specialist SubAgents ──

const webResearcher: SubAgent = {
  name: "web-researcher",
  description:
    "Web research specialist. Searches the internet, reads web pages, and gathers factual information. " +
    "Use for any task requiring current data, fact-finding, or source gathering.",
  systemPrompt: `You are a Web Research specialist working as part of a research team.

Your role:
- Search the web for relevant, current information
- Read and extract key data from web pages
- Cross-reference multiple sources for accuracy
- Write your findings to files so other agents can use them

IMPORTANT:
- Limit to 2-3 searches per task. Be targeted, not exhaustive.
- Always write your findings to a file (e.g., /research/findings.md) using write_file.
- Structure findings with headers, bullet points, and source citations.
- Use write_todos to track your progress on multi-step research.`,
  tools: researchTools as any,
  model: MODEL,
};

const dataAnalyst: SubAgent = {
  name: "data-analyst",
  description:
    "Data analysis specialist. Analyzes data, identifies trends, performs calculations, and creates data summaries. " +
    "Use for quantitative analysis, comparisons, and statistical insights.",
  systemPrompt: `You are a Data Analyst working as part of a research team.

Your role:
- Analyze data provided to you or gathered by the web researcher
- Read files from /research/ to access gathered data
- Perform calculations, identify trends, and draw insights
- Write analysis results to files (e.g., /analysis/results.md)

IMPORTANT:
- Read existing research files first with read_file before analyzing.
- Write structured analysis with clear metrics and findings.
- Use write_todos to track your analysis steps.`,
  tools: [...researchTools, ...codeTools] as any,
  model: MODEL,
};

const reportWriter: SubAgent = {
  name: "report-writer",
  description:
    "Report writing specialist. Creates polished documents, reports, and summaries from research and analysis. " +
    "Use for drafting, structuring, and finalizing written deliverables.",
  systemPrompt: `You are a Report Writer working as part of a research team.

Your role:
- Read research findings and analysis from files
- Synthesize information into coherent, well-structured documents
- Create executive summaries, detailed reports, or blog posts
- Write the final output to /output/ directory

IMPORTANT:
- Always read existing files first with read_file and ls to see what's available.
- Structure documents with clear headers, sections, and formatting.
- Include citations and references where appropriate.
- Write the final report to /output/report.md.
- Use write_todos to track your writing progress.`,
  tools: writingTools as any,
  model: MODEL,
};

const factChecker: SubAgent = {
  name: "fact-checker",
  description:
    "Fact-checking specialist. Verifies claims, cross-references sources, and identifies potential inaccuracies. " +
    "Use to validate research findings before publishing.",
  systemPrompt: `You are a Fact Checker working as part of a research team.

Your role:
- Read the draft report from /output/
- Verify key claims by searching for corroborating sources
- Flag any inaccuracies, unsupported claims, or outdated information
- Write a fact-check report to /output/fact-check.md

IMPORTANT:
- Limit to 2 searches per claim. Be efficient.
- Clearly distinguish between verified, unverified, and incorrect claims.
- Suggest corrections where needed.`,
  tools: researchTools as any,
  model: MODEL,
};

// ── Main Deep Agent (Orchestrator) ──

export const agent: any = createDeepAgent({
  name: "research_orchestrator",
  model: MODEL,
  tools: allTools as any,
  subagents: [webResearcher, dataAnalyst, reportWriter, factChecker],
  checkpointer,
  store,

  systemPrompt: `You are a Research Orchestrator — a senior agent that plans, coordinates, and delivers comprehensive research projects.

## Your Team (use the "task" tool to delegate)
- **web-researcher**: Searches the web, gathers facts and sources
- **data-analyst**: Analyzes data, identifies trends, performs calculations
- **report-writer**: Creates polished reports and documents from research
- **fact-checker**: Verifies claims and cross-references sources

## Your Workflow
For any research request, follow this process:

1. **Plan** — Use write_todos to break the task into clear steps
2. **Research** — Delegate to web-researcher to gather information
3. **Analyze** — Delegate to data-analyst if quantitative analysis is needed
4. **Write** — Delegate to report-writer to draft the deliverable
5. **Verify** — Delegate to fact-checker to validate key claims
6. **Deliver** — Read the final output from /output/ and present it

## File System
Your team shares a workspace:
- /research/  — Raw research findings
- /analysis/  — Data analysis results
- /output/    — Final deliverables

Use ls, read_file, and write_file to coordinate through files.
Update your todos as you complete each step.

## Important
- For simple questions, answer directly without the full workflow.
- For complex research tasks, always plan first with write_todos.
- Delegate — don't do the research yourself. You're a coordinator.
- Present the final report to the user with proper markdown formatting.`,
});
