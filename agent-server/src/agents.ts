import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { researchTools, codeTools, creativeTools } from "./tools.js";

// ── Model Factory ──

function createModel(provider: string = "anthropic") {
  if (provider === "openai") {
    return new ChatOpenAI({
      model: "gpt-4o",
      temperature: 0.7,
      maxTokens: 8192,
      streaming: true,
    });
  }
  return new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    maxTokens: 8192,
    streaming: true,
  });
}

// ── Agent System Prompts ──

const SUPERVISOR_PROMPT = `You are a Supervisor agent that coordinates a team of specialist agents. Your role is to:

1. Analyze the user's request
2. Decide which specialist agent(s) should handle it
3. Synthesize their responses into a coherent final answer

Available specialists:
- **researcher**: Expert at finding information, answering factual questions, and web research
- **coder**: Expert at writing code, debugging, code analysis, and technical problem-solving
- **creative**: Expert at writing, brainstorming, content creation, and creative tasks

Routing rules:
- If the user asks a factual/research question → route to "researcher"
- If the user asks about code, programming, or technical tasks → route to "coder"
- If the user asks for writing, brainstorming, or creative content → route to "creative"
- If the request spans multiple domains → handle them sequentially
- For simple greetings or meta-questions about yourself → respond directly as "FINISH"

You MUST respond with a JSON object:
{
  "reasoning": "Brief explanation of your routing decision",
  "next": "researcher" | "coder" | "creative" | "FINISH",
  "instructions": "Specific instructions for the chosen agent (or your direct response if FINISH)"
}`;

const RESEARCHER_PROMPT = `You are a Research specialist agent. You excel at:
- Finding and synthesizing information
- Answering factual questions with accuracy
- Providing well-sourced, comprehensive answers
- Analyzing data and trends

Use your tools to search for current information when needed. Always provide thorough, well-structured answers with clear explanations. Cite your sources when possible.`;

const CODER_PROMPT = `You are a Code specialist agent. You excel at:
- Writing clean, efficient, well-documented code
- Debugging and fixing issues
- Code review and analysis
- Explaining technical concepts
- Architecture and design decisions

IMPORTANT: Write code DIRECTLY in your response using markdown code blocks (e.g., \`\`\`typescript ... \`\`\`).
Do NOT try to execute code. You are a code WRITER, not a code runner.
Only use tools if you need to look up documentation or calculate something.

When writing code:
- Use proper formatting with language-tagged code blocks
- Include comments explaining complex logic
- Consider edge cases and error handling
- Suggest best practices and improvements`;

const CREATIVE_PROMPT = `You are a Creative specialist agent. You excel at:
- Writing compelling content (articles, stories, copy)
- Brainstorming and ideation
- Structuring and outlining documents
- Adapting tone and style to the audience
- Creative problem-solving

When creating content:
- Match the requested tone and style
- Use vivid, engaging language
- Structure content logically
- Offer alternatives and variations when appropriate`;

// ── Create Agent Models with Tools ──

const provider = process.env.LLM_PROVIDER || "anthropic";

export const supervisorModel = createModel(provider);
export const researcherModel = createModel(provider).bindTools(researchTools);
export const coderModel = createModel(provider).bindTools(codeTools);
export const creativeModel = createModel(provider).bindTools(creativeTools);

// ── Tool Nodes ──

export const researchToolNode = new ToolNode(researchTools);
export const codeToolNode = new ToolNode(codeTools);
export const creativeToolNode = new ToolNode(creativeTools);

// ── Helpers ──

/** Extract plain text from Anthropic content blocks or string content */
export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("");
  }
  return JSON.stringify(content);
}

function extractInstructions(msg: BaseMessage): string {
  const content = extractTextContent(msg.content);
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.instructions || content;
    }
  } catch {
    // Not JSON
  }
  return content;
}

function getLastHumanMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] instanceof HumanMessage) {
      return extractTextContent(messages[i].content);
    }
  }
  return "";
}

/**
 * Build the message list for a specialist agent.
 * On first call: [SystemMessage, HumanMessage with instructions]
 * On re-entry after tools: [SystemMessage, HumanMessage, ...previous AI+Tool messages]
 */
