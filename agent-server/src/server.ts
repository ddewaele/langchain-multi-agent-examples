import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { HumanMessage, AIMessage, AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { graph } from "./graph.js";
import { extractTextContent } from "./agents.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── In-memory thread storage ──

interface Thread {
  id: string;
  title: string;
  messages: Array<{ role: string; content: string; metadata?: Record<string, unknown> }>;
  createdAt: string;
  updatedAt: string;
}

const threads = new Map<string, Thread>();

// ── Health ──

app.get("/ok", (_req, res) => {
  res.json({ ok: true });
});

// ── Assistants ──

app.get("/api/assistants", (_req, res) => {
  res.json([
    {
      id: "multi-agent",
      name: "Multi-Agent Assistant",
      description: "Supervisor agent with research, code, and creative specialists",
      graph: "multi-agent",
    },
  ]);
});

// ── Threads ──

app.post("/api/threads", (_req, res) => {
  const thread: Thread = {
    id: uuidv4(),
    title: "New Conversation",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  threads.set(thread.id, thread);
  res.json(thread);
});

app.get("/api/threads", (_req, res) => {
  const all = Array.from(threads.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  res.json(all);
});

app.get("/api/threads/:id", (req, res) => {
  const thread = threads.get(req.params.id);
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  res.json(thread);
});

app.delete("/api/threads/:id", (req, res) => {
  threads.delete(req.params.id);
  res.json({ ok: true });
});

// ── Runs (streaming with token-level support) ──

app.post("/api/threads/:threadId/runs/stream", async (req, res) => {
  const thread = threads.get(req.params.threadId);
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const { input } = req.body;
  const userMessage = input?.messages?.[0];

  if (!userMessage) return res.status(400).json({ error: "No message provided" });

  const userContent = typeof userMessage.content === "string" ? userMessage.content : JSON.stringify(userMessage.content);

  // Store user message
  thread.messages.push({ role: "user", content: userContent });

  // Auto-title on first message
  if (thread.messages.length === 1) {
    thread.title = userContent.slice(0, 60) + (userContent.length > 60 ? "..." : "");
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Build message history for the graph
    const messages: BaseMessage[] = thread.messages.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    );

    const runId = uuidv4();
    sendEvent("metadata", { thread_id: thread.id, run_id: runId });

    // Stream with BOTH modes: "updates" for node progress + "messages" for token streaming
    const stream = await graph.stream(
      { messages },
      { streamMode: ["updates", "messages"] as any, recursionLimit: 25 }
    );

    let lastSpecialistContent = "";
    let lastSpecialistAgent = "";

    for await (const chunk of stream) {
      // With multiple stream modes, each chunk is [mode, data]
      const [mode, data] = chunk as [string, any];

      if (mode === "updates") {
        // data is { nodeName: stateUpdate }
        for (const [nodeName, update] of Object.entries(data)) {
          const upd = update as Record<string, unknown>;

          // Serialize and send node update
          const serialized = serializeNodeUpdate(nodeName, upd);
          sendEvent("updates", serialized);

          // Extract text content from specialist node responses
          if (upd.messages && Array.isArray(upd.messages)) {
            for (const msg of upd.messages) {
              if (msg instanceof AIMessage) {
                const textContent = extractTextContent(msg.content);
                const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;

                // Only treat as final content if there are no pending tool calls
                if (textContent && !hasToolCalls) {
                  lastSpecialistContent = textContent;
                  lastSpecialistAgent = nodeName;
                }

                // Send tool calls info
                if (hasToolCalls) {
                  sendEvent("tool_calls", {
                    agent: nodeName,
                    calls: msg.tool_calls!.map((tc: any) => ({
                      name: tc.name,
                      args: tc.args,
                      id: tc.id,
                    })),
                  });
                }
              }
            }
          }
        }
      } else if (mode === "messages") {
        // data is [AIMessageChunk, metadata]
        const [msgChunk, metadata] = data as [any, any];

        if (msgChunk && typeof msgChunk === "object") {
          const content = extractTextContent(msgChunk.content);
          if (content) {
            sendEvent("token", {
              content,
              node: metadata?.langgraph_node || "",
            });
          }
        }
      }
    }

    // Send the final complete message
    if (lastSpecialistContent) {
      sendEvent("messages", {
        role: "assistant",
        content: lastSpecialistContent,
        agent: lastSpecialistAgent,
      });

      thread.messages.push({
        role: "assistant",
        content: lastSpecialistContent,
        metadata: { agent: lastSpecialistAgent },
      });
    }

    thread.updatedAt = new Date().toISOString();
    sendEvent("end", { status: "complete" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Stream error:", error);
    sendEvent("error", { message });
  } finally {
    res.end();
  }
});

// ── Stateless run ──

app.post("/api/runs/stream", async (req, res) => {
  const { input } = req.body;
  const userMessage = input?.messages?.[0];
  if (!userMessage) return res.status(400).json({ error: "No message provided" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const messages = [new HumanMessage(userMessage.content)];
    sendEvent("metadata", { run_id: uuidv4() });

    const stream = await graph.stream(
      { messages },
      { streamMode: ["updates", "messages"] as any, recursionLimit: 25 }
    );

    for await (const chunk of stream) {
      const [mode, data] = chunk as [string, any];

      if (mode === "updates") {
        for (const [nodeName, update] of Object.entries(data)) {
          sendEvent("updates", serializeNodeUpdate(nodeName, update as Record<string, unknown>));
        }
      } else if (mode === "messages") {
        const [msgChunk] = data as [any, any];
        const content = extractTextContent(msgChunk?.content);
        if (content) {
          sendEvent("token", { content });
        }
      }
    }

    sendEvent("end", { status: "complete" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendEvent("error", { message });
  } finally {
    res.end();
  }
});

// ── Helpers ──

function serializeNodeUpdate(nodeName: string, update: Record<string, unknown>) {
  const serializedMessages: any[] = [];

  if (update.messages && Array.isArray(update.messages)) {
    for (const msg of update.messages) {
      if (msg && typeof msg === "object" && "content" in msg) {
        const role = (msg as any)._getType?.() || "unknown";
        const textContent = extractTextContent((msg as any).content);
        const toolCalls = (msg as any).tool_calls || [];

        serializedMessages.push({
          role,
          content: textContent,
          toolCalls: toolCalls.map((tc: any) => ({
            name: tc.name,
            args: tc.args,
            id: tc.id,
          })),
        });
      }
    }
  }

  return {
    node: nodeName,
    data: {
      ...update,
      messages: serializedMessages.length > 0 ? serializedMessages : undefined,
    },
  };
}

// ── Start ──

const PORT = parseInt(process.env.PORT || "3001");
app.listen(PORT, () => {
  console.log(`\n  Multi-Agent Server running on http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/ok`);
  console.log(`  API:    http://localhost:${PORT}/api/assistants\n`);
});
