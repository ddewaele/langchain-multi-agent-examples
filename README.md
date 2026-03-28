# LangChain Multi-Agent Chat App

A **demonstrator project** comparing four different multi-agent architectures in the LangChain.js ecosystem, all sharing a single React chat frontend.

## The Stack

All three backends use **LangChain.js v1+** (`langchain@1.2.x`, `@langchain/core@1.1.x`, `@langchain/langgraph@1.2.x`). No pre-v1 dependencies.

| Package | Role |
|---------|------|
| `langchain` | High-level agent API (`createAgent`, `tool`) |
| `@langchain/core` | Core abstractions (messages, runnables, schemas) |
| `@langchain/langgraph` | Low-level graph orchestration (`StateGraph`, nodes, edges) |
| `deepagents` | Batteries-included agent framework (builds on top of `langchain` + `@langchain/langgraph`) |
| `@langchain/anthropic` | Claude model integration |

## How They Relate

```
┌─────────────────────────────────────────────────────────────┐
│                      deepagents                              │
│  createDeepAgent() = createAgent() + batteries-included      │
│  (subagent middleware, planning, filesystem, summarization)   │
├─────────────────────────────────────────────────────────────┤
│                       langchain                              │
│  createAgent() = high-level ReAct agent (builds a            │
│  LangGraph StateGraph internally, you never see it)          │
├─────────────────────────────────────────────────────────────┤
│                  @langchain/langgraph                         │
│  StateGraph, nodes, edges, conditional routing               │
│  (you build the graph yourself, maximum control)             │
├─────────────────────────────────────────────────────────────┤
│                    @langchain/core                            │
│  Messages, tools, models, runnables (shared foundation)      │
└─────────────────────────────────────────────────────────────┘
```

- **`@langchain/langgraph`** is the foundation — a directed graph runtime where you define nodes, edges, and state.
- **`langchain` `createAgent()`** wraps LangGraph into a one-liner. It builds a ReAct-pattern graph internally (model → tool calls → tool execution → model → ...). You don't touch `StateGraph` at all.
- **`deepagents` `createDeepAgent()`** wraps `createAgent()` further, auto-attaching middleware for planning (`write_todos` tool), filesystem access, context summarization, and subagent spawning (`task` tool). It returns a `createAgent`-compatible graph.

## Four Backend Architectures

| Backend | Port | Framework | Key Concept |
|---------|------|-----------|-------------|
| **`agent-server/`** | 3001 | **LangGraph.js** | Manual `StateGraph` with supervisor routing, explicit nodes/edges, per-agent tool loops |
| **`langchain-agents/`** | 3002 | **LangChain `createAgent`** | Supervisor wraps specialist agents-as-tools. No manual graph — `createAgent` builds ReAct graphs internally |
| **`deep-agents/`** | 3003 | **Deep Agents middleware** | `createAgent` + deepagents `SubAgent` middleware for subagent delegation and tool call patching |
| **`deep-agents-showcase/`** | 3004 | **Full `createDeepAgent`** | All batteries: planning (`write_todos`), filesystem, 4 subagents, persistence, summarization |

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       React Webapp (Vite + TS)                           │
│                  Backend selector in header to switch                     │
└──┬──────────────┬───────────────┬───────────────┬────────────────────────┘
   │ :3001        │ :3002         │ :3003         │ :3004
┌──▼──────┐  ┌────▼──────┐  ┌────▼──────┐  ┌─────▼──────────────────┐
│LangGraph│  │createAgent│  │createAgent│  │ createDeepAgent (full) │
│StateGraph│  │agents-as- │  │+deepagents│  │ planning + filesystem  │
│supervisor│  │tools      │  │SubAgent   │  │ 4 subagents + memory   │
│+tool loop│  │pattern    │  │middleware │  │ summarization + persist │
└─────────┘  └───────────┘  └───────────┘  └────────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20+
- Anthropic API key (or OpenAI)

### 1. Pick a backend (or run all three)

```bash
# LangGraph.js backend
cd agent-server && cp .env.example .env && npm install && npm run dev

# LangChain createAgent backend
cd langchain-agents && cp .env.example .env && npm install && npm run dev

# Deep Agents backend
cd deep-agents && cp .env.example .env && npm install && npm run dev

# Deep Agents Showcase (full createDeepAgent)
cd deep-agents-showcase && cp .env.example .env && npm install && npm run dev
```

