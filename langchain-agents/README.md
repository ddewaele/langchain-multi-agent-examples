# LangChain.js createAgent Multi-Agent Supervisor

A multi-agent system built with LangChain.js `createAgent`, using the **agents-as-tools** pattern. A supervisor agent delegates tasks to specialist subagents (research, code, creative), each wrapped as a callable tool. Subagent internals are streamed back to the client via SSE step events.

## Table of Contents

- [Architecture](#architecture)
- [The Agents-as-Tools Pattern](#the-agents-as-tools-pattern)
- [Subagent Step Streaming](#subagent-step-streaming)
- [Specialist Agents](#specialist-agents)
- [Tools](#tools)
- [Server API](#server-api)
- [How createAgent Differs from LangGraph StateGraph](#how-createagent-differs-from-langgraph-stategraph)
- [Quick Start](#quick-start)

## Architecture

The system follows a supervisor/worker topology. The supervisor `createAgent` receives the user's message and decides which specialist(s) to invoke. Each specialist is itself a `createAgent` instance, but from the supervisor's perspective it is just another tool.

```
                         User
                          |
                          v
                   +--------------+
                   |  Supervisor  |  (createAgent)
                   |  Agent       |
                   +------+-------+
                          |
              tool call   |   tool result (string)
          +---------------+---------------+
          |               |               |
          v               v               v
   +------------+  +------------+  +-------------+
   | research() |  |   code()   |  | creative()  |
   |   tool      |  |   tool      |  |   tool       |
   +------+-----+  +------+-----+  +------+------+
          |               |               |
          v               v               v
   +------------+  +------------+  +-------------+
   | Research   |  |  Coder     |  |  Creative   |
   | Agent      |  |  Agent     |  |  Agent      |
   | (createAgent)|  | (createAgent)|  | (createAgent) |
   +------+-----+  +------+-----+  +------+------+
          |               |               |
          v               v               v
     web_search       lookup_docs    generate_outline
     get_web_page     calculator     current_date_time
     current_date_time
```

**Flow:**

1. The supervisor receives the user message and calls one of its tools (`research`, `code`, or `creative`).
2. The tool function runs `runSubagentWithSteps()`, which calls `.stream()` on the specialist agent.
3. The specialist agent uses its own tools (e.g. `web_search`) via the internal ReAct loop that `createAgent` builds automatically.
4. The specialist's final text response is returned as the tool result back to the supervisor.
5. The supervisor presents the result to the user.

## The Agents-as-Tools Pattern

The core idea: create a specialist agent with `createAgent`, then wrap it in a `tool()` so the supervisor can call it like any other tool.

### 1. Create the specialist agent

```ts
const researchAgent = createAgent({
  name: "research_agent",
  model: MODEL,
  tools: researchTools,
  systemPrompt: `You are a Research specialist. You excel at:
- Finding and synthesizing information
- Answering factual questions accurately
- Providing well-sourced, comprehensive answers

Use your tools to search for current information when needed.
IMPORTANT: Limit yourself to a maximum of 2-3 tool calls per request.`,
});
```

### 2. Wrap it in a tool with a Zod schema

```ts
const callResearcher = tool(
  async ({ task }) => runSubagentWithSteps(researchAgent as any, "researcher", task),
  {
    name: "research",
    description: "Delegate to the Research specialist for factual questions, web search, information gathering, and data analysis",
    schema: z.object({ task: z.string().describe("The research task or question") }),
  }
);
```

### 3. Pass agent-tools to the supervisor

```ts
export const supervisor = createAgent({
  name: "supervisor",
  model: MODEL,
  tools: [callResearcher, callCoder, callCreative],
  systemPrompt: `You are a Supervisor agent that coordinates a team of specialists...`,
});
```

The supervisor sees `research`, `code`, and `creative` as ordinary tools. It does not know they contain full agents internally.

## Subagent Step Streaming

When a subagent runs, its internal tool calls and results are streamed to the client in real time. This is handled by `runSubagentWithSteps`:

```ts
async function runSubagentWithSteps(
  agent: ReturnType<typeof createAgent>,
  agentName: string,
  task: string
): Promise<string> {
  emitStep({ type: "subagent_start", agent: agentName });

  const stream = await agent.stream(
    { messages: [{ role: "user", content: task }] },
    { streamMode: "updates" as any, recursionLimit: 20 }
  );

  for await (const chunk of stream) {
    for (const [nodeName, update] of Object.entries(chunk as Record<string, any>)) {
      if (update?.messages) {
        for (const msg of update.messages) {
          const msgType = msg?._getType?.();

          // Capture tool calls the subagent makes
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

          // Capture tool results
          if (msgType === "tool") {
            emitStep({
              type: "subagent_tool_result",
              agent: agentName,
              toolName: msg.name || "tool",
              toolResult: extractText(msg.content).slice(0, 500),
            });
          }
        }
      }
    }
  }

  emitStep({ type: "subagent_done", agent: agentName, content: finalContent });
  return finalContent || "Task complete.";
}
```

**Step event types:**

| Event                  | Meaning                                        |
| ---------------------- | ---------------------------------------------- |
| `subagent_start`       | A specialist agent has started working          |
| `subagent_tool`        | The specialist is calling one of its tools      |
| `subagent_tool_result` | A tool returned a result (truncated to 500 chars) |
| `subagent_done`        | The specialist finished and produced its answer |

The callback system uses a simple listener pattern:

```ts
let stepListener: StepListener | null = null;

export function onStep(listener: StepListener) {
  stepListener = listener;
}

export function clearStepListener() {
  stepListener = null;
}
```

The server registers a listener before each request with `onStep()` and clears it in the `finally` block with `clearStepListener()`.

## Specialist Agents

### Research Agent

- **Purpose:** Factual questions, web search, information gathering, data analysis
- **Tools:** `web_search`, `get_web_page`, `current_date_time`
- **Constraint:** Limited to 2-3 tool calls per request to avoid search loops

### Coder Agent

- **Purpose:** Writing code, debugging, code review, technical explanations
- **Tools:** `lookup_docs`, `calculator`
- **Constraint:** Writes code directly in markdown code blocks, does not execute code

### Creative Agent

- **Purpose:** Writing, brainstorming, content creation, copywriting
- **Tools:** `generate_outline`, `current_date_time`
- **Behavior:** Adapts tone and style to the audience

## Tools

### Research Tools

| Tool               | Schema                              | Description                            |
| ------------------ | ----------------------------------- | -------------------------------------- |
| `web_search`       | `{ query: string }`                 | Search the web for current information |
| `get_web_page`     | `{ url: string (URL) }`             | Fetch and extract content from a URL   |
| `current_date_time`| `{}`                                | Get the current date and time          |

### Code Tools

| Tool           | Schema                                          | Description                                |
| -------------- | ----------------------------------------------- | ------------------------------------------ |
| `lookup_docs`  | `{ query: string, library?: string }`           | Look up documentation for a library or API |
| `calculator`   | `{ expression: string }`                        | Evaluate a mathematical expression         |

### Creative Tools

| Tool                | Schema                                                              | Description                        |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| `generate_outline`  | `{ topic: string, style: "blog"\|"academic"\|"technical"\|"creative"\|"business" }` | Generate a structured outline      |
| `current_date_time` | `{}`                                                                | Get the current date and time      |

> **Note:** Tools currently return simulated data. Replace with real APIs (Tavily, SerpAPI, etc.) for production use.

## Server API

The server is an Express.js app that exposes a REST API with SSE streaming.

### Endpoints

| Method   | Path                                  | Description                          |
| -------- | ------------------------------------- | ------------------------------------ |
| `GET`    | `/ok`                                 | Health check                         |
| `GET`    | `/api/assistants`                     | List available assistants            |
| `POST`   | `/api/threads`                        | Create a new conversation thread     |
| `GET`    | `/api/threads`                        | List all threads (sorted by updated) |
| `GET`    | `/api/threads/:id`                    | Get a specific thread                |
| `DELETE` | `/api/threads/:id`                    | Delete a thread                      |
| `POST`   | `/api/threads/:threadId/runs/stream`  | Run the supervisor and stream results via SSE |

### SSE Streaming

The `/api/threads/:threadId/runs/stream` endpoint accepts:

```json
{
  "input": {
    "messages": [{ "role": "user", "content": "Your message here" }]
  }
}
```

It returns a `text/event-stream` with the following event types:

| SSE Event    | Payload                                                    | Description                              |
| ------------ | ---------------------------------------------------------- | ---------------------------------------- |
| `metadata`   | `{ thread_id, run_id }`                                    | Run identification                       |
| `step`       | `{ type, agent, toolName?, toolArgs?, toolResult?, content? }` | Subagent internal steps (see above)      |
| `updates`    | `{ node, data: { messages } }`                             | Supervisor graph node updates            |
| `tool_calls` | `{ agent: "supervisor", calls: [{ name, args }] }`        | Supervisor-level tool calls (delegation) |
| `token`      | `{ content, node }`                                        | Streamed text tokens                     |
| `messages`   | `{ role: "assistant", content, agent }`                    | Final assistant response                 |
| `end`        | `{ status: "complete" }`                                   | Stream finished                          |
| `error`      | `{ message }`                                              | Error occurred                           |

### Thread Storage

Threads are stored in-memory (a `Map<string, Thread>`). They persist for the lifetime of the server process only.

## How createAgent Differs from LangGraph StateGraph

| Aspect               | `createAgent`                                     | `StateGraph` (LangGraph)                      |
| -------------------- | ------------------------------------------------- | --------------------------------------------- |
| **Graph construction** | Automatic -- no nodes, edges, or state schema     | Manual -- you define nodes, edges, state       |
| **ReAct loop**       | Built-in; the agent reasons and acts automatically | You build the loop yourself (or use prebuilt)  |
| **Control**          | Less -- you provide model, tools, system prompt   | Full -- custom routing, conditional edges, state |
| **Subagent state**   | Stateless -- each invocation is a fresh conversation | Can share state across nodes via the graph state |
| **When to use**      | Quick agent setup, agents-as-tools pattern        | Complex workflows, shared state, custom routing |

In this project, `createAgent` is the right fit because each specialist runs independently on a single task and returns a string. There is no shared state between specialists, and the supervisor handles all coordination.

## Quick Start

### Prerequisites

- Node.js 18+
- An API key for your chosen LLM provider (Anthropic by default)

### Setup

```bash
cd langchain-agents

# Install dependencies
npm install

# Configure environment
cp .env.example .env   # then edit .env with your API key
```

Your `.env` file needs at minimum:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Optionally set:

```
LLM_MODEL=anthropic:claude-sonnet-4-20250514   # default
PORT=3002                                       # default
```

### Run

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

The server starts on `http://localhost:3002`. Verify with:

```bash
curl http://localhost:3002/ok
# {"ok":true}
```

### Test a conversation

```bash
# Create a thread
THREAD=$(curl -s -X POST http://localhost:3002/api/threads | jq -r '.id')

# Send a message (SSE stream)
curl -N -X POST "http://localhost:3002/api/threads/$THREAD/runs/stream" \
  -H "Content-Type: application/json" \
  -d '{"input":{"messages":[{"role":"user","content":"Write a Python function to reverse a linked list"}]}}'
```
