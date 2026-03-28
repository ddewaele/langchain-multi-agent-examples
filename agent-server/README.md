# agent-server

A multi-agent supervisor system built with **LangGraph.js** using a manual `StateGraph`. A central supervisor agent analyzes each user request and routes it to the appropriate specialist agent (researcher, coder, or creative), each of which can call tools in a loop before returning a final response. The server exposes a REST + SSE streaming API that is compatible with the LangGraph Platform protocol.

## Architecture

```
                         +------------+
                         |   START    |
                         +-----+------+
                               |
                               v
                        +------+-------+
                        |  supervisor  |   Analyzes request, emits routing JSON
                        +------+-------+
                               |
                    (conditional edges)
                   /           |            \
                  v            v             v
          +----------+   +---------+   +----------+
          | researcher|  |  coder  |   | creative |     Specialist agent nodes
          +----+-----+   +---+-----+   +----+-----+
               |              |              |
          (tool loop)    (tool loop)    (tool loop)
               |              |              |
       +-------+---+   +-----+----+   +-----+-----+
       | researcher |   |  coder   |   |  creative  |
       |   _tools   |   |  _tools  |   |   _tools   |  ToolNode wrappers
       +-------+---+   +-----+----+   +-----+-----+
               |              |              |
               +--- back to specialist ------+
               |              |              |
               v              v              v
           +--------+   +--------+     +--------+
           |  END   |   |  END   |     |  END   |
           +--------+   +--------+     +--------+
```

### Node descriptions

| Node | Type | Purpose |
|------|------|---------|
| `supervisor` | LLM node | Receives the full message history, decides which specialist to invoke (or responds directly for simple greetings). |
| `researcher` | LLM node | Handles factual/research questions. Bound to `researchTools`. |
| `coder` | LLM node | Handles code writing, debugging, and technical tasks. Bound to `codeTools`. |
| `creative` | LLM node | Handles writing, brainstorming, and creative content. Bound to `creativeTools`. |
| `researcher_tools` | `ToolNode` | Executes tool calls requested by the researcher agent. |
| `coder_tools` | `ToolNode` | Executes tool calls requested by the coder agent. |
| `creative_tools` | `ToolNode` | Executes tool calls requested by the creative agent. |

### Edge logic

1. **START -> supervisor** -- unconditional entry edge.
2. **supervisor -> specialist or END** -- `supervisorRouter` parses the supervisor's JSON output to read the `next` field. Falls back to keyword matching if JSON parsing fails.
3. **specialist -> tools or END** -- `agentToolRouter` checks whether the last AI message contains `tool_calls`. If yes, routes to the corresponding `_tools` node; otherwise goes to END.
4. **tools -> specialist** -- unconditional edge back to the specialist, creating a loop that continues until the specialist stops requesting tools.

## Key Concepts

### StateGraph and Annotation

The graph is built with `StateGraph` from `@langchain/langgraph`. State is defined declaratively using `Annotation.Root`, which specifies each field's type, default value, and **reducer** (how updates are merged). `MessagesAnnotation` provides the standard `messages` array with a built-in append reducer.

### ToolNode

`ToolNode` from `@langchain/langgraph/prebuilt` automatically executes any `tool_calls` found on the last AI message and returns `ToolMessage` results. Each specialist has its own `ToolNode` instance bound to its specific tool set.

### Conditional edges and tool loops

`addConditionalEdges` takes a router function that inspects the current state and returns a string key. The mapping object translates that key to the actual target node. The tool loop pattern is:

```
specialist --[has tool_calls?]--> specialist_tools --> specialist --[again?]--> ...
```

This continues until the specialist produces an AI message with no `tool_calls`, at which point the conditional edge routes to `END`.

## State Schema

Defined in `src/state.ts`:

```typescript
export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  activeAgent: Annotation<string>({
    reducer: (_, b) => b,        // last-write-wins
    default: () => "supervisor",
  }),
  reasoning: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  toolCalls: Annotation<Array<{ name: string; args: Record<string, unknown>; result?: string }>>({
    reducer: (a, b) => [...a, ...b],   // append
    default: () => [],
  }),
});
```

| Field | Reducer | Purpose |
|-------|---------|---------|
| `messages` | append (from `MessagesAnnotation`) | Full conversation history including `HumanMessage`, `AIMessage`, `ToolMessage`. |
| `activeAgent` | last-write-wins | Tracks which specialist is currently executing. |
| `reasoning` | last-write-wins | Supervisor's reasoning trace for the routing decision. |
| `toolCalls` | append | Accumulates tool invocations for UI visualization. |

