import { tool } from "langchain";
import { z } from "zod";

// ── Research Tools ──

export const webSearch = tool(
  async ({ query, maxResults }) => {
    // Simulated — connect Tavily, SerpAPI, or Brave Search for production
    const results = Array.from({ length: maxResults || 3 }, (_, i) => ({
      title: `${query} - Result ${i + 1}`,
      url: `https://example.com/search/${encodeURIComponent(query)}/${i + 1}`,
      snippet: `Comprehensive analysis of ${query}. This source covers key developments, expert opinions, and recent data.`,
    }));
    return JSON.stringify({ query, results, note: "Simulated search. Connect a real API for production." });
  },
  {
    name: "web_search",
    description: "Search the web for current information. Returns structured results with titles, URLs, and snippets.",
    schema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z.number().optional().default(3).describe("Max results to return (1-5)"),
    }),
  }
);

export const fetchWebPage = tool(
  async ({ url }) => {
    return JSON.stringify({
      url,
      title: `Page: ${url}`,
      content: `[Simulated content from ${url}]\n\nThis page contains detailed information relevant to your research. Key sections include background, methodology, findings, and conclusions.\n\nNote: Connect a real web scraper (e.g., Firecrawl, Jina) for production.`,
      wordCount: 1500,
    });
  },
  {
    name: "fetch_web_page",
    description: "Fetch and extract the content of a web page for detailed reading",
    schema: z.object({
      url: z.string().describe("The URL to fetch"),
    }),
  }
);

// ── Data Analysis Tools ──

export const analyzeData = tool(
  async ({ data, analysisType }) => {
    return JSON.stringify({
      analysisType,
      summary: `Analysis of the provided data using ${analysisType} approach.`,
      findings: [
        "Key trend: Significant growth observed in the primary metric",
        "Correlation: Strong positive relationship between variables A and B",
        "Outlier: Notable deviation detected in Q3 data points",
      ],
      confidence: 0.85,
      note: "Simulated analysis. Connect a real data pipeline for production.",
    });
  },
  {
    name: "analyze_data",
    description: "Analyze data and extract insights, trends, and patterns",
    schema: z.object({
      data: z.string().describe("The data to analyze (JSON, CSV, or description)"),
      analysisType: z.enum(["trend", "comparison", "summary", "statistical"]).describe("Type of analysis"),
    }),
  }
);

// ── Code Tools ──

export const lookupDocs = tool(
  async ({ query, library }) => {
    return JSON.stringify({
      query,
      library: library || "general",
      docs: `API reference and usage patterns for ${query}${library ? ` in ${library}` : ""}.`,
      examples: [`// Example usage of ${query}\nconsole.log("See official docs for details");`],
      note: "Simulated. Connect a real docs API for production.",
    });
  },
  {
    name: "lookup_docs",
    description: "Look up programming documentation, API references, and code examples",
    schema: z.object({
      query: z.string().describe("What to look up"),
      library: z.string().optional().describe("Specific library or framework"),
    }),
  }
);

export const calculator = tool(
  async ({ expression }) => {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
      const result = new Function(`"use strict"; return (${sanitized})`)();
      return `${expression} = ${result}`;
    } catch {
      return `Error evaluating: ${expression}`;
    }
  },
  {
    name: "calculator",
    description: "Evaluate a mathematical expression",
    schema: z.object({
      expression: z.string().describe("Math expression (e.g., '2 + 2')"),
    }),
  }
);

// ── Creative/Writing Tools ──

export const generateOutline = tool(
  async ({ topic, format, sections }) => {
    const numSections = sections || 5;
    const sectionList = Array.from({ length: numSections }, (_, i) => ({
      number: i + 1,
      title: `Section ${i + 1}: ${["Introduction", "Background", "Core Analysis", "Case Studies", "Conclusions"][i % 5]}`,
      keyPoints: ["Key point A", "Key point B"],
    }));
    return JSON.stringify({ topic, format, sections: sectionList });
  },
  {
    name: "generate_outline",
    description: "Generate a structured outline for a report, article, or document",
    schema: z.object({
      topic: z.string().describe("The topic to outline"),
      format: z.enum(["report", "blog", "academic", "executive_brief", "whitepaper"]).describe("Document format"),
      sections: z.number().optional().default(5).describe("Number of sections"),
    }),
  }
);

export const currentDateTime = tool(
  async () => new Date().toISOString(),
  {
    name: "current_date_time",
    description: "Get the current date and time",
    schema: z.object({}),
  }
);

// ── Tool Groups ──

export const researchTools = [webSearch, fetchWebPage, analyzeData, currentDateTime];
export const codeTools = [lookupDocs, calculator];
export const writingTools = [generateOutline, currentDateTime];
export const allTools = [webSearch, fetchWebPage, analyzeData, lookupDocs, calculator, generateOutline, currentDateTime];
