/**
 * Strategy graph validator — checks for structural and semantic issues
 * before a strategy can be activated.
 */

import {
  type StrategyGraph,
  type ValidationIssue,
  ValidationSeverity,
  BlockType,
  NodeCategory,
  BLOCK_REGISTRY,
  type PortType,
} from "@polyblocks/types";
import { topologicalSort, buildAdjacency } from "./graph.js";

export function validateStrategy(graph: StrategyGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ── 1. Must have at least one node ────────────────────────────────────────
  if (graph.nodes.length === 0) {
    issues.push({
      severity: ValidationSeverity.Error,
      message: "Strategy has no blocks. Add at least a trigger and an action.",
    });
    return issues;
  }

  // ── 2. Cycle detection ────────────────────────────────────────────────────
  const topo = topologicalSort(graph.nodes, graph.edges);
  if (topo.hasCycle) {
    issues.push({
      severity: ValidationSeverity.Error,
      message:
        "Strategy contains a cycle. Connections must form a directed acyclic graph (DAG).",
    });
  }

  // ── 3. Must have at least one trigger ─────────────────────────────────────
  const hasTrigger = graph.nodes.some(
    (n) => BLOCK_REGISTRY[n.type]?.category === NodeCategory.Trigger,
  );
  if (!hasTrigger) {
    issues.push({
      severity: ValidationSeverity.Error,
      message:
        "Strategy needs at least one Trigger block (Interval, Price Cross, or Manual).",
    });
  }

  // ── 4. Must have at least one action ──────────────────────────────────────
  const hasAction = graph.nodes.some(
    (n) => BLOCK_REGISTRY[n.type]?.category === NodeCategory.Action,
  );
  if (!hasAction) {
    issues.push({
      severity: ValidationSeverity.Warning,
      message:
        "Strategy has no Action blocks. It will run but won't do anything.",
    });
  }

  // ── 5. Check for disconnected nodes ───────────────────────────────────────
  const adj = buildAdjacency(graph.nodes, graph.edges);

  for (const node of graph.nodes) {
    if (node.type === BlockType.Note) continue; // Notes are always disconnected

    const incoming = adj.reverse.get(node.id) ?? [];
    const outgoing = adj.forward.get(node.id) ?? [];
    const def = BLOCK_REGISTRY[node.type];

    if (!def) {
      issues.push({
        severity: ValidationSeverity.Error,
        nodeId: node.id,
        message: `Unknown block type: ${node.type}`,
      });
      continue;
    }

    // Source nodes (triggers, market selectors) don't need inputs
    const isSource =
      def.category === NodeCategory.Trigger ||
      node.type === BlockType.MarketSelector;

    if (!isSource && incoming.length === 0 && def.inputs.length > 0) {
      issues.push({
        severity: ValidationSeverity.Warning,
        nodeId: node.id,
        message: `"${def.label}" has no incoming connections — it won't receive any data.`,
      });
    }

    // Leaf nodes (actions, debug) don't need outputs
    const isLeaf =
      def.category === NodeCategory.Action ||
      node.type === BlockType.DebugLog ||
      node.type === BlockType.KillSwitch;

    if (!isLeaf && outgoing.length === 0 && def.outputs.length > 0) {
      issues.push({
        severity: ValidationSeverity.Info,
        nodeId: node.id,
        message: `"${def.label}" has no outgoing connections — its output is unused.`,
      });
    }
  }

  // ── 6. Port type compatibility ────────────────────────────────────────────
  for (const edge of graph.edges) {
    const sourceNode = graph.nodes.find((n) => n.id === edge.source);
    const targetNode = graph.nodes.find((n) => n.id === edge.target);
    if (!sourceNode || !targetNode) {
      issues.push({
        severity: ValidationSeverity.Error,
        message: `Edge ${edge.id} references missing node(s).`,
      });
      continue;
    }

    const sourceDef = BLOCK_REGISTRY[sourceNode.type];
    const targetDef = BLOCK_REGISTRY[targetNode.type];
    if (!sourceDef || !targetDef) continue;

    const sourcePort = sourceDef.outputs.find((p) => p.id === edge.sourceHandle);
    const targetPort = targetDef.inputs.find((p) => p.id === edge.targetHandle);

    if (!sourcePort) {
      issues.push({
        severity: ValidationSeverity.Error,
        nodeId: edge.source,
        message: `Output port "${edge.sourceHandle}" not found on "${sourceDef.label}".`,
      });
    }
    if (!targetPort) {
      issues.push({
        severity: ValidationSeverity.Error,
        nodeId: edge.target,
        message: `Input port "${edge.targetHandle}" not found on "${targetDef.label}".`,
      });
    }

    if (sourcePort && targetPort) {
      if (!isPortCompatible(sourcePort.type, targetPort.type)) {
        issues.push({
          severity: ValidationSeverity.Error,
          message: `Type mismatch: "${sourceDef.label}.${sourcePort.label}" (${sourcePort.type}) → "${targetDef.label}.${targetPort.label}" (${targetPort.type})`,
        });
      }
    }
  }

  // ── 7. Market selector config ─────────────────────────────────────────────
  for (const node of graph.nodes) {
    if (node.type === BlockType.MarketSelector) {
      if (!node.config.conditionId) {
        issues.push({
          severity: ValidationSeverity.Error,
          nodeId: node.id,
          message: "Market Selector has no market selected. Search and pick a market.",
        });
      }
    }
  }

  return issues;
}

function isPortCompatible(source: PortType, target: PortType): boolean {
  if (source === target) return true;
  if (source === "any" || target === "any") return true;
  // Signal can loosely connect to boolean (truthy)
  if (source === "signal" && target === "boolean") return true;
  return false;
}
