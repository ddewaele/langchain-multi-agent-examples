import { tool } from "langchain";
import { z } from "zod";

// ── Research Tools ──

export const webSearch = tool(
  async ({ query }) => {
    return `[Search results for "${query}"]\n\nTop results:\n1. ${query} - Wikipedia overview\n2. Recent developments in ${query}\n3. Expert analysis of ${query}\n\nNote: Simulated search. Connect Tavily/SerpAPI for production.`;
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
    return `[Content from ${url}]\n\nSimulated page content. Connect a real web scraper for production.`;
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
    return `[Documentation: ${library ? library + " - " : ""}${query}]\n\nAPI reference, usage patterns, and best practices found.\nNote: Simulated. Connect a real docs API for production.`;
  },
  {
    name: "lookup_docs",
    description: "Look up documentation for a programming library, API, or language feature",
    schema: z.object({
      query: z.string().describe("What to look up"),
      library: z.string().optional().describe("Specific library name"),
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

// ── Creative Tools ──

export const generateOutline = tool(
  async ({ topic, style }) => {
    return `[Outline: "${topic}" - ${style} style]\n\n1. Introduction\n   - Hook and context\n   - Thesis\n\n2. Background\n   - Key concepts\n\n3. Main Body\n   - Core argument\n   - Evidence\n   - Counterpoints\n\n4. Conclusion\n   - Summary\n   - Call to action`;
  },
  {
    name: "generate_outline",
    description: "Generate a structured outline for writing",
    schema: z.object({
      topic: z.string().describe("The topic to outline"),
      style: z.enum(["blog", "academic", "technical", "creative", "business"]).describe("Writing style"),
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

export const researchTools = [webSearch, getWebPage, currentDateTime];
export const codeTools = [lookupDocs, calculator];
export const creativeTools = [generateOutline, currentDateTime];