## Agent Details

### Supervisor

The supervisor receives a system prompt listing the three specialists and explicit routing rules. It must output a JSON object:

```json
{
  "reasoning": "Brief explanation of your routing decision",
  "next": "researcher" | "coder" | "creative" | "FINISH",
  "instructions": "Specific instructions for the chosen agent"
}
```

The `supervisorRouter` function extracts and parses this JSON. If parsing fails, it applies keyword-based fallback routing:

```typescript
const lower = content.toLowerCase();
if (lower.includes("code") || lower.includes("program") || ...) return "coder";
if (lower.includes("search") || lower.includes("research") || ...) return "researcher";
if (lower.includes("write") || lower.includes("create") || ...) return "creative";
return "__end__";
```

### Researcher

- **Prompt focus**: Finding and synthesizing information, factual accuracy, well-sourced answers.
- **Tool limit**: Instructed to make at most 2-3 tool calls per request.
- **Tools**: `web_search`, `get_web_page`, `current_date_time`.

### Coder

- **Prompt focus**: Writing clean code in markdown blocks, debugging, code review, architecture.
- **Key instruction**: Writes code directly in the response; does not try to execute it.
- **Tools**: `lookup_docs`, `calculator`.

### Creative

- **Prompt focus**: Compelling content, brainstorming, adapting tone and style.
- **Tools**: `generate_outline`, `current_date_time`.

### Model configuration

The `createModel` factory supports both Anthropic (`claude-sonnet-4-20250514`) and OpenAI (`gpt-4o`), selected via the `LLM_PROVIDER` environment variable (defaults to `anthropic`). All models are configured with `streaming: true`, `temperature: 0.7`, and `maxTokens: 8192`.

## Tools

Defined in `src/tools.ts`. All tools are currently simulated stubs intended to be replaced with real integrations.

| Tool | Agent(s) | Schema | Purpose |
|------|----------|--------|---------|
| `web_search` | researcher | `{ query: string }` | Search the web for current information. |
| `get_web_page` | researcher | `{ url: string (URL) }` | Fetch and extract content from a URL. |
| `lookup_docs` | coder | `{ query: string, library?: string }` | Look up programming documentation. |
| `calculator` | coder | `{ expression: string }` | Evaluate a mathematical expression (sanitized). |
| `generate_outline` | creative | `{ topic: string, style: "blog" \| "academic" \| "technical" \| "creative" \| "business" }` | Generate a structured writing outline. |
| `current_date_time` | researcher, creative | `{}` | Return the current ISO 8601 date/time. |

Tool groups are exported for binding:

```typescript
export const researchTools = [webSearch, getWebPage, currentDateTime];
export const codeTools     = [lookupDocs, calculator];
export const creativeTools = [generateOutline, currentDateTime];
```

## Server API

The Express server (`src/server.ts`) exposes the following endpoints. Threads are stored in-memory (lost on restart).

### `GET /ok`

Health check.

```json
{ "ok": true }
```

### `GET /api/assistants`

Returns the list of available assistants (currently one).

```json
[
  {
    "id": "multi-agent",
    "name": "Multi-Agent Assistant",
    "description": "Supervisor agent with research, code, and creative specialists",
    "graph": "multi-agent"
  }
]
```

### `POST /api/threads`

Creates a new conversation thread.

**Response:**

```json
{
  "id": "uuid",
  "title": "New Conversation",
  "messages": [],
  "createdAt": "2026-03-28T12:00:00.000Z",
  "updatedAt": "2026-03-28T12:00:00.000Z"
}
```

### `GET /api/threads`

Returns all threads sorted by `updatedAt` descending.

### `GET /api/threads/:id`

Returns a single thread by ID. 404 if not found.

### `DELETE /api/threads/:id`

Deletes a thread.

### `POST /api/threads/:threadId/runs/stream`

Invokes the graph on a thread and streams the response as SSE.

**Request body:**

```json
{
  "input": {
    "messages": [
      { "role": "user", "content": "Write a Python quicksort" }
    ]
  }
}
```

**SSE stream:** See the Streaming section below.

### `POST /api/runs/stream`

Stateless variant (no thread persistence). Same request/response format but without thread storage.

## Streaming

