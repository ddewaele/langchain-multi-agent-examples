import type { Thread } from "../types";

export type BackendId = "langgraph" | "langchain-agents" | "deep-agents" | "deep-agents-showcase";

export interface BackendConfig {
  id: BackendId;
  name: string;
  description: string;
  port: number;
}

export const BACKENDS: BackendConfig[] = [
  {
    id: "langgraph",
    name: "LangGraph.js",
    description: "Manual StateGraph with supervisor routing pattern",
    port: 3001,
  },
  {
    id: "langchain-agents",
    name: "LangChain createAgent",
    description: "createAgent with agents-as-tools (no manual graph)",
    port: 3002,
  },
  {
    id: "deep-agents",
    name: "Deep Agents",
    description: "createAgent + deepagents SubAgent middleware",
    port: 3003,
  },
  {
    id: "deep-agents-showcase",
    name: "Deep Agents Showcase",
    description: "Full createDeepAgent: planning, filesystem, 4 subagents, persistence",
    port: 3004,
  },
];

function getBaseUrl(backend: BackendId): string {
  // In dev, Vite proxies /api to the selected backend port
  // We use different prefixes to route through Vite proxy
  const config = BACKENDS.find((b) => b.id === backend);
  if (!config) return "/api";
  return `/api-${config.id}`;
}

export async function fetchThreads(backend: BackendId): Promise<Thread[]> {
  const res = await fetch(`${getBaseUrl(backend)}/threads`);
  if (!res.ok) throw new Error("Failed to fetch threads");
  return res.json();
}

export async function createThread(backend: BackendId): Promise<Thread> {
  const res = await fetch(`${getBaseUrl(backend)}/threads`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to create thread");
  return res.json();
}

export async function fetchThread(backend: BackendId, id: string): Promise<Thread> {
  const res = await fetch(`${getBaseUrl(backend)}/threads/${id}`);
  if (!res.ok) throw new Error("Thread not found");
  return res.json();
}

export async function deleteThread(backend: BackendId, id: string): Promise<void> {
  await fetch(`${getBaseUrl(backend)}/threads/${id}`, { method: "DELETE" });
}

export function streamRun(
  backend: BackendId,
  threadId: string,
  content: string,
  onEvent: (event: string, data: unknown) => void,
  onDone: () => void,
  onError: (err: Error) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${getBaseUrl(backend)}/threads/${threadId}/runs/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { messages: [{ role: "user", content }] },
      streamMode: "updates",
    }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent(currentEvent, data);
            } catch {
              // Skip malformed JSON
            }
            currentEvent = "";
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") onError(err);
    });

  return controller;
}
