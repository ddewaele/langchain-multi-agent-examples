import {
  Search, Code, Palette, Zap, ListTodo, FileText,
  GitBranch, BarChart3, ShieldCheck, BookOpen,
} from "lucide-react";
import type { BackendId } from "../lib/api";

interface Props {
  onSuggestion: (text: string) => void;
  backend: BackendId;
}

// ── Per-backend configurations ──

interface WelcomeConfig {
  title: string;
  subtitle: string;
  agents: Array<{ icon: React.ReactNode; name: string; desc: string; color: string }>;
  suggestions: Array<{ icon: React.ReactNode; label: string; text: string; color: string }>;
}

const defaultConfig: WelcomeConfig = {
  title: "Multi-Agent Assistant",
  subtitle: "Powered by a team of specialist AI agents",
  agents: [
    { icon: <Search size={20} />, name: "Research Agent", desc: "Web search, facts, and data analysis", color: "#3b82f6" },
    { icon: <Code size={20} />, name: "Code Agent", desc: "Write, debug, and analyze code", color: "#10b981" },
    { icon: <Palette size={20} />, name: "Creative Agent", desc: "Writing, brainstorming, and content", color: "#f59e0b" },
  ],
  suggestions: [
    { icon: <Search size={18} />, label: "Research", text: "What are the latest developments in quantum computing?", color: "#3b82f6" },
    { icon: <Code size={18} />, label: "Code", text: "Write a TypeScript function to debounce API calls with generics", color: "#10b981" },
    { icon: <Palette size={18} />, label: "Creative", text: "Write a compelling product launch announcement for an AI code assistant", color: "#f59e0b" },
    { icon: <Zap size={18} />, label: "Multi-step", text: "Research React Server Components, then write example code showing the pattern", color: "#8b5cf6" },
  ],
};

const showcaseConfig: WelcomeConfig = {
  title: "Research Orchestrator",
  subtitle: "Deep Agents with planning, filesystem, 4 specialists, and persistence",
  agents: [
    { icon: <Search size={20} />, name: "Web Researcher", desc: "Searches web, gathers facts and sources", color: "#3b82f6" },
    { icon: <BarChart3 size={20} />, name: "Data Analyst", desc: "Analyzes data, finds trends and insights", color: "#10b981" },
    { icon: <FileText size={20} />, name: "Report Writer", desc: "Drafts polished reports and documents", color: "#f59e0b" },
    { icon: <ShieldCheck size={20} />, name: "Fact Checker", desc: "Verifies claims and cross-references", color: "#ef4444" },
  ],
  suggestions: [
    {
      icon: <BookOpen size={18} />,
      label: "Full Report",
      text: "Research the current state of AI agents in 2024. Have your team gather sources, analyze trends, write a structured report, and fact-check the key claims. Save everything to the workspace.",
      color: "#8b5cf6",
    },
    {
      icon: <BarChart3 size={18} />,
      label: "Competitive Analysis",
      text: "Do a competitive analysis of the top 3 cloud providers (AWS, Azure, GCP) for AI/ML workloads. Research pricing, services, and market share. Write an executive brief with recommendations.",
      color: "#10b981",
    },
    {
      icon: <ListTodo size={18} />,
      label: "Tech Evaluation",
      text: "Evaluate React, Vue, and Svelte for a new enterprise dashboard project. Research performance benchmarks, ecosystem maturity, and hiring availability. Create a decision matrix and write a recommendation report.",
      color: "#3b82f6",
    },
    {
      icon: <GitBranch size={18} />,
      label: "Multi-Step Research",
      text: "I need a blog post about the rise of AI coding assistants. First research the key players and market data, then analyze adoption trends, then write a 1000-word blog post, and finally fact-check it.",
      color: "#f59e0b",
    },
  ],
};

const configs: Partial<Record<BackendId, WelcomeConfig>> = {
  "deep-agents-showcase": showcaseConfig,
};

// ── Capability badges for showcase ──

function ShowcaseCapabilities() {
  const caps = [
    { icon: <ListTodo size={13} />, label: "Planning", desc: "write_todos" },
    { icon: <FileText size={13} />, label: "Filesystem", desc: "read/write/edit files" },
    { icon: <GitBranch size={13} />, label: "Subagents", desc: "4 specialists" },
    { icon: <Zap size={13} />, label: "Persistence", desc: "cross-turn memory" },
  ];
  return (
    <div className="capability-badges">
      {caps.map((c, i) => (
        <div key={i} className="capability-badge">
          {c.icon}
          <span className="capability-label">{c.label}</span>
          <span className="capability-desc">{c.desc}</span>
        </div>
      ))}
    </div>
  );
}

export function WelcomeScreen({ onSuggestion, backend }: Props) {
  const config = configs[backend] || defaultConfig;
  const isShowcase = backend === "deep-agents-showcase";

  return (
    <div className="welcome-screen">
      <div className="welcome-header">
        <div className={`welcome-logo ${isShowcase ? "showcase" : ""}`}>
          {isShowcase ? <GitBranch size={32} /> : <Zap size={32} />}
        </div>
        <h1>{config.title}</h1>
        <p>{config.subtitle}</p>
      </div>

      {isShowcase && <ShowcaseCapabilities />}

      <div className={`agent-cards ${config.agents.length === 4 ? "four-cols" : ""}`}>
        {config.agents.map((a, i) => (
          <div key={i} className="agent-card" style={{ borderColor: a.color }}>
            <span style={{ color: a.color }}>{a.icon}</span>
            <h3>{a.name}</h3>
            <p>{a.desc}</p>
          </div>
        ))}
      </div>

      <div className="suggestions">
        <p className="suggestions-label">{isShowcase ? "Try a multi-step research task:" : "Try asking:"}</p>
        <div className={`suggestion-grid ${isShowcase ? "single-col" : ""}`}>
          {config.suggestions.map((s, i) => (
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
