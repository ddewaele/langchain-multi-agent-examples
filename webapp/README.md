# LangChain Chat App -- Web Frontend

A **Vite + React 19 + TypeScript** chat frontend that connects to **four different multi-agent backends** via Server-Sent Events (SSE). Switch between backend architectures with a single dropdown and watch agents collaborate in real time with execution step tracing, tool call visibility, and streaming markdown rendering.

## Quick Start

```bash
# Install dependencies
npm install

# Start the dev server (assumes backends are running on ports 3001-3004)
npm run dev

# Build for production
npm run build
```

The frontend runs on **http://localhost:5173** and proxies API requests to the backend ports.

---

## Architecture

### Component Tree

```
App
 ├── Sidebar              # Thread list, create/delete, collapse toggle
 ├── BackendSelector      # Dropdown to switch between 4 backends
 ├── WelcomeScreen        # Dynamic per-backend: agent cards, suggestions, capability badges
 ├── ChatMessage[]        # Markdown rendering, agent badges, steps timeline, tool calls
 │    └── StepItem[]      # Recursive execution step tree (subagents + nested tool calls)
 ├── AgentStatus          # Live streaming indicator (active agent + tool name)
 └── ChatInput            # Auto-resizing textarea, file/image attachments, send/stop
```

### How App.tsx Orchestrates Everything

`App` is the top-level coordinator. It owns two pieces of state:

1. **`backend`** (`BackendId`) -- which of the four backends is active
2. **`useChat(backend)`** -- the hook that manages messages, streaming, threads

```tsx
const [backend, setBackend] = useState<BackendId>("langgraph");

const {
  messages, isStreaming, activeAgent, activeTools, threadId,
  sendMessage, stopStreaming, clearMessages, loadThread,
} = useChat(backend);
```

When the user switches backends via `BackendSelector`, `App` clears all messages and resets the backend:

```tsx
const handleBackendChange = (id: BackendId) => {
  clearMessages();
  setBackend(id);
};
```

Auto-scrolling is handled with a `useEffect` that watches `messages` and `isStreaming`:

```tsx
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages, isStreaming]);
```

---

## Backend Switching

### The `BackendId` Type

Four backends are supported, each with a unique string ID:

```ts
export type BackendId = "langgraph" | "langchain-agents" | "deep-agents" | "deep-agents-showcase";
```

### Backend Configuration

Each backend is defined in `BACKENDS` with its name, description, and port:

```ts
export const BACKENDS: BackendConfig[] = [
  { id: "langgraph",             name: "LangGraph.js",           description: "Manual StateGraph with supervisor routing pattern",                port: 3001 },
  { id: "langchain-agents",      name: "LangChain createAgent",  description: "createAgent with agents-as-tools (no manual graph)",               port: 3002 },
  { id: "deep-agents",           name: "Deep Agents",            description: "createAgent + deepagents SubAgent middleware",                     port: 3003 },
  { id: "deep-agents-showcase",  name: "Deep Agents Showcase",   description: "Full createDeepAgent: planning, filesystem, 4 subagents, persistence", port: 3004 },
];
```

### How `api.ts` Routes Requests

The `getBaseUrl` function maps a `BackendId` to a Vite proxy prefix:

```ts
function getBaseUrl(backend: BackendId): string {
  const config = BACKENDS.find((b) => b.id === backend);
  if (!config) return "/api";
  return `/api-${config.id}`;
}
```

All API calls (threads CRUD, streaming runs) use this prefix. For example, `fetchThreads("langgraph")` calls `GET /api-langgraph/threads`.

### BackendSelector Component

A dropdown with color-coded dots and descriptions. Uses a `ref` + `mousedown` listener to close on outside click. Each backend gets a unique badge color:

```ts
const badgeColors: Record<BackendId, string> = {
  langgraph: "#8b5cf6",
  "langchain-agents": "#3b82f6",
  "deep-agents": "#10b981",
  "deep-agents-showcase": "#f59e0b",
};
```

---

## The Chat Flow

Step by step, here is what happens when a user sends a message:

1. **User types and hits Enter** (or clicks Send) in `ChatInput`
2. `ChatInput` calls `onSend(content, attachments?)` which maps to `sendMessage` from `useChat`
3. **`useChat.sendMessage`** runs:
   - If no `threadId` exists, calls `createThread(backend)` to get one from the backend
   - Appends a **user message** to state
   - Appends an empty **assistant message** placeholder (with `id = assistantId`)
   - Sets `isStreaming = true`
4. Calls **`streamRun(backend, threadId, content, onEvent, onDone, onError)`** from `api.ts`
5. `streamRun` POSTs to `/api-{backend}/threads/{threadId}/runs/stream` with the user message
6. The backend responds with an **SSE stream** -- events arrive over time
7. Each event triggers the `onEvent` callback which updates `streamedContent`, `toolCalls`, `steps`, etc.
8. The assistant message is continuously updated in state via `updateMessage()`
9. When the stream ends, `onDone` fires -- sets `isStreaming = false`, finalizes the message

