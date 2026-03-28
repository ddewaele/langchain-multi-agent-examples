import { Layers, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { BACKENDS, type BackendId } from "../lib/api";

interface Props {
  selected: BackendId;
  onChange: (id: BackendId) => void;
}

const badgeColors: Record<BackendId, string> = {
  langgraph: "#8b5cf6",
  "langchain-agents": "#3b82f6",
  "deep-agents": "#10b981",
};

export function BackendSelector({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = BACKENDS.find((b) => b.id === selected)!;

  return (
    <div className="backend-selector" ref={ref}>
      <button className="backend-trigger" onClick={() => setOpen(!open)}>
        <Layers size={14} style={{ color: badgeColors[selected] }} />
        <span className="backend-name">{current.name}</span>
        <ChevronDown size={12} className={open ? "rotated" : ""} />
      </button>

      {open && (
        <div className="backend-dropdown">
          <div className="backend-dropdown-header">Select Backend</div>
          {BACKENDS.map((b) => (
            <button
              key={b.id}
              className={`backend-option ${b.id === selected ? "active" : ""}`}
              onClick={() => {
                onChange(b.id);
                setOpen(false);
              }}
            >
              <div className="backend-option-dot" style={{ background: badgeColors[b.id] }} />
              <div className="backend-option-info">
                <div className="backend-option-name">{b.name}</div>
                <div className="backend-option-desc">{b.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
