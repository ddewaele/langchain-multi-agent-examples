# LangChain Multi-Agent Chat App

A **demonstrator project** comparing four different multi-agent architectures in the LangChain.js ecosystem, all sharing a single React chat frontend.

> Each backend has its own detailed README — see the links in the table below.

## The Stack

All backends use **LangChain.js v1+** (`langchain@1.2.x`, `@langchain/core@1.1.x`, `@langchain/langgraph@1.2.x`). No pre-v1 dependencies.

```
┌──────────────────────────────────────────────────────────┐
│ deepagents                                               │
│ createDeepAgent() = createAgent() + batteries-included   │
│ (subagent middleware, planning, filesystem, summarize)    │
├──────────────────────────────────────────────────────────┤
│ langchain                                                │
│ createAgent() = high-level ReAct agent (builds a         │
│ LangGraph StateGraph internally, you never see it)       │
├──────────────────────────────────────────────────────────┤
│ @langchain/langgraph                                     │
│ StateGraph, nodes, edges, conditional routing            │
│ (you build the graph yourself, maximum control)          │
├──────────────────────────────────────────────────────────┤
│ @langchain/core                                          │
│ Messages, tools, models, runnables (shared foundation)   │
└──────────────────────────────────────────────────────────┘
```

## Four Backends

| Backend | Port | Approach | README |
|---------|------|----------|--------|
| [`agent-server/`](./agent-server/) | 3001 | **LangGraph.js** — Manual `StateGraph` with supervisor routing | [Details](./agent-server/README.md) |
| [`langchain-agents/`](./langchain-agents/) | 3002 | **`createAgent`** — Agents-as-tools pattern, no manual graph | [Details](./langchain-agents/README.md) |
| [`deep-agents/`](./deep-agents/) | 3003 | **Deep Agents middleware** — `createAgent` + `SubAgent` middleware | [Details](./deep-agents/README.md) |
| [`deep-agents-showcase/`](./deep-agents-showcase/) | 3004 | **Full `createDeepAgent`** — Planning, filesystem, 4 subagents, persistence | [Details](./deep-agents-showcase/README.md) |
| [`webapp/`](./webapp/) | 5173 | **React frontend** — Streaming chat UI with backend selector | [Details](./webapp/README.md) |

```
┌─────────────────────────────────────────────────────────────┐
│              React Webapp (Vite + TS)                        │
│         Backend selector in header to switch                 │
└───┬─────────────┬─────────────┬─────────────┬───────────────┘
    │ :3001       │ :3002       │ :3003       │ :3004
┌───▼───────┐ ┌───▼───────┐ ┌───▼───────┐ ┌───▼─────────────┐
│ LangGraph │ │ createAg. │ │ createAg. │ │ createDeepAgent │
│ StateGraph│ │ agents-as │ │ +deepagent│ │ planning + fs   │
│ supervisor│ │ -tools    │ │ SubAgent  │ │ 4 subagents     │
│ +toolloop │ │ pattern   │ │ middleware│ │ memory+persist  │
└───────────┘ └───────────┘ └───────────┘ └─────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20+
- Anthropic API key (or OpenAI)

### 1. Pick a backend (or run all four)

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

Use the **backend selector** in the chat header to switch between architectures.

## Comparison

| Aspect | LangGraph | createAgent | Deep Agents | Showcase |
|--------|-----------|-------------|-------------|----------|
| **Graph construction** | Manual | Automatic | Automatic + middleware | All middleware |
| **Multi-agent pattern** | Supervisor + edges | Agents-as-tools | SubAgent middleware | Full createDeepAgent |
| **Planning** | — | — | — | `write_todos` |
| **Filesystem** | — | — | — | read/write/edit/ls/glob/grep |
| **Persistence** | — | — | — | MemorySaver + Store |
| **Summarization** | — | — | — | Auto compression |
| **Flexibility** | Maximum | Medium | Medium | Opinionated |
| **Best for** | Custom workflows | Simple delegation | Chat delegation | Complex research |

## Project Structure

```
├── agent-server/           # LangGraph.js (port 3001)
├── langchain-agents/       # createAgent (port 3002)
├── deep-agents/            # Deep Agents middleware (port 3003)
├── deep-agents-showcase/   # Full createDeepAgent (port 3004)
├── webapp/                 # React frontend (port 5173)
└── README.md               # This file
```

See each project's README for architecture details, code examples, and API documentation.