---

## SSE Streaming

### How `streamRun` Parses Server-Sent Events

The `streamRun` function in `api.ts` uses the Fetch API with a `ReadableStream` reader. It manually parses the SSE protocol line by line:

```ts
const reader = res.body?.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";  // Keep incomplete line in buffer

  let currentEvent = "";
  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ") && currentEvent) {
      const data = JSON.parse(line.slice(6));
      onEvent(currentEvent, data);
      currentEvent = "";
    }
  }
}
```

Key details:
- Incomplete lines are kept in a `buffer` until the next chunk arrives
- Each `event:` line sets the event type, each `data:` line carries the JSON payload
- Malformed JSON is silently skipped
- Returns an `AbortController` so the UI can cancel via `stopStreaming`

### SSE Event Types

| Event | Purpose |
|-------|---------|
| `metadata` | Stream metadata (currently ignored) |
| `updates` | Node-level updates from the graph -- extracts supervisor reasoning and tool calls |
| `tool_calls` | Explicit tool call events with agent attribution |
| `step` | Subagent execution steps: `subagent_start`, `subagent_tool`, `subagent_tool_result`, `subagent_done` |
| `tool_result` | Tool result with agent attribution |
| `token` | Incremental text tokens (skips `supervisor` and `tools` nodes) |
| `messages` | Final assembled messages from the backend |
| `error` | Error messages displayed to the user |

---

## `useChat` Hook

The core state management hook. Lives at `src/hooks/useChat.ts`.

### State

```ts
const [messages, setMessages] = useState<Message[]>([]);
const [isStreaming, setIsStreaming] = useState(false);
const [activeAgent, setActiveAgent] = useState<string | null>(null);
const [activeTools, setActiveTools] = useState<ToolCall[]>([]);
const [threadId, setThreadId] = useState<string | null>(null);
const controllerRef = useRef<AbortController | null>(null);
```

### How Each SSE Event Is Handled

**`metadata`** -- No-op. Reserved for future use.

**`updates`** -- Extracts the active graph node name (`data.node`). If the node is `supervisor`, parses its message content as JSON looking for a `reasoning` field. Also extracts `toolCalls` from any messages in the update.

**`tool_calls`** -- Pushes tool calls to the local `toolCalls` array and updates `activeTools` state for the live indicator. Records the agent name.

**`step`** -- Builds the execution timeline tree. This is the most complex handler:

```
subagent_start  --> Creates a new AgentStep { type: "subagent", status: "running" }
                    Pushes it onto `steps[]`, sets it as `currentSubagentStep`

subagent_tool   --> Creates a child AgentStep { type: "tool", status: "running" }
                    Appends to currentSubagentStep.children[]

subagent_tool_result --> Finds the last running child tool, marks it "done", sets result

subagent_done   --> Marks currentSubagentStep as "done", replaces streamedContent
                    with the subagent's final response
```

**`token`** -- Appends text content to `streamedContent`. Skips tokens from `supervisor` (routing JSON) and `tools` (raw results) nodes. Sets the agent name from the token's node.

