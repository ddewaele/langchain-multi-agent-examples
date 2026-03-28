import { useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Message, ToolCall } from "../types";
import { streamRun, createThread, type BackendId } from "../lib/api";

export function useChat(backend: BackendId) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [activeTools, setActiveTools] = useState<ToolCall[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string, attachments?: Message["attachments"]) => {
      let currentThreadId = threadId;
      if (!currentThreadId) {
        const thread = await createThread(backend);
        currentThreadId = thread.id;
        setThreadId(currentThreadId);
      }

      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        attachments,
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setActiveAgent(null);
      setActiveTools([]);

      const assistantId = uuidv4();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", timestamp: new Date().toISOString(), toolCalls: [] },
      ]);

      let reasoning = "";
      let streamedContent = "";
      let agent = "";
      const toolCalls: ToolCall[] = [];

      controllerRef.current = streamRun(
        backend,
        currentThreadId,
        content,
        (event, data: any) => {
          switch (event) {
            case "metadata":
              break;

            case "updates": {
              const node = data.node as string;
              setActiveAgent(node);

              if (node === "supervisor" && data.data?.messages) {
                for (const msg of data.data.messages) {
                  if (msg.content) {
                    try {
                      const parsed = JSON.parse(msg.content);
                      if (parsed.reasoning) reasoning = parsed.reasoning;
                    } catch { /* not JSON */ }
                  }
                }
              }

              if (data.data?.messages) {
                for (const msg of data.data.messages) {
                  if (msg.toolCalls?.length) {
                    for (const tc of msg.toolCalls) {
                      const newTc: ToolCall = { name: tc.name, args: tc.args };
                      toolCalls.push(newTc);
                      setActiveTools((prev) => [...prev, newTc]);
                    }
                  }
                }
              }
              break;
            }

            case "tool_calls": {
              if (data.calls) {
                for (const tc of data.calls) {
                  const newTc: ToolCall = { name: tc.name, args: tc.args };
                  toolCalls.push(newTc);
                  setActiveTools((prev) => [...prev, newTc]);
                }
              }
              agent = data.agent || agent;
              break;
            }

            case "tool_result": {
              // Specialist response via tool result
              if (data.content && data.agent) {
                agent = data.agent;
              }
              break;
            }

            case "token": {
              const tokenContent = data.content as string;
              const tokenNode = data.node as string;
              if (tokenNode === "supervisor") break;
              if (tokenNode) agent = tokenNode;
              streamedContent += tokenContent;

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: streamedContent, agent, reasoning, toolCalls: [...toolCalls] }
                    : m
                )
              );
              break;
            }

            case "messages": {
              if (data.content && data.role === "assistant") {
                agent = data.agent || agent;
                if (!streamedContent) {
                  streamedContent = data.content;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: streamedContent, agent, reasoning, toolCalls: [...toolCalls] }
                        : m
                    )
                  );
                }
              }
              break;
            }

            case "error":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `Error: ${data.message || "Unknown error"}`, role: "system" as const }
                    : m
                )
              );
              break;

            case "end":
              break;
          }
        },
        () => {
          setIsStreaming(false);
          setActiveAgent(null);
          setActiveTools([]);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: streamedContent || m.content || "I processed your request.", agent, reasoning, toolCalls: [...toolCalls] }
                : m
            )
          );
        },
        (err) => {
          setIsStreaming(false);
          setActiveAgent(null);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Connection error: ${err.message}`, role: "system" as const }
                : m
            )
          );
        }
      );
    },
    [threadId, backend]
  );

  const stopStreaming = useCallback(() => {
    controllerRef.current?.abort();
    setIsStreaming(false);
    setActiveAgent(null);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setThreadId(null);
    setActiveAgent(null);
    setActiveTools([]);
  }, []);

  const loadThread = useCallback((thread: { id: string; messages: Array<{ role: string; content: string; metadata?: Record<string, unknown> }> }) => {
    setThreadId(thread.id);
    setMessages(
      thread.messages.map((m) => ({
        id: uuidv4(),
        role: m.role as Message["role"],
        content: m.content,
        agent: (m.metadata?.agent as string) || undefined,
        timestamp: new Date().toISOString(),
      }))
    );
  }, []);

  return {
    messages,
    isStreaming,
    activeAgent,
    activeTools,
    threadId,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadThread,
    setThreadId,
  };
}
