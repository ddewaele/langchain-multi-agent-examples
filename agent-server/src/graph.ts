import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state.js";
import {
  supervisorNode,
  researcherNode,
  coderNode,
  creativeNode,
  supervisorRouter,
  agentToolRouter,
  researchToolNode,
  codeToolNode,
  creativeToolNode,
} from "./agents.js";

/**
 * Multi-agent graph with a supervisor routing pattern.
 *
 *   START → supervisor → (router) → researcher / coder / creative → (tool loop) → END
 *
 * Each specialist can invoke tools in a loop before returning to END.
 */
function buildGraph() {
  const workflow = new StateGraph(AgentState)
    // ── Core nodes ──
    .addNode("supervisor", supervisorNode)
    .addNode("researcher", researcherNode)
    .addNode("coder", coderNode)
    .addNode("creative", creativeNode)

    // ── Tool nodes (one per specialist for clear separation) ──
    .addNode("researcher_tools", researchToolNode)
    .addNode("coder_tools", codeToolNode)
    .addNode("creative_tools", creativeToolNode)

    // ── Entry ──
    .addEdge(START, "supervisor")

    // ── Supervisor routing ──
    .addConditionalEdges("supervisor", supervisorRouter, {
      researcher: "researcher",
      coder: "coder",
      creative: "creative",
      __end__: END,
    })

    // ── Researcher tool loop ──
    .addConditionalEdges("researcher", (state) => {
      return agentToolRouter(state) === "tools" ? "researcher_tools" : "__end__";
    }, {
      researcher_tools: "researcher_tools",
      __end__: END,
    })
    .addEdge("researcher_tools", "researcher")

    // ── Coder tool loop ──
    .addConditionalEdges("coder", (state) => {
      return agentToolRouter(state) === "tools" ? "coder_tools" : "__end__";
    }, {
      coder_tools: "coder_tools",
      __end__: END,
    })
    .addEdge("coder_tools", "coder")

    // ── Creative tool loop ──
    .addConditionalEdges("creative", (state) => {
      return agentToolRouter(state) === "tools" ? "creative_tools" : "__end__";
    }, {
      creative_tools: "creative_tools",
      __end__: END,
    })
    .addEdge("creative_tools", "creative");

  return workflow.compile();
}

export const graph = buildGraph();
