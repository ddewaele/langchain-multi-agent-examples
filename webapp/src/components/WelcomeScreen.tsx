import { Search, Code, Palette, Zap } from "lucide-react";

interface Props {
  onSuggestion: (text: string) => void;
}

const suggestions = [
  {
    icon: <Search size={18} />,
    label: "Research",
    text: "What are the latest developments in quantum computing?",
    color: "#3b82f6",
  },
  {
    icon: <Code size={18} />,
    label: "Code",
    text: "Write a TypeScript function to debounce API calls with generics",
    color: "#10b981",
  },
  {
    icon: <Palette size={18} />,
    label: "Creative",
    text: "Write a compelling product launch announcement for an AI code assistant",
    color: "#f59e0b",
  },
  {
    icon: <Zap size={18} />,
    label: "Multi-step",
    text: "Research React Server Components, then write example code showing the pattern",
    color: "#8b5cf6",
  },
];

export function WelcomeScreen({ onSuggestion }: Props) {
  return (
    <div className="welcome-screen">
      <div className="welcome-header">
        <div className="welcome-logo">
          <Zap size={32} />
        </div>
        <h1>Multi-Agent Assistant</h1>
        <p>Powered by a team of specialist AI agents</p>
      </div>

      <div className="agent-cards">
        <div className="agent-card" style={{ borderColor: "#3b82f6" }}>
          <Search size={20} color="#3b82f6" />
          <h3>Research Agent</h3>
          <p>Web search, facts, and data analysis</p>
        </div>
        <div className="agent-card" style={{ borderColor: "#10b981" }}>
          <Code size={20} color="#10b981" />
          <h3>Code Agent</h3>
          <p>Write, debug, and analyze code</p>
        </div>
        <div className="agent-card" style={{ borderColor: "#f59e0b" }}>
          <Palette size={20} color="#f59e0b" />
          <h3>Creative Agent</h3>
          <p>Writing, brainstorming, and content</p>
        </div>
      </div>

      <div className="suggestions">
        <p className="suggestions-label">Try asking:</p>
        <div className="suggestion-grid">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="suggestion-btn"
              onClick={() => onSuggestion(s.text)}
              style={{ borderColor: s.color + "40" }}
            >
              <span className="suggestion-icon" style={{ color: s.color }}>
                {s.icon}
              </span>
              <span className="suggestion-text">{s.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
