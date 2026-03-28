# deep-agents

A multi-agent supervisor server that combines LangChain's `createAgent` with the `deepagents` SubAgent middleware to orchestrate specialist agents -- research, code, and creative -- via a single `task` tool.

## Overview

This project builds a supervisor/specialist architecture where a top-level agent delegates work to specialist sub-agents, each with their own system prompt and tool set. It uses:

- **`createAgent`** from `langchain` -- the standard LangChain agent factory
- **`createSubAgentMiddleware`** from `deepagents` -- injects a `task` tool that lets the supervisor spawn specialist sub-agents
- **`createPatchToolCallsMiddleware`** from `deepagents` -- recovers from malformed tool calls

We intentionally use `createAgent` + middleware rather than the all-in-one `createDeepAgent` from the `deepagents` package. See [Why not createDeepAgent?](#why-createagent--middleware-instead-of-createdeepagent) below.

The server exposes a REST + SSE streaming API that is compatible with the LangGraph chat UI pattern (threads, runs, assistants).

## Architecture

```
 User request
      |
      v
 +-----------------------+
 |  Supervisor Agent      |    createAgent("deep_supervisor")
 |  (Anthropic Claude)    |    middleware: [subAgentMiddleware, patchMiddleware]
 +-----------------------+
      |
      | calls task({ subagent_type: "researcher" | "coder" | "creative", description: "..." })
      v
 +-------------------+    +-------------------+    +-------------------+
 |  Researcher       |    |  Coder            |    |  Creative         |
 |  SubAgent         |    |  SubAgent         |    |  SubAgent         |
 |                   |    |                   |    |                   |
 |  tools:           |    |  tools:           |    |  tools:           |
 |  - web_search     |    |  - lookup_docs    |    |  - generate_outline|
 |  - get_web_page   |    |  - calculator     |    |  - current_date_time|
 |  - current_date_  |    +-------------------+    +-------------------+
 |    time           |
 +-------------------+
```

### Flow

1. The supervisor receives the user message.
2. It decides which specialist to invoke (or answers directly for simple greetings).
3. It calls the **`task`** tool with `{ subagent_type, description }`.
4. The `createSubAgentMiddleware` intercepts the tool call, spawns the named sub-agent with an **isolated context** (its own system prompt, tools, and model).
5. The sub-agent executes, potentially calling its own tools.
6. The result flows back through the supervisor, which presents it to the user.

## Why `createAgent` + middleware instead of `createDeepAgent`?

The `deepagents` package provides `createDeepAgent`, which bundles everything (subagents, filesystem access, planning, summarization) into one call. However, it currently has a **Zod v3/v4 compatibility issue** that prevents it from working.

### The problem

`createDeepAgent` internally registers filesystem middleware that uses Zod schemas. When your project uses Zod v4 (3.25.x with the v4 mini runtime), and `deepagents` was built against Zod v3, the tool schemas silently become incompatible:

- Zod v3 `ZodObject` and Zod v4 `ZodObject` are different classes
- LangChain's tool registration checks `instanceof` and fails or produces invalid JSON Schema
- The Anthropic API rejects the tool definitions, or the agent silently skips tools

The `overrides` field in `package.json` pins Zod to `3.25.49` to keep a single version, but `createDeepAgent`'s filesystem middleware still triggers the incompatibility internally.

### The workaround

Use `createAgent` (which does not bundle filesystem middleware) and manually attach only the middleware you need:

```ts
import { createAgent } from "langchain";
import {
  createSubAgentMiddleware,
  createPatchToolCallsMiddleware,
} from "deepagents";

const agent = createAgent({
  name: "deep_supervisor",
  model: MODEL,
  middleware: [subAgentMiddleware, patchMiddleware],
  systemPrompt: "...",
});
```

This gives you subagent delegation and tool-call patching without pulling in the filesystem layer that triggers the Zod conflict.

## The SubAgent Pattern

Each specialist is declared as a `SubAgent` object from the `deepagents` package:

```ts
import { type SubAgent } from "deepagents";

const researchSubAgent: SubAgent = {
  name: "researcher",
  description: "Research specialist for factual questions, web search, ...",
  systemPrompt: `You are a Research specialist. You excel at:
- Finding and synthesizing information
- Answering factual questions accurately
- Providing well-sourced, comprehensive answers

Use your tools to search for current information when needed.
IMPORTANT: Limit yourself to a maximum of 2-3 tool calls per request...`,
  tools: researchTools,
  model: "anthropic:claude-sonnet-4-20250514",
};
```

### SubAgent fields

| Field          | Type       | Purpose                                                        |
| -------------- | ---------- | -------------------------------------------------------------- |
| `name`         | `string`   | Identifier used in `task({ subagent_type: "researcher" })`      |
| `description`  | `string`   | Tells the supervisor when to pick this specialist               |
| `systemPrompt` | `string`   | The specialist's persona and instructions                       |
| `tools`        | `Tool[]`   | LangChain tools available exclusively to this specialist        |
| `model`        | `string`   | LLM model identifier (e.g. `"anthropic:claude-sonnet-4-20250514"`) |

## Middleware

### `createSubAgentMiddleware`

Injected into the agent's middleware stack. It:

1. **Registers a `task` tool** on the supervisor agent. The supervisor does not receive any other tools -- only `task`.
2. When the supervisor calls `task({ subagent_type, description })`, the middleware **spawns the matching sub-agent** with its own system prompt, tools, and model in an isolated execution context.
3. Returns the sub-agent's final response as the tool result.

```ts
const subAgentMiddleware = createSubAgentMiddleware({
  defaultModel: MODEL,
  defaultTools: allTools,
  subagents: [researchSubAgent, coderSubAgent, creativeSubAgent],
});
```

> **Important:** Do NOT pass `tools` to `createAgent` when using this middleware. The middleware injects the `task` tool automatically, and passing tools directly would cause duplicate tool name errors from the Anthropic API.

### `createPatchToolCallsMiddleware`

A recovery middleware that intercepts malformed tool calls (e.g. missing arguments, wrong types) and patches them before they reach the tool executor. This prevents crashes from occasional LLM formatting mistakes.

```ts
const patchMiddleware = createPatchToolCallsMiddleware();
```

## How the `task` tool works

The supervisor's only tool is `task`. When the LLM decides to delegate, it produces a tool call like:

```json
{
  "name": "task",
  "args": {
    "subagent_type": "researcher",
    "description": "Find the latest developments in quantum computing"
  }
}
```

The middleware:

1. Looks up the sub-agent by `subagent_type` from the registered `subagents` array.
2. Creates an ephemeral agent with that sub-agent's `systemPrompt`, `tools`, and `model`.
3. Passes `description` as the user message.
4. Runs the sub-agent to completion (the sub-agent may call its own tools multiple times).
5. Returns the sub-agent's final text response as the tool result to the supervisor.

The supervisor then presents this result to the user, optionally adding synthesis or context.

## Specialist Agents

### Researcher

- **Name:** `researcher`
- **Purpose:** Factual questions, web search, information gathering, data analysis, current events
- **System prompt focus:** Find and synthesize information; limit to 2-3 tool calls per request
- **Tools:** `web_search`, `get_web_page`, `current_date_time`

### Coder

- **Name:** `coder`
- **Purpose:** Writing code, debugging, code review, technical explanations
- **System prompt focus:** Write code directly in markdown code blocks; do NOT try to execute code; only use tools for docs lookup or calculation
- **Tools:** `lookup_docs`, `calculator`

### Creative

- **Name:** `creative`
- **Purpose:** Writing, brainstorming, content creation, copywriting
- **System prompt focus:** Create engaging, well-structured content matched to the requested style
- **Tools:** `generate_outline`, `current_date_time`

## Tools

All tools are defined in `src/tools.ts` using LangChain's `tool()` factory with Zod schemas.

### `web_search`

Search the web for current information on a topic.

```ts
schema: z.object({
  query: z.string().describe("The search query"),
})
```

> Currently returns simulated results. Connect Tavily or SerpAPI for production.

### `get_web_page`

Fetch and extract content from a web page URL.

```ts
schema: z.object({
  url: z.string().url().describe("The URL to fetch"),
})
```

> Currently returns simulated content. Connect a real web scraper for production.

### `lookup_docs`

Look up documentation for a programming library, API, or language feature.

```ts
schema: z.object({
  query: z.string().describe("What to look up"),
  library: z.string().optional().describe("Specific library name"),
})
```

> Currently returns simulated docs. Connect a real documentation API for production.

### `calculator`

Evaluate a mathematical expression.

```ts
schema: z.object({
  expression: z.string().describe("Math expression (e.g., '2 + 2')"),
})
```

Sanitizes the input to digits and arithmetic operators, then evaluates.

### `generate_outline`

Generate a structured outline for writing.

```ts
schema: z.object({
  topic: z.string().describe("The topic to outline"),
  style: z.enum(["blog", "academic", "technical", "creative", "business"]).describe("Writing style"),
})
```

### `current_date_time`

Get the current date and time (ISO 8601). Takes no arguments.

### Tool groupings

| Group            | Tools                                          | Used by            |
| ---------------- | ---------------------------------------------- | ------------------ |
| `researchTools`  | `web_search`, `get_web_page`, `current_date_time` | Researcher         |
| `codeTools`      | `lookup_docs`, `calculator`                     | Coder              |
| `creativeTools`  | `generate_outline`, `current_date_time`          | Creative           |
| `allTools`       | All of the above (deduplicated union)            | Default fallback   |

## How this differs from other approaches

### vs. `createDeepAgent` (full deepagents)

`createDeepAgent` bundles additional features that this project does **not** use:

| Feature           | `createDeepAgent` | This project (`createAgent` + middleware) |
| ----------------- | ----------------- | ----------------------------------------- |
| SubAgent delegation | Yes             | Yes (via `createSubAgentMiddleware`)       |
| Tool-call patching | Yes              | Yes (via `createPatchToolCallsMiddleware`)  |
| Filesystem access  | Yes              | No (avoids Zod v3/v4 conflict)             |
| Planning middleware | Yes              | No                                         |
| Summarization      | Yes              | No                                         |

The tradeoff is simplicity and compatibility over built-in planning/filesystem features.

### vs. manual LangGraph approach

A manual LangGraph implementation would require you to:

- Define a `StateGraph` with nodes for each specialist
- Write routing logic (conditional edges) to dispatch to specialists
- Manage message history threading between supervisor and specialists
- Handle tool execution loops manually

The `createAgent` + `deepagents` middleware approach handles all of this. The middleware takes care of sub-agent spawning, isolated context, and result propagation. You declare specialists as data (`SubAgent` objects) rather than writing graph wiring code.

## Server API

The Express server (`src/server.ts`) exposes a REST API compatible with LangGraph-style chat UIs:

| Endpoint                                  | Method   | Description                              |
| ----------------------------------------- | -------- | ---------------------------------------- |
| `GET /ok`                                 | GET      | Health check                             |
| `GET /api/assistants`                     | GET      | List available assistants                |
| `POST /api/threads`                       | POST     | Create a new conversation thread          |
| `GET /api/threads`                        | GET      | List all threads (sorted by last update)  |
| `GET /api/threads/:id`                    | GET      | Get a single thread with messages         |
| `DELETE /api/threads/:id`                 | DELETE   | Delete a thread                           |
| `POST /api/threads/:threadId/runs/stream` | POST     | Run the agent and stream responses (SSE)  |

The streaming endpoint sends Server-Sent Events with the following event types:

- **`metadata`** -- thread and run IDs
- **`updates`** -- node activity (which agent is active, tool calls being made)
- **`token`** -- incremental text tokens as they stream from the model
- **`messages`** -- the final complete assistant message
- **`error`** -- error details if something fails
- **`end`** -- signals the stream is complete

Thread state is stored in-memory (not persisted across restarts).

## Quick Start

### Prerequisites

- Node.js 18+
- An Anthropic API key (or OpenAI key if changing the model)

### Setup

```bash
cd deep-agents

# Install dependencies
npm install

# Configure environment
cp .env.example .env   # or create .env manually
```

Add your API key to `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
# Optional: override the default model
# LLM_MODEL=anthropic:claude-sonnet-4-20250514
```

### Run in development

```bash
npm run dev
```

The server starts on `http://localhost:3003` by default (set `PORT` in `.env` to change).

### Build and run in production

```bash
npm run build
npm start
```

### Test the health endpoint

```bash
curl http://localhost:3003/ok
# {"ok":true}
```

### Send a message

```bash
# Create a thread
THREAD_ID=$(curl -s -X POST http://localhost:3003/api/threads | jq -r '.id')

# Stream a response
curl -N -X POST "http://localhost:3003/api/threads/$THREAD_ID/runs/stream" \
  -H "Content-Type: application/json" \
  -d '{"input":{"messages":[{"role":"user","content":"What are the latest advances in quantum computing?"}]}}'
```

## Project Structure

```
deep-agents/
  src/
    agent.ts    -- Supervisor agent + SubAgent definitions + middleware wiring
    tools.ts    -- All tool definitions (web_search, calculator, etc.)
    server.ts   -- Express server with REST API + SSE streaming
  package.json  -- Dependencies (langchain, deepagents, zod 3.25.49 pinned)
```
