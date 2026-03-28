import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { supervisor } from "./agents.js";

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
      id: "langchain-agents",
      name: "LangChain createAgent Supervisor",
      description: "Supervisor pattern using LangChain.js createAgent (agents-as-tools, no manual LangGraph)",
      graph: "langchain-agents",
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

    // Stream the supervisor agent with token-level + update-level events
    const stream = await supervisor.stream(
      { messages: [{ role: "user", content: userContent }] },
      { streamMode: ["updates", "messages"] as any, recursionLimit: 25 }
    );

    let finalContent = "";
    let activeAgent = "supervisor";

    for await (const chunk of stream) {
      const [mode, data] = chunk as unknown as [string, any];

      if (mode === "updates") {
        // data is { nodeName: stateUpdate }
        for (const [nodeName, update] of Object.entries(data as Record<string, any>)) {
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

          // Track which specialist is active
          if (nodeName === "agent" || nodeName === "tools") {
            // createAgent uses "agent" and "tools" as internal node names
            // Check tool calls to identify which specialist is being invoked
            if (update?.messages) {
              for (const msg of update.messages) {
                const tc = msg?.tool_calls?.[0];
                if (tc) {
                  const toolName = tc.name;
                  if (["research", "code", "creative"].includes(toolName)) {
                    activeAgent = toolName === "code" ? "coder" : toolName === "research" ? "researcher" : toolName;
                    sendEvent("updates", { node: activeAgent, data: {} });
                  }
                }
                // Capture tool results (specialist responses)
                const msgType = msg?._getType?.();
                if (msgType === "tool") {
                  const toolContent = extractText(msg.content);
                  if (toolContent && toolContent.length > 50) {
                    // This is likely a specialist's full response
                    sendEvent("tool_result", {
                      agent: activeAgent,
                      content: toolContent,
                    });
                  }
                }
              }
            }
          }

          // Capture final AI response from supervisor
          if (update?.messages) {
            for (const msg of update.messages) {
              const msgType = msg?._getType?.();
              if ((msgType === "ai" || msgType === "AIMessageChunk") && !msg?.tool_calls?.length) {
                const text = extractText(msg.content);
                if (text) finalContent = text;
              }
            }
          }
        }
      } else if (mode === "messages") {
        // Token-level streaming: [AIMessageChunk, metadata]
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

const PORT = parseInt(process.env.PORT || "3002");
app.listen(PORT, () => {
  console.log(`\n  LangChain createAgent Server on http://localhost:${PORT}`);
  console.log(`  Architecture: Supervisor + agents-as-tools (no manual graph)`);
  console.log(`  Health: http://localhost:${PORT}/ok\n`);
});
