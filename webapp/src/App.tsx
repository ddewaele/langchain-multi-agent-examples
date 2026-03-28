import { useState, useRef, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatMessage } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import { AgentStatus } from "./components/AgentStatus";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { BackendSelector } from "./components/BackendSelector";
import { useChat } from "./hooks/useChat";
import type { Thread } from "./types";
import type { BackendId } from "./lib/api";
import "./App.css";

function App() {
  const [backend, setBackend] = useState<BackendId>("langgraph");

  const {
    messages,
    isStreaming,
    activeAgent,
    activeTools,
    threadId,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadThread,
  } = useChat(backend);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSelectThread = (thread: Thread) => {
    loadThread(thread);
  };

  const handleNewChat = () => {
    clearMessages();
  };

  const handleSuggestion = (text: string) => {
    sendMessage(text);
  };

  const handleBackendChange = (id: BackendId) => {
    clearMessages();
    setBackend(id);
  };

  return (
    <div className="app">
      <Sidebar
        activeThreadId={threadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        backend={backend}
      />

      <main className="chat-main">
        <div className="chat-header">
          <BackendSelector selected={backend} onChange={handleBackendChange} />
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <WelcomeScreen onSuggestion={handleSuggestion} backend={backend} />
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              <AgentStatus
                activeAgent={activeAgent}
                activeTools={activeTools}
                isStreaming={isStreaming}
              />
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <ChatInput onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
      </main>
    </div>
  );
}

export default App;