### 2. Start the webapp

```bash
cd webapp && npm install && npm run dev
```

### 3. Open http://localhost:5173

Use the **backend selector** in the chat header to switch between the three architectures.

## Architecture Details

### 1. LangGraph.js (`agent-server/`)

**How it works:** You manually construct a `StateGraph` with nodes (supervisor, researcher, coder, creative, tool nodes) and edges (conditional routing). Full control over the execution flow.

```
START → supervisor → [router] → researcher ⇄ researcher_tools → END
                              → coder ⇄ coder_tools → END
                              → creative ⇄ creative_tools → END
```

**Key code:** `StateGraph`, `Annotation`, `MessagesAnnotation`, `ToolNode` from `@langchain/langgraph`

**Pros:** Maximum flexibility, explicit control over routing, state, and tool loops
**Cons:** More boilerplate — you manage nodes, edges, conditional routing, and message passing yourself

### 2. LangChain createAgent (`langchain-agents/`)

**How it works:** Each specialist is a `createAgent()` which internally builds a ReAct graph. The supervisor is also a `createAgent()` whose tools are wrappers that `.invoke()` the specialist agents. This is the **agents-as-tools** pattern.

```typescript
// Specialist agent
const researchAgent = createAgent({ model, tools: [webSearch], systemPrompt: "..." });

// Wrap it as a tool for the supervisor
const callResearcher = tool(async ({ task }) => {
  const result = await researchAgent.invoke({ messages: [{ role: "user", content: task }] });
  return extractText(result.messages.at(-1)?.content);
}, { name: "research", schema: z.object({ task: z.string() }) });

// Supervisor uses specialists as tools
const supervisor = createAgent({ model, tools: [callResearcher, callCoder, callCreative] });
```

**Key code:** `createAgent`, `tool` from `langchain`

**Pros:** Clean, minimal code. No graph construction. Agents compose naturally as tools.
**Cons:** Subagents are stateless (fresh context per invocation). Less visibility into execution unless you add step streaming.

### 3. Deep Agents (`deep-agents/`)

**How it works:** Uses `createAgent` from `langchain` with **deepagents middleware** attached. The `deepagents` package provides a `SubAgent` specification format and middleware (`createSubAgentMiddleware`) that automatically creates a `task` tool allowing the supervisor to delegate to named subagents.

```typescript
import { createAgent } from "langchain";
import { createSubAgentMiddleware, type SubAgent } from "deepagents";

const researcher: SubAgent = {
  name: "researcher",
  description: "Research specialist for factual questions...",
  systemPrompt: "You are a Research specialist...",
  tools: [webSearch, getWebPage],
};

const subAgentMiddleware = createSubAgentMiddleware({
  defaultModel: MODEL,
  subagents: [researcher, coder, creative],
});

const agent = createAgent({
  model: MODEL,
  middleware: [subAgentMiddleware],
  systemPrompt: "You coordinate specialists via the task tool...",
});
```

The middleware injects a `task` tool that the model can call with `{ agent: "researcher", description: "..." }` to spawn a subagent with its own context, tools, and system prompt.

#### Why `createAgent` + middleware instead of `createDeepAgent`

The `deepagents` package provides `createDeepAgent()` which is the intended one-liner API. However, `createDeepAgent` auto-attaches all default middleware including `FilesystemMiddleware`, which creates Zod v4 schemas internally. When these are mixed with `@langchain/core`'s Zod v3 compat layer (in `zod@3.25.x`), it causes a runtime error:

```
TypeError: keyValidator._parse is not a function
```

This is a Zod v3/v4 interop bug: `zod@3.25.x` ships a `zod/v3` compat layer, but the `_parse` method doesn't exist on v4 schema objects that get mixed into v3 `ZodObject.shape`.

**Our workaround:** Use `createAgent` (from `langchain`) and attach only the deepagents middleware we need:
- `createSubAgentMiddleware` — the `task` tool for subagent delegation
- `createPatchToolCallsMiddleware` — automatic recovery from malformed tool calls

