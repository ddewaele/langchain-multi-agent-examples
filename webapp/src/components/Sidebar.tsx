import { useState, useEffect } from "react";
import { Plus, Trash2, MessageSquare, PanelLeftClose, PanelLeft } from "lucide-react";
import type { Thread } from "../types";
import { fetchThreads, deleteThread, type BackendId } from "../lib/api";

interface Props {
  activeThreadId: string | null;
  onSelectThread: (thread: Thread) => void;
  onNewChat: () => void;
  collapsed: boolean;
  onToggle: () => void;
  backend: BackendId;
}

export function Sidebar({ activeThreadId, onSelectThread, onNewChat, collapsed, onToggle, backend }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    fetchThreads(backend).then(setThreads).catch(() => setThreads([]));
    const interval = setInterval(() => {
      fetchThreads(backend).then(setThreads).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [backend]);

  const handleNew = async () => {
    onNewChat();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteThread(backend, id);
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadId === id) onNewChat();
  };

  if (collapsed) {
    return (
      <div className="sidebar collapsed">
        <button className="sidebar-toggle" onClick={onToggle} title="Expand sidebar">
          <PanelLeft size={18} />
        </button>
        <button className="icon-btn" onClick={handleNew} title="New chat">
          <Plus size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="new-chat-btn" onClick={handleNew}>
          <Plus size={16} />
          New Chat
        </button>
        <button className="sidebar-toggle" onClick={onToggle} title="Collapse sidebar">
          <PanelLeftClose size={18} />
        </button>
      </div>

      <div className="thread-list">
        {threads.map((thread) => (
          <div
            key={thread.id}
            className={`thread-item ${thread.id === activeThreadId ? "active" : ""}`}
            onClick={() => onSelectThread(thread)}
          >
            <MessageSquare size={14} />
            <span className="thread-title">{thread.title}</span>
            <button
              className="thread-delete"
              onClick={(e) => handleDelete(e, thread.id)}
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {threads.length === 0 && (
          <div className="thread-empty">No conversations yet</div>
        )}
      </div>
    </div>
  );
}
