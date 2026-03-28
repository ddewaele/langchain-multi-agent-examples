# LangChain Multi-Agent Chat App

A **demonstrator project** comparing three different multi-agent architectures in the LangChain.js ecosystem, all sharing a single React chat frontend.

## Three Backend Architectures

| Backend | Port | Approach | Key Concept |
|---------|------|----------|-------------|
| **`agent-server/`** | 3001 | **LangGraph.js** | Manual `StateGraph` with supervisor routing, explicit nodes/edges, per-agent tool loops |
| **`langchain-agents/`** | 3002 | **LangChain `createAgent`** | Supervisor wraps specialist agents-as-tools. No manual graph — `createAgent` builds ReAct graphs internally |
| **`deep-agents/`** | 3003 | **Deep Agents** | `createDeepAgent` with named subagents, built-in planning (`write_todos`), filesystem, and summarization |

```
┌──────────────────────────────────────────────────────────────┐
│                 React Webapp (Vite + TS)                      │
│           Backend selector in header to switch                │
└───────┬──────────────────┬──────────────────┬────────────────┘
        │ :3001            │ :3002            │ :3003
┌───────▼──────┐  ┌────────▼───────┐  ┌──────▼────────┐
│  LangGraph   │  │   createAgent  │  │  Deep Agents  │
│  StateGraph  │  │  agents-as-    │  │  createDeep   │
│  supervisor  │  │  tools pattern │  │  Agent +      │
│  + tool loop │  │  (no manual    │  │  subagents    │
│  nodes       │  │   graph)       │  │  + planning   │
└──────────────┘  └────────────────┘  └───────────────┘
 Each has: Supervisor → Researcher / Coder / Creative
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
cd langchain-agents && cp .env.example .env && npm install --legacy-peer-deps && npm run dev

# Deep Agents backend
cd deep-agents && cp .env.example .env && npm install --legacy-peer-deps && npm run dev
```

### 2. Start the webapp

```bash
cd webapp && npm install && npm run dev
```

### 3. Open http://localhost:5173

Use the **backend selector** in the chat header to switch between the three architectures.

## Architecture Comparison

### 1. LangGraph.js (`agent-server/`)

**How it works:** You manually construct a `StateGraph` with nodes (supervisor, researcher, coder, creative, tool nodes) and edges (conditional routing). Full control over the execution flow.

```
START → supervisor → [router] → researcher ⇄ researcher_tools → END
                              → coder ⇄ coder_tools → END
                              → creative ⇄ creative_tools → END
```

**Pros:** Maximum flexibility, explicit control over routing and state
**Cons:** More boilerplate, you manage tool loops and message passing yourself

### 2. LangChain createAgent (`langchain-agents/`)

**How it works:** Each specialist is a `createAgent()` which internally builds a ReAct graph. The supervisor is also a `createAgent()` whose tools are wrappers around the specialist agents.

```
supervisor.invoke() → [tool call: "research"] → researchAgent.invoke() → result back to supervisor
```

**Pros:** Clean, minimal code. No graph construction. Agents compose naturally as tools
**Cons:** Less visibility into execution, subagents are stateless (fresh context each call)

### 3. Deep Agents (`deep-agents/`)

**How it works:** `createDeepAgent()` is batteries-included. You declare subagents and the framework provides a `task` tool for delegation, plus built-in planning, filesystem, and summarization middleware.

```
deep_supervisor → [task tool: "researcher"] → spawns subagent → result back
               → [write_todos] → planning
               → [write_file/read_file] → persistent workspace
```

**Pros:** Best for complex, long-horizon tasks. Built-in planning and context management
**Cons:** Heavier runtime, more opinionated, less control over internals

## Project Structure

```
├── agent-server/           # LangGraph.js backend (port 3001)
│   ├── src/
│   │   ├── agents.ts       # Agent nodes, routing, tool binding
│   │   ├── graph.ts        # StateGraph construction
│   │   ├── server.ts       # Express + SSE streaming
│   │   ├── state.ts        # Graph state schema
│   │   └── tools.ts        # Shared tools
│   └── langgraph.json      # LangGraph Platform deployment config
│
├── langchain-agents/       # createAgent backend (port 3002)
│   ├── src/
│   │   ├── agents.ts       # createAgent + agents-as-tools
│   │   ├── server.ts       # Express + SSE streaming
│   │   └── tools.ts        # Shared tools
│
├── deep-agents/            # Deep Agents backend (port 3003)
│   ├── src/
│   │   ├── agent.ts        # createDeepAgent + subagents
│   │   ├── server.ts       # Express + SSE streaming
│   │   └── tools.ts        # Shared tools
│
├── webapp/                 # React frontend (port 5173)
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentStatus.tsx     # Live agent activity
│   │   │   ├── BackendSelector.tsx # Switch between 3 backends
│   │   │   ├── ChatInput.tsx       # Multi-modal input
│   │   │   ├── ChatMessage.tsx     # Rich markdown + tools
│   │   │   ├── Sidebar.tsx         # Thread management
│   │   │   └── WelcomeScreen.tsx   # Landing with suggestions
│   │   ├── hooks/useChat.ts        # Chat state + streaming
│   │   ├── lib/api.ts              # API client (multi-backend)
│   │   └── types/index.ts
│   └── vite.config.ts              # Proxy config for all 3 backends
│
└── README.md
```

## Webapp Features

- Dark theme with polished UI
- **Backend selector** to compare architectures live
- Markdown + GFM tables + syntax highlighting
- Collapsible reasoning and tool call visualization
- Multi-modal input (text, images, file attachments)
- Thread/conversation management
- Real-time streaming with agent status indicators
- Responsive design

## Deploying to LangGraph Platform

The `agent-server/` is configured for LangGraph Platform via `langgraph.json`:

```bash
cd agent-server
npx @langchain/langgraph-cli dev     # Local dev server
npx @langchain/langgraph-cli build   # Build Docker image
npx @langchain/langgraph-cli deploy  # Deploy to LangSmith Cloud
```