This skips `FilesystemMiddleware` (not needed for chat) and `SummarizationMiddleware` (requires a backend), avoiding the Zod conflict while preserving the core deep agents capability: structured subagent delegation.

**Key code:** `createAgent` from `langchain`, `createSubAgentMiddleware` + `SubAgent` type from `deepagents`

**Pros:** Declarative subagent specs, automatic `task` tool, tool call error recovery
**Cons:** Heavier dependency, middleware can be opinionated, less control over internal routing

### 4. Deep Agents Showcase (`deep-agents-showcase/`)

**How it works:** Uses the full `createDeepAgent()` API from the `deepagents` package — the batteries-included deep agent with all middleware enabled. This is a **Research Orchestrator** that coordinates 4 specialist subagents through a shared filesystem workspace.

```
Research Orchestrator (createDeepAgent)
├── Built-in tools:
│   ├── write_todos     — Plan and track multi-step tasks
│   ├── write_file      — Write research/reports to workspace
│   ├── read_file       — Read files written by other agents
│   ├── edit_file       — Edit existing files
│   ├── ls / glob / grep — Navigate the workspace
│   └── task            — Delegate to subagents
│
├── Subagents (each gets their own context + filesystem access):
│   ├── web-researcher  — Searches web, writes findings to /research/
│   ├── data-analyst    — Reads research, writes analysis to /analysis/
│   ├── report-writer   — Reads everything, writes report to /output/
│   └── fact-checker    — Reads report, verifies claims
│
├── Persistence:
│   ├── MemorySaver     — Conversation state persists within threads
│   └── InMemoryStore   — Shared data persists across threads
│
└── Auto middleware:
    ├── TodoListMiddleware       — write_todos planning tool
    ├── FilesystemMiddleware     — 6 file tools (StateBackend)
    ├── SubAgentMiddleware       — task delegation tool
    ├── SummarizationMiddleware  — auto-compresses long contexts
    └── PatchToolCallsMiddleware — recovers from malformed tool calls
```

**Example workflow** for "Research the current state of quantum computing":
1. Orchestrator calls `write_todos` with 5 steps (plan the research)
2. Delegates to `web-researcher` via `task` tool → researcher searches, writes to `/research/findings.md`
3. Delegates to `data-analyst` → analyst reads findings, writes to `/analysis/trends.md`
4. Delegates to `report-writer` → writer reads all files, writes `/output/report.md`
5. Delegates to `fact-checker` → verifies claims, writes `/output/fact-check.md`
6. Orchestrator reads `/output/report.md` and presents the final report

**This demonstrates why multi-agent systems matter:**
- **Planning** — Complex tasks are decomposed before execution
- **Context isolation** — Each subagent works in a clean context, preventing confusion
- **Shared workspace** — Agents collaborate through files, not message passing
- **Specialization** — Each agent has different tools, prompts, and expertise
- **Persistence** — Work survives across conversation turns

#### The Zod v3/v4 Runtime Patch

`createDeepAgent` auto-attaches `FilesystemMiddleware` which creates schemas using Zod v4 types. In `zod@3.25.x`, the v3 compat layer can't parse v4 types (missing `_parse` method). We fix this with a runtime patch (`src/zod-patch.ts`) that intercepts `ZodObject._parse` and wraps v4 validators with v3-compatible `_parse` methods. This patch **must be imported before any deepagents code**.

```typescript
// src/zod-patch.ts — imported first in agent.ts and server.ts
import { z as z3 } from "zod/v3";
const ZodObjectProto = Object.getPrototypeOf(z3.object({}));
const original_parse = ZodObjectProto._parse;
ZodObjectProto._parse = function(input) {
  // Detect v4 types in shape and wrap with v3-compatible _parse
  const shape = this._getCached?.()?.shape;
  if (shape) {
    for (const key of Object.keys(shape)) {
      if (shape[key] && typeof shape[key]._parse !== "function" && shape[key]._zod) {
        shape[key]._parse = (input) => {
          const result = shape[key].safeParse(input.data);
          return result.success ? { status: "valid", value: result.data } : { status: "dirty", value: input.data };
        };
      }
    }
  }
  return original_parse.call(this, input);
};
```

