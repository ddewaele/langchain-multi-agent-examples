// Zod patch MUST be first
import "./zod-patch.js";

import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { agent } from "./agent.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── Thread metadata (the actual state is in the checkpointer) ──

interface ThreadMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const threadMeta = new Map<string, ThreadMeta>();

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
  res.json([{
    id: "deep-agents-showcase",
    name: "Research Orchestrator (Deep Agents)",
    description: "Full deep agents: planning, filesystem, 4 subagents, persistence, summarization",
    graph: "deep-agents-showcase",
  }]);
});

// ── Threads ──
app.post("/api/threads", (_req, res) => {
  const meta: ThreadMeta = {
    id: uuidv4(),
    title: "New Research",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  threadMeta.set(meta.id, meta);
  res.json({ ...meta, messages: [] });
});

app.get("/api/threads", (_req, res) => {
  const all = Array.from(threadMeta.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((m) => ({ ...m, messages: [] }));
  res.json(all);
});

app.get("/api/threads/:id", (req, res) => {
  const meta = threadMeta.get(req.params.id);
  if (!meta) return res.status(404).json({ error: "Thread not found" });
  res.json({ ...meta, messages: [] });
});

app.delete("/api/threads/:id", (req, res) => {
  threadMeta.delete(req.params.id);
  res.json({ ok: true });
});

// ── Runs (streaming via SSE) ──

app.post("/api/threads/:threadId/runs/stream", async (req, res) => {
  let meta = threadMeta.get(req.params.threadId);
  if (!meta) {
    meta = {
      id: req.params.threadId,
      title: "New Research",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    threadMeta.set(meta.id, meta);
  }

  const { input } = req.body;
  const userMessage = input?.messages?.[0];
  if (!userMessage) return res.status(400).json({ error: "No message provided" });

  const userContent = typeof userMessage.content === "string"
    ? userMessage.content
    : JSON.stringify(userMessage.content);

  // Auto-title
  if (meta.title === "New Research") {
    meta.title = userContent.slice(0, 60) + (userContent.length > 60 ? "..." : "");
  }

  // SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const runId = uuidv4();
    sendEvent("metadata", { thread_id: meta.id, run_id: runId });

    // Stream with thread persistence via configurable thread_id
    const stream = await agent.stream(
      { messages: [{ role: "user", content: userContent }] },
      {
        streamMode: ["updates", "messages"] as any,
        recursionLimit: 80,
        configurable: { thread_id: meta.id },
      }
    );

    let finalContent = "";
    let activeAgent = "orchestrator";

    for await (const chunk of stream) {
      const [mode, data] = chunk as unknown as [string, any];

      if (mode === "updates") {
        for (const [nodeName, update] of Object.entries(data as Record<string, any>)) {
          // Send node activity
          const serializedMsgs = (update?.messages || []).map((m: any) => ({
            role: m?._getType?.() || "unknown",
            content: extractText(m?.content)?.slice(0, 500),
            toolCalls: (m?.tool_calls || []).map((tc: any) => ({
              name: tc.name,
              args: tc.args,
            })),
          }));

          sendEvent("updates", { node: nodeName, data: { messages: serializedMsgs } });

          // Emit step events for rich execution timeline
          if (update?.messages) {
            for (const msg of update.messages) {
              const toolCalls = msg?.tool_calls;
              if (toolCalls?.length) {
                for (const tc of toolCalls) {
                  // Detect subagent delegation via task tool
                  if (tc.name === "task") {
                    const agentName = tc.args?.subagent_type || tc.args?.agent || "subagent";
                    sendEvent("step", {
                      type: "subagent_start",
                      agent: agentName,
                    });
                  }
                  // Detect planning
                  if (tc.name === "write_todos") {
                    sendEvent("step", {
                      type: "subagent_tool",
                      agent: activeAgent,
                      toolName: "write_todos",
                      toolArgs: tc.args,
                    });
                  }
                  // Detect file operations
                  if (["write_file", "read_file", "edit_file", "ls", "glob", "grep"].includes(tc.name)) {
                    sendEvent("step", {
                      type: "subagent_tool",
                      agent: activeAgent,
                      toolName: tc.name,
                      toolArgs: tc.args,
                    });
                  }
                  // Generic tool call event
                  sendEvent("tool_calls", {
                    agent: activeAgent,
                    calls: [{ name: tc.name, args: tc.args }],
                  });
                }
              }

              // Tool results
              const msgType = msg?._getType?.();
              if (msgType === "tool") {
                const toolContent = extractText(msg.content);
                sendEvent("step", {
                  type: "subagent_tool_result",
                  agent: activeAgent,
                  toolName: msg.name || "tool",
                  toolResult: toolContent.slice(0, 500),
                });

                // If task tool returns, the subagent is done
                if (msg.name === "task") {
                  sendEvent("step", {
                    type: "subagent_done",
                    agent: activeAgent,
                    content: toolContent.slice(0, 300),
                  });
                }
              }

              // Final AI message
              if ((msgType === "ai" || msgType === "AIMessageChunk") && !msg?.tool_calls?.length) {
                const text = extractText(msg.content);
                if (text && text.length > 10) {
                  finalContent = text;
                  activeAgent = "orchestrator";
                }
              }
            }
          }
        }
      } else if (mode === "messages") {
        const [msgChunk, metadata] = data as [any, any];
        const content = extractText(msgChunk?.content);
        if (content) {
          sendEvent("token", { content, node: metadata?.langgraph_node || "agent" });
        }
      }
    }

    if (finalContent) {
      sendEvent("messages", { role: "assistant", content: finalContent, agent: activeAgent });
    }

    meta.updatedAt = new Date().toISOString();
    sendEvent("end", { status: "complete" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Stream error:", message);
    sendEvent("error", { message });
  } finally {
    res.end();
  }
});

const PORT = parseInt(process.env.PORT || "3004");
app.listen(PORT, () => {
  console.log(`\n  Deep Agents Showcase on http://localhost:${PORT}`);
  console.log(`  Agent: Research Orchestrator with 4 subagents`);
  console.log(`  Features: planning, filesystem, subagents, persistence`);
  console.log(`  Health: http://localhost:${PORT}/ok\n`);
});
