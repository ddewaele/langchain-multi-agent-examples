# Deep Agents Showcase

**The full `createDeepAgent` showcase with all batteries included: planning, filesystem, 4 specialist subagents, persistence, summarization, and error recovery.**

This is the most complete backend in the LangChain Chat App project. It demonstrates every core capability of the [deepagents](https://www.npmjs.com/package/deepagents) library in a single, production-shaped Express server that streams rich execution events over SSE.

---

## Why This Matters

Traditional single-agent systems hit a wall when tasks get complex. They lose context, mix responsibilities, and produce shallow results. Multi-agent systems with deep agent capabilities solve this through:

- **Context Isolation** -- Each subagent has its own system prompt, tools, and conversation context. The web researcher never sees the report writer's drafting instructions, preventing prompt pollution.
- **Planning** -- The orchestrator decomposes complex tasks into tracked steps before delegating, ensuring nothing gets dropped.
- **Shared Workspace** -- Agents collaborate through a virtual filesystem, reading each other's outputs without sharing token-expensive conversation histories.
- **Specialization** -- Each agent is optimized for its role. A fact-checker searches differently than a data analyst. Dedicated prompts and tool sets produce better results than a single generalist.
- **Persistence** -- Conversations survive server restarts. Cross-thread memory enables agents to recall previous research sessions.

---

## Architecture

```
                          +---------------------------+
                          |        User (Chat UI)     |
                          +-------------+-------------+
                                        |
                                   SSE Stream
                                        |
                          +-------------v-------------+
                          |      Express Server       |
                          |   (server.ts, port 3004)  |
                          +-------------+-------------+
                                        |
                  +---------------------v---------------------+
                  |         Research Orchestrator              |
                  |         (createDeepAgent)                  |
                  |                                           |
                  |  Middleware Stack (built-in):              |
                  |  +--------------------------------------+ |
                  |  | TodoListMiddleware    (write_todos)   | |
                  |  | FilesystemMiddleware  (6 file tools)  | |
                  |  | SubAgentMiddleware    (task tool)     | |
                  |  | SummarizationMiddleware               | |
                  |  | PatchToolCallsMiddleware              | |
                  |  +--------------------------------------+ |
                  |                                           |
                  |  Tools: allTools (7 custom tools)         |
                  +----+--------+--------+--------+-----------+
                       |        |        |        |
          +------------v--+ +---v------+ +--v---------+ +--v----------+
          | web-researcher| | data-    | | report-    | | fact-       |
          |               | | analyst  | | writer     | | checker     |
          | researchTools | | research | | writing    | | research    |
          | (4 tools)     | | + code   | | Tools      | | Tools       |
          |               | | (6 tools)| | (2 tools)  | | (4 tools)   |
          +-------+-------+ +----+-----+ +-----+------+ +------+-----+
                  |               |             |               |
                  +-------+-------+------+------+-------+-------+
                          |              |              |
                    /research/     /analysis/      /output/
                          (Shared Virtual Filesystem)
                                        |
                  +---------------------v---------------------+
                  |              Persistence Layer            |
                  |  MemorySaver       InMemoryStore          |
                  |  (within-thread)   (cross-thread)         |
                  +-------------------------------------------+
```

### Component Summary

| Component | Role |
|---|---|
| **Research Orchestrator** | Main agent. Plans, delegates, and delivers. Never does research itself. |
| **TodoListMiddleware** | Injects `write_todos` tool for task decomposition and progress tracking. |
| **FilesystemMiddleware** | Injects `write_file`, `read_file`, `edit_file`, `ls`, `glob`, `grep` for inter-agent collaboration. |
| **SubAgentMiddleware** | Injects `task` tool to delegate work to specialist subagents with full context isolation. |
| **SummarizationMiddleware** | Automatically compresses conversation context when sessions get long. |
| **PatchToolCallsMiddleware** | Catches and fixes malformed tool calls from the LLM, improving reliability. |
| **MemorySaver** | Checkpointer -- persists graph state within a thread (conversation memory). |
| **InMemoryStore** | Store -- persists data across threads (long-term memory, shared workspace). |

---

## Deep Agent Capabilities Demonstrated

### 1. Planning (`write_todos`)

The orchestrator uses `write_todos` to decompose a complex research request into trackable steps before any work begins:

```
write_todos([
  { task: "Research current AI agent frameworks", status: "in_progress" },
  { task: "Analyze market adoption data", status: "todo" },
  { task: "Draft comparison report", status: "todo" },
  { task: "Fact-check key claims", status: "todo" },
  { task: "Deliver final report", status: "todo" }
])
```

Todos are updated as each step completes, giving visibility into progress and ensuring multi-step tasks don't lose track of remaining work.

### 2. Filesystem (`write_file`, `read_file`, `edit_file`, `ls`, `glob`, `grep`)

Agents collaborate through files instead of passing large data blobs through conversation context:

- **web-researcher** writes findings to `/research/findings.md`
- **data-analyst** reads from `/research/`, writes to `/analysis/results.md`
- **report-writer** reads both directories, writes to `/output/report.md`
- **fact-checker** reads the draft from `/output/`, writes `/output/fact-check.md`

This keeps each agent's context window clean -- they only load the files they need.

### 3. Subagents (Context Isolation)

Each subagent is a fully independent agent with its own:

- **System prompt** -- tailored instructions for its specialty
- **Tool set** -- only the tools it needs (researchers don't get writing tools)
- **Conversation context** -- isolated from other agents' internal reasoning
- **Model** -- configurable per agent (all default to the same model here)

The orchestrator delegates via the `task` tool:

```
task({ subagent_type: "web-researcher", instructions: "Search for..." })
```

### 4. Persistence

Two layers of persistence work together:

```typescript
// Within-thread: conversation survives page refreshes
export const checkpointer = new MemorySaver();

// Cross-thread: shared data accessible across conversations
export const store = new InMemoryStore();
```

The `configurable: { thread_id: meta.id }` parameter routes each conversation to its own persistent state. The same thread ID always resumes where it left off.

### 5. Summarization

The `SummarizationMiddleware` (built into `createDeepAgent`) automatically compresses conversation history when the context window grows large. This prevents token limit errors during long research sessions without losing important context.

### 6. Error Recovery

The `PatchToolCallsMiddleware` intercepts malformed tool calls from the LLM -- missing required fields, wrong types, truncated JSON -- and attempts to fix them before execution. This significantly reduces failures in complex multi-step workflows where the LLM occasionally produces imperfect tool invocations.

---

## The Workflow

When a user sends a complex research request, here is the step-by-step execution:

```
User: "Compare the top 3 AI agent frameworks for enterprise use"
                          |
                          v
    +---------------------------------------------+
    | 1. PLAN                                     |
    |    Orchestrator calls write_todos with 5     |
    |    steps, establishing the research plan     |
    +----------------------+----------------------+
                           |
                           v
    +---------------------------------------------+
    | 2. RESEARCH                                 |
    |    Delegates to web-researcher via task()    |
    |    -> Searches for framework comparisons    |
    |    -> Reads relevant web pages              |
    |    -> Writes findings to /research/         |
    +----------------------+----------------------+
                           |
                           v
    +---------------------------------------------+
    | 3. ANALYZE                                  |
    |    Delegates to data-analyst via task()      |
    |    -> Reads /research/ files                |
    |    -> Performs trend/comparison analysis     |
    |    -> Writes results to /analysis/          |
    +----------------------+----------------------+
                           |
                           v
    +---------------------------------------------+
    | 4. WRITE                                    |
    |    Delegates to report-writer via task()     |
    |    -> Reads /research/ and /analysis/       |
    |    -> Synthesizes into polished report      |
    |    -> Writes to /output/report.md           |
    +----------------------+----------------------+
                           |
                           v
    +---------------------------------------------+
    | 5. VERIFY                                   |
    |    Delegates to fact-checker via task()      |
    |    -> Reads draft from /output/             |
    |    -> Cross-references key claims           |
    |    -> Writes /output/fact-check.md          |
    +----------------------+----------------------+
                           |
                           v
    +---------------------------------------------+
    | 6. DELIVER                                  |
    |    Orchestrator reads /output/report.md     |
    |    Presents final report to user with       |
    |    proper markdown formatting               |
    +---------------------------------------------+
```

For simple questions, the orchestrator answers directly without the full workflow.

---

## Subagent Details

### web-researcher

| Property | Value |
|---|---|
| **Name** | `web-researcher` |
| **Tools** | `web_search`, `fetch_web_page`, `analyze_data`, `current_date_time` |
| **Writes to** | `/research/` |
| **Constraint** | Limited to 2-3 searches per task for efficiency |

**System Prompt:**
```
You are a Web Research specialist working as part of a research team.

Your role:
- Search the web for relevant, current information
- Read and extract key data from web pages
- Cross-reference multiple sources for accuracy
- Write your findings to files so other agents can use them

IMPORTANT:
- Limit to 2-3 searches per task. Be targeted, not exhaustive.
- Always write your findings to a file (e.g., /research/findings.md) using write_file.
- Structure findings with headers, bullet points, and source citations.
- Use write_todos to track your progress on multi-step research.
```

### data-analyst

| Property | Value |
|---|---|
| **Name** | `data-analyst` |
| **Tools** | `web_search`, `fetch_web_page`, `analyze_data`, `current_date_time`, `lookup_docs`, `calculator` |
| **Reads from** | `/research/` |
| **Writes to** | `/analysis/` |

**System Prompt:**
```
You are a Data Analyst working as part of a research team.

Your role:
- Analyze data provided to you or gathered by the web researcher
- Read files from /research/ to access gathered data
- Perform calculations, identify trends, and draw insights
- Write analysis results to files (e.g., /analysis/results.md)

IMPORTANT:
- Read existing research files first with read_file before analyzing.
- Write structured analysis with clear metrics and findings.
- Use write_todos to track your analysis steps.
```

### report-writer

| Property | Value |
|---|---|
| **Name** | `report-writer` |
| **Tools** | `generate_outline`, `current_date_time` |
| **Reads from** | `/research/`, `/analysis/` |
| **Writes to** | `/output/report.md` |

**System Prompt:**
```
You are a Report Writer working as part of a research team.

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
- Use write_todos to track your writing progress.
```

### fact-checker

| Property | Value |
|---|---|
| **Name** | `fact-checker` |
| **Tools** | `web_search`, `fetch_web_page`, `analyze_data`, `current_date_time` |
| **Reads from** | `/output/` |
| **Writes to** | `/output/fact-check.md` |
| **Constraint** | Limited to 2 searches per claim |

**System Prompt:**
```
You are a Fact Checker working as part of a research team.

Your role:
- Read the draft report from /output/
- Verify key claims by searching for corroborating sources
- Flag any inaccuracies, unsupported claims, or outdated information
- Write a fact-check report to /output/fact-check.md

IMPORTANT:
- Limit to 2 searches per claim. Be efficient.
- Clearly distinguish between verified, unverified, and incorrect claims.
- Suggest corrections where needed.
```

---

## The Zod v3/v4 Patch

### The Bug

`zod@3.25.x` ships both a native Zod v4 API and a `zod/v3` compatibility layer. The `deepagents` library's `FilesystemMiddleware` creates schemas using Zod v4 types. When these v4 types end up in a v3 `ZodObject.shape` (which happens when LangChain's v3-based tooling wraps them), the v3 `_parse` method is called on v4 types that don't have it:

```
TypeError: keyValidator._parse is not a function
```

### The Fix

The file `src/zod-patch.ts` monkey-patches `ZodObject.prototype._parse` and `ZodArray.prototype._parse` in the v3 layer. Before parsing, it inspects each validator in the shape. If it finds a v4 type (identified by having `_zod` but no `_parse`), it wraps it with a v3-compatible `_parse` method that delegates to the v4 `safeParse`:

```typescript
// Detect v4 types and wrap them for v3 compatibility
if (validator && typeof validator._parse !== "function" && validator._zod) {
  validator._parse = function (input: any) {
    const data = input.data;
    const result = validator.safeParse(data);
    if (result.success) {
      return { status: "valid", value: result.data };
    }
    return { status: "dirty", value: data };
  };
}
```

### Critical Import Order

This patch **must** be imported before any `deepagents` or `langchain` code. Both `agent.ts` and `server.ts` have it as their first import:

```typescript
// MUST be first import -- patches Zod before any schema creation
import "./zod-patch.js";
```

The `package.json` pins zod to `3.25.49` with an `overrides` field to ensure all transitive dependencies use the same version:

```json
{
  "dependencies": { "zod": "3.25.49" },
  "overrides": { "zod": "3.25.49" }
}
```

---

## Filesystem Backends

The virtual filesystem used by agents defaults to `StateBackend`, which stores files in the LangGraph state (in-memory, persisted via the checkpointer). The `deepagents` library also supports:

| Backend | Storage | Use Case |
|---|---|---|
| **StateBackend** (default) | In LangGraph state, persisted by checkpointer | Development, simple deployments |
| **FilesystemBackend** | Real disk | When agents need to produce actual files |
| **StoreBackend** | `InMemoryStore` or any LangGraph Store | Cross-thread file sharing |
| **CompositeBackend** | Multiple backends combined | Layered storage (e.g., state + disk) |

This showcase uses the default `StateBackend`, meaning all files written by agents exist in memory and survive within a thread via the `MemorySaver` checkpointer.

---

## Tools

### Custom Tools (defined in `tools.ts`)

| Tool | Schema | Description |
|---|---|---|
| `web_search` | `{ query: string, maxResults?: number }` | Search the web for current information. Returns titles, URLs, and snippets. |
| `fetch_web_page` | `{ url: string }` | Fetch and extract the content of a web page. |
| `analyze_data` | `{ data: string, analysisType: "trend" \| "comparison" \| "summary" \| "statistical" }` | Analyze data and extract insights, trends, and patterns. |
| `lookup_docs` | `{ query: string, library?: string }` | Look up programming documentation and API references. |
| `calculator` | `{ expression: string }` | Evaluate a mathematical expression. |
| `generate_outline` | `{ topic: string, format: "report" \| "blog" \| "academic" \| "executive_brief" \| "whitepaper", sections?: number }` | Generate a structured document outline. |
| `current_date_time` | `{}` | Get the current date and time. |

### Built-in Tools (injected by middleware)

| Tool | Middleware | Description |
|---|---|---|
| `write_todos` | TodoListMiddleware | Create and update a task list for planning |
| `write_file` | FilesystemMiddleware | Write content to a virtual file |
| `read_file` | FilesystemMiddleware | Read content from a virtual file |
| `edit_file` | FilesystemMiddleware | Edit an existing virtual file |
| `ls` | FilesystemMiddleware | List files in a virtual directory |
| `glob` | FilesystemMiddleware | Find files matching a pattern |
| `grep` | FilesystemMiddleware | Search file contents |
| `task` | SubAgentMiddleware | Delegate work to a specialist subagent |

> **Note:** The custom tools in `tools.ts` return simulated data. For production, connect real APIs: [Tavily](https://tavily.com/) or [SerpAPI](https://serpapi.com/) for search, [Firecrawl](https://firecrawl.dev/) or [Jina](https://jina.ai/) for web scraping.

---

## Server API

The Express server (`server.ts`) runs on port **3004** by default (`PORT` env var).

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/ok` | Health check. Returns `{ ok: true }`. |
| `GET` | `/api/assistants` | Lists available assistants (the research orchestrator). |
| `POST` | `/api/threads` | Create a new conversation thread. Returns thread metadata with a UUID. |
| `GET` | `/api/threads` | List all threads, sorted by most recently updated. |
| `GET` | `/api/threads/:id` | Get a specific thread's metadata. |
| `DELETE` | `/api/threads/:id` | Delete a thread. |
| `POST` | `/api/threads/:threadId/runs/stream` | Stream a response via SSE. The main interaction endpoint. |

### SSE Stream Events

The `/runs/stream` endpoint emits these Server-Sent Events:

| Event | Payload | Description |
|---|---|---|
| `metadata` | `{ thread_id, run_id }` | Sent first. Identifies the run. |
| `token` | `{ content, node }` | Incremental text tokens as they're generated. |
| `updates` | `{ node, data }` | Node-level updates with serialized messages. |
| `step` | `{ type, agent, ... }` | Rich execution timeline events (see below). |
| `tool_calls` | `{ agent, calls }` | Every tool call with name and arguments. |
| `messages` | `{ role, content, agent }` | Final assistant message. |
| `error` | `{ message }` | Error information if the run fails. |
| `end` | `{ status: "complete" }` | Sent last. Signals the stream is done. |

**Step event types:**

| `type` | Meaning |
|---|---|
| `subagent_start` | A subagent has been delegated to |
| `subagent_tool` | A tool was called (planning, file ops) |
| `subagent_tool_result` | A tool returned a result |
| `subagent_done` | A subagent finished its task |

### Request Format

```json
POST /api/threads/{threadId}/runs/stream

{
  "input": {
    "messages": [
      { "role": "user", "content": "Compare React and Vue for enterprise apps" }
    ]
  }
}
```

### Thread Persistence

Passing the same `thread_id` in the URL resumes the conversation. The `MemorySaver` checkpointer stores the full graph state, so the agent remembers the entire conversation history, including all files written to the virtual filesystem.

---

## Example Prompts

These prompts showcase the full multi-agent workflow:

1. **Full research pipeline:**
   > "Research the current state of AI agent frameworks (LangGraph, CrewAI, AutoGen). Compare their architectures, adoption, and best use cases. Produce a detailed comparison report."

2. **Data-heavy analysis:**
   > "Analyze the growth of TypeScript adoption from 2020 to 2025. Include developer survey data, npm download trends, and enterprise adoption metrics. Present findings in an executive brief."

3. **Multi-source investigation:**
   > "Investigate the environmental impact of large language model training. Gather data on energy consumption, carbon emissions, and mitigation strategies. Fact-check all claims."

4. **Technical deep dive:**
   > "Compare WebSocket vs SSE vs HTTP/2 push for real-time applications. Cover performance, browser support, scaling characteristics, and when to use each. Include code examples."

5. **Simple question (no workflow):**
   > "What is the capital of France?"

   The orchestrator answers this directly without planning or delegation.

---

## How This Differs from the Other Backends

This project is one of several backends in the LangChain Chat App. Here is how they compare:

| Feature | Simple Backend | LangGraph Backend | Deep Agent (Basic) | **Deep Agents Showcase** |
|---|---|---|---|---|
| Agent framework | LangChain | LangGraph | deepagents | **deepagents** |
| Planning (`write_todos`) | No | No | Maybe | **Yes** |
| Virtual filesystem | No | No | Maybe | **Yes (6 tools)** |
| Subagents | No | No | No | **Yes (4 specialists)** |
| Context isolation | N/A | N/A | N/A | **Yes** |
| Persistence | No | Checkpointer | Checkpointer | **Checkpointer + Store** |
| Summarization | No | No | No | **Yes** |
| Error recovery | No | No | No | **Yes (PatchToolCalls)** |
| Streaming | Token | Token + updates | Token + updates | **Token + updates + steps** |

The showcase backend is designed to be the reference implementation for what a full `createDeepAgent` deployment looks like.

---

## Quick Start

### Prerequisites

- Node.js 18+
- An API key for your chosen LLM provider

### Setup

```bash
# Install dependencies
npm install

# Create .env file
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
# Optional: override the default model
# LLM_MODEL=openai:gpt-4o
EOF

# Start in development mode (auto-reload)
npm run dev

# Or build and run
npm run build
npm start
```

The server starts on `http://localhost:3004`. Verify with:

```bash
curl http://localhost:3004/ok
# {"ok":true}
```

### Send a request

```bash
# Create a thread
THREAD_ID=$(curl -s -X POST http://localhost:3004/api/threads | jq -r '.id')

# Stream a research request
curl -N -X POST "http://localhost:3004/api/threads/$THREAD_ID/runs/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "messages": [{"role": "user", "content": "Compare LangGraph and CrewAI for building AI agents"}]
    }
  }'
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3004` | Server port |
| `LLM_MODEL` | `anthropic:claude-sonnet-4-20250514` | Model identifier (provider:model format) |
| `ANTHROPIC_API_KEY` | -- | Required if using Anthropic models |
| `OPENAI_API_KEY` | -- | Required if using OpenAI models |

---

## Project Structure

```
deep-agents-showcase/
  src/
    zod-patch.ts    # Zod v3/v4 runtime compatibility patch (must import first)
    agent.ts        # Deep agent configuration: orchestrator + 4 subagents
    tools.ts        # Custom tool definitions with Zod schemas
    server.ts       # Express server with SSE streaming
  package.json      # Dependencies, scripts, zod override
  tsconfig.json     # TypeScript configuration
```
