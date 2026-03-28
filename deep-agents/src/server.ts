import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { agent } from "./agent.js";

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

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }
  return JSON.stringify(content);
}

// ── Health ──

app.get("/ok", (_req, res) => res.json({ ok: true }));

// ── Assistants ──

app.get("/api/assistants", (_req, res) => {
  res.json([
    {
      id: "deep-agents",
      name: "Deep Agent Supervisor",
      description: "Supervisor using deepagents createDeepAgent with subagents (planning + filesystem + summarization)",
      graph: "deep-agents",
    },
  ]);
});

// ── Threads CRUD ──

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

// ── Runs (streaming via SSE) ──

app.post("/api/threads/:threadId/runs/stream", async (req, res) => {
  const thread = threads.get(req.params.threadId);
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const { input } = req.body;
  const userMessage = input?.messages?.[0];
  if (!userMessage) return res.status(400).json({ error: "No message provided" });

  const userContent = typeof userMessage.content === "string" ? userMessage.content : JSON.stringify(userMessage.content);
  thread.messages.push({ role: "user", content: userContent });

  if (thread.messages.length === 1) {
    thread.title = userContent.slice(0, 60) + (userContent.length > 60 ? "..." : "");
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const runId = uuidv4();
    sendEvent("metadata", { thread_id: thread.id, run_id: runId });

    // Stream with both update and message modes
    const stream = await agent.stream(
      { messages: [{ role: "user", content: userContent }] },
      { streamMode: ["updates", "messages"] as any, recursionLimit: 40 }
    );

    let finalContent = "";
    let activeAgent = "supervisor";

    for await (const chunk of stream) {
      const [mode, data] = chunk as unknown as [string, any];

      if (mode === "updates") {
        for (const [nodeName, update] of Object.entries(data as Record<string, any>)) {
          // Send node activity to frontend
          sendEvent("updates", {
            node: nodeName,
            data: {
              activeAgent: nodeName,
              messages: update?.messages?.map((m: any) => ({
                role: m?._getType?.() || "unknown",
                content: extractText(m?.content),
                toolCalls: (m?.tool_calls || []).map((tc: any) => ({
                  name: tc.name,
                  args: tc.args,
                })),
              })) || [],
            },
          });

          // Identify active specialist from tool calls
          if (update?.messages) {
            for (const msg of update.messages) {
              const toolCalls = msg?.tool_calls;
              if (toolCalls?.length) {
                for (const tc of toolCalls) {
                  if (tc.name === "task") {
                    // Deep agent's task tool dispatches to subagents
                    const agentName = tc.args?.agent || tc.args?.agentName;
                    if (agentName) {
                      activeAgent = agentName;
                      sendEvent("updates", { node: agentName, data: {} });
                    }
                  }
                }
              }

              // Capture final AI messages (no tool calls pending)
              const msgType = msg?._getType?.();
              if ((msgType === "ai" || msgType === "AIMessageChunk") && !msg?.tool_calls?.length) {
                const text = extractText(msg.content);
                if (text && text.length > 10) finalContent = text;
              }
            }
          }
        }
      } else if (mode === "messages") {
        const [msgChunk, metadata] = data as [any, any];
        const content = extractText(msgChunk?.content);
        if (content) {
          sendEvent("token", {
            content,
            node: metadata?.langgraph_node || "agent",
          });
        }
      }
    }

    // Send final message
    if (finalContent) {
      sendEvent("messages", {
        role: "assistant",
        content: finalContent,
        agent: activeAgent,
      });
      thread.messages.push({
        role: "assistant",
        content: finalContent,
        metadata: { agent: activeAgent },
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

// ── Start ──

const PORT = parseInt(process.env.PORT || "3003");
app.listen(PORT, () => {
  console.log(`\n  Deep Agents Server on http://localhost:${PORT}`);
  console.log(`  Architecture: createDeepAgent + subagents (planning, filesystem, summarization)`);
  console.log(`  Health: http://localhost:${PORT}/ok\n`);
});