function buildSpecialistMessages(
  systemPrompt: string,
  state: { messages: BaseMessage[] },
  agentTag: string
): BaseMessage[] {
  const allMessages = state.messages;
  const result: BaseMessage[] = [new SystemMessage(systemPrompt)];

  // Find the supervisor's message (contains routing instructions)
  // and collect any subsequent AI/Tool messages from the specialist's tool loop
  let foundSupervisor = false;
  let humanInstruction: string | null = null;
  const toolLoopMessages: BaseMessage[] = [];

  // Use duck typing throughout — instanceof can fail with AIMessageChunk vs AIMessage
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const msg = allMessages[i];
    const msgType = (msg as any)?._getType?.();

    // Collect ToolMessages (these are from our tool nodes)
    if (msgType === "tool") {
      toolLoopMessages.unshift(msg);
      continue;
    }

    // Collect AI messages that have tool_calls (our previous specialist output)
    const toolCalls = (msg as any)?.tool_calls;
    if ((msgType === "ai" || msgType === "AIMessageChunk") && toolCalls && toolCalls.length > 0) {
      toolLoopMessages.unshift(msg);
      continue;
    }

    // The AI message from supervisor has routing JSON
    if ((msgType === "ai" || msgType === "AIMessageChunk") && !foundSupervisor) {
      const text = extractTextContent(msg.content);
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.next && parsed.instructions) {
            humanInstruction = parsed.instructions;
            foundSupervisor = true;
            continue;
          }
        }
      } catch {
        // Not supervisor JSON
      }
    }

    // Original HumanMessage
    if (msgType === "human" && !humanInstruction) {
      humanInstruction = extractTextContent(msg.content);
    }
  }

  result.push(new HumanMessage(humanInstruction || getLastHumanMessage(allMessages)));

  // Append tool loop messages so the model sees its previous tool_calls + results
  if (toolLoopMessages.length > 0) {
    result.push(...toolLoopMessages);
  }

  return result;
}

// ── Agent Node Functions ──

export async function supervisorNode(state: { messages: BaseMessage[] }) {
  const response = await supervisorModel.invoke([
    new SystemMessage(SUPERVISOR_PROMPT),
    ...state.messages,
  ]);
  return { messages: [response] };
}

export async function researcherNode(state: { messages: BaseMessage[] }) {
  const msgs = buildSpecialistMessages(RESEARCHER_PROMPT, state, "researcher");
  const response = await researcherModel.invoke(msgs);
  return { messages: [response], activeAgent: "researcher" };
}

export async function coderNode(state: { messages: BaseMessage[] }) {
  const msgs = buildSpecialistMessages(CODER_PROMPT, state, "coder");
  const response = await coderModel.invoke(msgs);
  return { messages: [response], activeAgent: "coder" };
}

export async function creativeNode(state: { messages: BaseMessage[] }) {
  const msgs = buildSpecialistMessages(CREATIVE_PROMPT, state, "creative");
  const response = await creativeModel.invoke(msgs);
  return { messages: [response], activeAgent: "creative" };
}

// ── Routing Logic ──

export function supervisorRouter(state: { messages: BaseMessage[] }): string {
  const lastMsg = state.messages[state.messages.length - 1];
  const content = extractTextContent(lastMsg.content);

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const next = parsed.next?.toLowerCase();
      if (next === "researcher") return "researcher";
      if (next === "coder") return "coder";
      if (next === "creative") return "creative";
      if (next === "finish") return "__end__";
    }
  } catch {
    // Fall through
  }

  // Fallback keyword routing
  const lower = content.toLowerCase();
  if (lower.includes("code") || lower.includes("program") || lower.includes("debug") || lower.includes("function")) return "coder";
  if (lower.includes("search") || lower.includes("research") || lower.includes("find") || lower.includes("what is")) return "researcher";
  if (lower.includes("write") || lower.includes("create") || lower.includes("story") || lower.includes("brainstorm")) return "creative";
  return "__end__";
}

export function agentToolRouter(state: { messages: BaseMessage[] }): string {
  const lastMsg = state.messages[state.messages.length - 1];
  // Use duck typing instead of instanceof — the model may return AIMessageChunk
  // (which doesn't pass `instanceof AIMessage`) when streaming is enabled
  const msgType = (lastMsg as any)?._getType?.();
  const toolCalls = (lastMsg as any)?.tool_calls;
  if ((msgType === "ai" || msgType === "AIMessageChunk") && toolCalls && toolCalls.length > 0) {
    return "tools";
  }
  return "__end__";
}