## Comparing The Four Approaches

| Aspect | LangGraph | createAgent | Deep Agents | Deep Agents Showcase |
|--------|-----------|-------------|-------------|---------------------|
| **Graph construction** | Manual (StateGraph) | Automatic (ReAct) | Automatic + middleware | Automatic + all middleware |
| **Multi-agent pattern** | Supervisor + edges | Agents-as-tools | SubAgent middleware | Full createDeepAgent |
| **Specialist context** | Shared graph state | Stateless per call | Isolated per subagent | Isolated + shared filesystem |
| **Planning** | None | None | None | Built-in `write_todos` |
| **Filesystem** | None | None | None | Full (read/write/edit/ls/glob/grep) |
| **Persistence** | None | None | None | MemorySaver + InMemoryStore |
| **Summarization** | None | None | None | Auto context compression |
| **Tool loops** | Explicit edges | Built-in ReAct | Built-in ReAct | Built-in ReAct |
| **Code complexity** | ~200 lines | ~100 lines | ~80 lines | ~100 lines (+ Zod patch) |
| **Flexibility** | Maximum | Medium | Medium | Lower (opinionated) |
| **Best for** | Custom workflows | Simple delegation | Chat with delegation | Complex research tasks |

## Project Structure

```
├── agent-server/           # LangGraph.js backend (port 3001)
│   ├── src/
│   │   ├── agents.ts       # Agent nodes, prompts, routing logic
│   │   ├── graph.ts        # StateGraph construction
│   │   ├── server.ts       # Express + SSE streaming
│   │   ├── state.ts        # Graph state schema (Annotation)
│   │   └── tools.ts        # Tool definitions
│   └── langgraph.json      # LangGraph Platform deployment config
│
├── langchain-agents/       # createAgent backend (port 3002)
│   ├── src/
│   │   ├── agents.ts       # createAgent + agents-as-tools + step streaming
│   │   ├── server.ts       # Express + SSE streaming
│   │   └── tools.ts        # Tool definitions
│
├── deep-agents/            # Deep Agents backend (port 3003)
│   ├── src/
│   │   ├── agent.ts        # createAgent + deepagents SubAgent middleware
│   │   ├── server.ts       # Express + SSE streaming
│   │   └── tools.ts        # Tool definitions
│
├── deep-agents-showcase/   # Full Deep Agents showcase (port 3004)
│   ├── src/
│   │   ├── zod-patch.ts    # Runtime fix for Zod v3/v4 compat
│   │   ├── agent.ts        # createDeepAgent + 4 subagents + persistence
│   │   ├── server.ts       # Express + SSE + thread persistence
│   │   └── tools.ts        # Rich tool definitions
│
├── webapp/                 # React frontend (port 5173)
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentStatus.tsx     # Live agent activity indicator
│   │   │   ├── BackendSelector.tsx # Switch between 3 backends
│   │   │   ├── ChatInput.tsx       # Multi-modal input
│   │   │   ├── ChatMessage.tsx     # Rich message + execution timeline
│   │   │   ├── Sidebar.tsx         # Thread management
│   │   │   └── WelcomeScreen.tsx   # Landing with suggestions
│   │   ├── hooks/useChat.ts        # Chat state + streaming
│   │   ├── lib/api.ts              # API client (multi-backend routing)
│   │   └── types/index.ts
│   └── vite.config.ts              # Proxy config for all 3 backends
│
└── README.md
```

## Webapp Features

- Dark theme with polished UI
- **Backend selector** to compare architectures live
- **Execution timeline** — collapsible view of agent steps, tool calls with args/results
- Markdown rendering with GFM tables and syntax highlighting
- Collapsible reasoning display
- Multi-modal input (text, images, file attachments)
- Thread/conversation management
- Real-time SSE streaming with agent status indicators
- Responsive design

## Deploying to LangGraph Platform

The `agent-server/` is configured for LangGraph Platform via `langgraph.json`:

```bash
cd agent-server
npx @langchain/langgraph-cli dev     # Local dev server
npx @langchain/langgraph-cli build   # Build Docker image
npx @langchain/langgraph-cli deploy  # Deploy to LangSmith Cloud
```