The server streams responses using **Server-Sent Events (SSE)** with dual stream mode:

```typescript
const stream = await graph.stream(
  { messages },
  { streamMode: ["updates", "messages"], recursionLimit: 25 }
);
```

- **`updates` mode** -- emits a chunk each time a node completes, containing the full state delta from that node.
- **`messages` mode** -- emits individual `AIMessageChunk` tokens as they arrive from the LLM.

### SSE event types

| Event | Payload | When |
|-------|---------|------|
| `metadata` | `{ thread_id, run_id }` | Once at the start of the stream. |
| `updates` | `{ node, data: { messages, activeAgent, ... } }` | Each time a graph node finishes. Messages are serialized with `role`, `content`, and `toolCalls`. |
| `token` | `{ content, node }` | Every LLM token from the `messages` stream mode. Enables real-time typewriter UI. |
| `tool_calls` | `{ agent, calls: [{ name, args, id }] }` | When a specialist emits tool call requests. |
| `step` | `{ type, agent, ... }` | Execution timeline events: `subagent_start`, `subagent_tool`, `subagent_tool_result`, `subagent_done`. |
| `messages` | `{ role: "assistant", content, agent }` | The final complete assistant response. |
| `end` | `{ status: "complete" }` | Stream finished successfully. |
| `error` | `{ message }` | An error occurred during execution. |

### Step event subtypes

| `type` | Additional fields | Meaning |
|--------|-------------------|---------|
| `subagent_start` | `agent` | A specialist agent began executing. |
| `subagent_tool` | `agent`, `toolName`, `toolArgs` | The specialist is calling a tool. |
| `subagent_tool_result` | `agent`, `toolName`, `toolResult` (truncated to 500 chars) | A tool returned its result. |
| `subagent_done` | `agent`, `content` | The specialist finished and produced a final response. |

## LangGraph Platform Deployment

The `langgraph.json` configuration allows deploying this graph to the LangGraph Platform:

```json
{
  "node_version": "20",
  "dependencies": ["."],
  "graphs": {
    "multi-agent": "./src/graph.ts:graph"
  },
  "env": ".env"
}
```

- **`graphs`** maps graph names to their exported symbols. `"multi-agent"` refers to the compiled `graph` export from `src/graph.ts`.
- **`env`** points to the `.env` file for API keys.
- Deploy with `npx @langchain/langgraph-cli dev` for local development, or push to LangGraph Cloud for production hosting.

## How it differs from `createReactAgent` and prebuilt approaches

| Aspect | This project (manual `StateGraph`) | `createReactAgent` / prebuilt |
|--------|-------------------------------------|-------------------------------|
| **Graph structure** | Explicitly defined nodes, edges, and conditional routing. Full control over the topology. | Single-function call that wires up a model + tools into a react loop automatically. |
| **Multi-agent** | Native support -- supervisor node routes to multiple specialist nodes, each with isolated tool sets. | Single agent only. Multi-agent requires external orchestration. |
| **State** | Custom `AgentState` with additional fields (`activeAgent`, `reasoning`, `toolCalls`) and explicit reducers. | Uses the default `MessagesAnnotation` state. |
| **Routing** | Two-tier: JSON parsing with keyword fallback. Router functions are hand-written and testable. | Automatic tool-call detection; no user-defined routing. |
| **Tool isolation** | Each specialist has its own `ToolNode` with a curated tool set. | All tools are available to the single agent. |
| **Observability** | Rich `step` events expose the full execution timeline (which agent, which tools, results). | Opaque single-loop execution. |
| **Complexity** | More code to write and maintain, but maximum flexibility. | Minimal boilerplate; best for simple single-agent use cases. |

## Quick Start

### Prerequisites

- Node.js 20+
- An Anthropic API key (or OpenAI key if using `LLM_PROVIDER=openai`)

### Setup

```bash
cd agent-server
npm install
```

Create a `.env` file:

```env
ANTHROPIC_API_KEY=sk-ant-...
# Optional: switch to OpenAI
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-...
```

### Run in development

```bash
npm run dev
```

The server starts on `http://localhost:3001`. Verify with:

```bash
curl http://localhost:3001/ok
```

### Run in production

```bash
npm run build
npm start
```

### Run with LangGraph CLI

```bash
npm run langgraph:dev
```

This starts the LangGraph development server using the `langgraph.json` configuration, which exposes the graph via the standard LangGraph Platform API.