**`messages`** -- Final message from the backend. If the content is longer than what was streamed, it replaces `streamedContent` (defers to the server's assembled version).

**`error`** -- Replaces the assistant message with the error text and changes its role to `system`.

### Completion Callback

When the stream ends, `onDone` finalizes:
- Sets `isStreaming = false`
- Clears `activeAgent` and `activeTools`
- Updates the assistant message with final `streamedContent`, `agent`, `reasoning`, `toolCalls`, and `steps`
- Falls back to `"I processed your request."` if no content was received

### Other Methods

- **`stopStreaming`** -- Aborts the `AbortController`, resets streaming state
- **`clearMessages`** -- Resets all state (messages, threadId, agents, tools)
- **`loadThread`** -- Loads a thread's messages from the sidebar, mapping them to the `Message` type with UUIDs

---

## Components

### ChatMessage

**File:** `src/components/ChatMessage.tsx`

Renders a single message with rich formatting. Key features:

- **Markdown rendering** via `react-markdown` with `remark-gfm` (tables, strikethrough, task lists) and `rehype-highlight` (syntax highlighting in code blocks)
- **Agent badges** -- colored icon + name based on `agentColors` and `agentIcons` maps:
  ```ts
  const agentColors: Record<string, string> = {
    researcher: "#3b82f6", coder: "#10b981",
    creative: "#f59e0b",   supervisor: "#8b5cf6",
  };
  ```
- **Reasoning collapse** -- if the message has `reasoning`, shows a collapsible "Reasoning" section with a brain icon
- **Execution steps timeline** -- if the message has `steps`, renders the `StepItem` recursive tree (see below)
- **Tool calls collapse** -- legacy fallback for backends that don't emit step events; shows tool name, args JSON, and result
- **Copy button** -- appears on hover, copies message content to clipboard with a check animation
- **Attachments** -- renders inline images or file badges for user messages

### ChatInput

**File:** `src/components/ChatInput.tsx`

- **Auto-resizing textarea** -- adjusts height on input up to 200px max, resets on send:
  ```ts
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  ```
- **Keyboard shortcut** -- `Enter` sends, `Shift+Enter` inserts newline
- **File attachments** -- paperclip button for general files, image button for images; reads files as data URLs via `FileReader`
- **Attachment previews** -- thumbnail strip above the input with remove buttons
- **Send/Stop toggle** -- purple Send button when idle, red Stop button (square icon) when streaming; Send is disabled when input is empty

### Sidebar

**File:** `src/components/Sidebar.tsx`

- **Thread list with polling** -- fetches threads on mount and every 5 seconds via `setInterval`:
  ```ts
  useEffect(() => {
    fetchThreads(backend).then(setThreads).catch(() => setThreads([]));
    const interval = setInterval(() => {
      fetchThreads(backend).then(setThreads).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [backend]);
  ```
- **Create thread** -- "New Chat" button calls `onNewChat` which clears messages
- **Delete thread** -- trash icon on hover, calls `deleteThread` API, removes from local state
- **Collapse toggle** -- collapses to 52px width showing only icon buttons; expands to 260px
- **Active thread highlighting** -- compares `thread.id === activeThreadId`

### AgentStatus

**File:** `src/components/AgentStatus.tsx`

A live streaming indicator that appears below the messages when `isStreaming` is true. Shows:
- A spinning loader icon
- The active agent name with its color and icon (e.g., "Research Agent" in blue)
- The most recently active tool name in a green badge

Agent config includes tool nodes (`researcher_tools`, `coder_tools`, `creative_tools`) mapped to "Running tools" labels.

### BackendSelector

**File:** `src/components/BackendSelector.tsx`

Dropdown in the chat header. Shows the current backend name with a colored layer icon. Clicking opens a dropdown with all four backends, each showing a color dot, name, and description. Closes on outside click via `mousedown` event listener.

### WelcomeScreen

**File:** `src/components/WelcomeScreen.tsx`

Displayed when `messages.length === 0`. Content varies by backend:

**Default config** (used by `langgraph`, `langchain-agents`, `deep-agents`):
- Title: "Multi-Agent Assistant"
- 3 agent cards: Research, Code, Creative (3-column grid)
- 4 suggestion buttons in 2-column grid

**Showcase config** (used by `deep-agents-showcase`):
- Title: "Research Orchestrator"
- 4 agent cards: Web Researcher, Data Analyst, Report Writer, Fact Checker (4-column grid)
- **Capability badges**: Planning, Filesystem, Subagents, Persistence (pill-shaped badges with descriptions)
- 4 longer suggestion prompts in single-column layout (multi-step research tasks)

---

## Execution Timeline (Steps)

### The `AgentStep` Type

```ts
export interface AgentStep {
  id: string;
  type: "agent" | "tool" | "subagent";
  name: string;
  agent?: string;
  args?: Record<string, unknown>;
  result?: string;
  children?: AgentStep[];       // Nested steps (subagent's tool calls)
  status: "running" | "done" | "error";
  timestamp: string;
}
```

### How the Tree Gets Built

The `useChat` hook processes `step` SSE events to build a tree structure:

```
step { type: "subagent_start", agent: "researcher" }
  --> creates AgentStep { type: "subagent", name: "researcher", children: [], status: "running" }
  --> pushed to steps[]

step { type: "subagent_tool", agent: "researcher", toolName: "web_search", toolArgs: {...} }
  --> creates child AgentStep { type: "tool", name: "web_search", status: "running" }
  --> appended to currentSubagentStep.children[]

step { type: "subagent_tool_result", toolResult: "..." }
  --> finds last running child, sets result, marks status: "done"

step { type: "subagent_done", content: "Here are the results..." }
  --> marks subagent step as "done", sets result
  --> replaces streamedContent with the subagent's final response
```

### The `StepItem` Recursive Component

`StepItem` renders a single step with expand/collapse behavior, then recursively renders `children`:

```tsx
function StepItem({ step, defaultOpen = false }: { step: AgentStep; defaultOpen?: boolean }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  // ...
  return (
    <div className="step-item">
      <button className="step-header" onClick={() => setExpanded(!expanded)}>
        {/* chevron, spinner/icon, name, done badge, child count */}
      </button>
      {expanded && (
        <div className="step-body">
          {step.args && <pre className="step-args">{JSON.stringify(step.args, null, 2)}</pre>}
          {step.result && step.type === "subagent" && <div className="step-result-preview">...</div>}
          {step.result && step.type === "tool" && <pre className="step-result-content">...</pre>}
          {hasChildren && (
            <div className="step-children">
              {step.children!.map((child) => (
                <StepItem key={child.id} step={child} defaultOpen={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

Visual indicators:
- Running steps show a spinning `Loader` icon
- Completed tool steps show a green "done" badge
- Subagent steps show the agent's colored icon; tool steps show a wrench icon
- Child count is displayed in the header (e.g., "3 tools")
- Subagent results show a 300-character preview; tool results show in a scrollable monospace block

---

## Styling

### Dark Theme

The app uses a dark theme defined entirely with CSS custom properties in `index.css`:

```css
:root {
  --bg-primary: #0f0f13;
  --bg-secondary: #16161d;
  --bg-tertiary: #1c1c27;
  --bg-hover: #22222f;
  --bg-active: #2a2a3a;

  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;

  --accent: #8b5cf6;      /* Purple */
  --blue: #3b82f6;
  --green: #10b981;
  --amber: #f59e0b;
  --red: #ef4444;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 20px;
}
```

### Responsive Design

At `max-width: 768px`:
- Sidebar becomes absolutely positioned (overlay) and collapses to `width: 0` (fully hidden)
- Agent cards switch to single column
- Suggestion grid switches to single column
- Message and input padding is reduced

### Other Style Details

- Font stack: Inter, system fonts fallback
- Custom slim scrollbar (6px) via `::-webkit-scrollbar`
- Code blocks use JetBrains Mono / Fira Code monospace
- `highlight.js` background override for transparent code blocks
- Smooth transitions (0.15s) on hover states throughout

---

## Vite Proxy Config

**File:** `vite.config.ts`

Each `/api-{backend}` prefix is rewritten to `/api` and forwarded to the correct port:

```ts
proxy: {
  "/api-deep-agents-showcase": {  // port 3004 -- MUST be first
    target: "http://localhost:3004",
    rewrite: (path) => path.replace(/^\/api-deep-agents-showcase/, "/api"),
  },
  "/api-langchain-agents": {      // port 3002
    target: "http://localhost:3002",
    rewrite: (path) => path.replace(/^\/api-langchain-agents/, "/api"),
  },
  "/api-deep-agents": {           // port 3003
    target: "http://localhost:3003",
    rewrite: (path) => path.replace(/^\/api-deep-agents/, "/api"),
  },
  "/api-langgraph": {             // port 3001
    target: "http://localhost:3001",
    rewrite: (path) => path.replace(/^\/api-langgraph/, "/api"),
  },
}
```

**Why ordering matters:** `/api-deep-agents-showcase` must come before `/api-deep-agents`. Vite matches proxy rules by prefix, so if `/api-deep-agents` came first, a request to `/api-deep-agents-showcase/threads` would match the shorter prefix and route to port 3003 instead of 3004.

---

## Types

**File:** `src/types/index.ts`

### `Message`

```ts
interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent?: string;           // Which agent produced this response
  toolCalls?: ToolCall[];   // Tools invoked during this message
  steps?: AgentStep[];      // Execution timeline tree
  reasoning?: string;       // Supervisor reasoning (extracted from JSON)
  timestamp: string;
  attachments?: Attachment[];
}
```

### `ToolCall`

```ts
interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}
```

### `AgentStep`

```ts
interface AgentStep {
  id: string;
  type: "agent" | "tool" | "subagent";
  name: string;
  agent?: string;
  args?: Record<string, unknown>;
  result?: string;
  children?: AgentStep[];
  status: "running" | "done" | "error";
  timestamp: string;
}
```

### `Thread`

```ts
interface Thread {
  id: string;
  title: string;
  messages: Array<{ role: string; content: string; metadata?: Record<string, unknown> }>;
  createdAt: string;
  updatedAt: string;
}
```

### `Attachment`

```ts
interface Attachment {
  type: "image" | "file";
  name: string;
  url: string;
  mimeType?: string;
}
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` 19 | UI framework |
| `react-markdown` | Markdown rendering for assistant messages |
| `remark-gfm` | GitHub Flavored Markdown (tables, strikethrough, task lists) |
| `rehype-highlight` | Syntax highlighting in code blocks |
| `lucide-react` | Icon library (Search, Code, Palette, Brain, Wrench, etc.) |
| `uuid` | Generate unique IDs for messages and steps |
| `@langchain/langgraph-sdk` | LangGraph SDK types |
| `vite` | Build tool and dev server with proxy |
| `typescript` ~5.9 | Type checking |
