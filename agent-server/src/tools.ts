import { tool } from "langchain";
import { z } from "zod";

// ── Research Tools ──

export const webSearch = tool(
  async ({ query }) => {
    // In production, integrate with Tavily, SerpAPI, or similar
    return `[Search results for "${query}"]\n\nHere are the top results:\n1. ${query} - Wikipedia overview\n2. Recent developments in ${query}\n3. Expert analysis of ${query}\n\nNote: This is a simulated search. Connect a real search API (e.g., Tavily) for production use.`;
  },
  {
    name: "web_search",
    description: "Search the web for current information on a topic",
    schema: z.object({
      query: z.string().describe("The search query"),
    }),
  }
);

export const getWebPage = tool(
  async ({ url }) => {
    return `[Content from ${url}]\n\nSimulated page content. Connect a real web scraper for production use.`;
  },
  {
    name: "get_web_page",
    description: "Fetch and extract content from a web page URL",
    schema: z.object({
      url: z.string().url().describe("The URL to fetch"),
    }),
  }
);

// ── Code Tools ──

export const lookupDocs = tool(
  async ({ query, library }) => {
    return `[Documentation lookup: ${library ? library + " - " : ""}${query}]\n\nRelevant documentation found:\n- API reference for ${query}\n- Common usage patterns and examples\n- Best practices and gotchas\n\nNote: This is simulated. Connect a real docs API for production use.`;
  },
  {
    name: "lookup_docs",
    description: "Look up documentation for a programming library, API, or language feature",
    schema: z.object({
      query: z.string().describe("What to look up (e.g., 'Array.prototype.reduce', 'React useEffect cleanup')"),
      library: z.string().optional().describe("Specific library name (e.g., 'react', 'lodash', 'express')"),
    }),
  }
);

export const calculator = tool(
  async ({ expression }) => {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
      if (sanitized !== expression.replace(/\s/g, "").replace(/\s/g, "")) {
        return "Error: Expression contains invalid characters. Only numbers and basic operators (+, -, *, /, %, parentheses) are allowed.";
      }
      const result = new Function(`"use strict"; return (${sanitized})`)();
      return `${expression} = ${result}`;
    } catch {
      return `Error evaluating expression: ${expression}`;
    }
  },
  {
    name: "calculator",
    description: "Evaluate a mathematical expression",
    schema: z.object({
      expression: z.string().describe("Mathematical expression to evaluate (e.g., '2 + 2', '(10 * 5) / 3')"),
    }),
  }
);

// ── Creative Tools ──

export const generateOutline = tool(
  async ({ topic, style }) => {
    return `[Outline for "${topic}" in ${style} style]\n\n1. Introduction\n   - Hook and context\n   - Thesis/main point\n\n2. Background\n   - Key concepts\n   - Historical context\n\n3. Main Body\n   - Point 1: Core argument\n   - Point 2: Supporting evidence\n   - Point 3: Counterpoints\n\n4. Conclusion\n   - Summary\n   - Call to action`;
  },
  {
    name: "generate_outline",
    description: "Generate a structured outline for a piece of writing",
    schema: z.object({
      topic: z.string().describe("The topic to outline"),
      style: z.enum(["blog", "academic", "technical", "creative", "business"]).describe("Writing style"),
    }),
  }
);

// ── General Tools ──

export const currentDateTime = tool(
  async () => {
    return new Date().toISOString();
  },
  {
    name: "current_date_time",
    description: "Get the current date and time",
    schema: z.object({}),
  }
);

// Tool groups by agent specialty
export const researchTools = [webSearch, getWebPage, currentDateTime];
export const codeTools = [lookupDocs, calculator];
export const creativeTools = [generateOutline, currentDateTime];
export const allTools = [webSearch, getWebPage, lookupDocs, generateOutline, calculator, currentDateTime];
