import { describe, expect, it } from "vitest";

import { flattenPgPartitionNodes, pgPartitionBoundText, pgPartitionKindLabelKey, pgPartitionNodeBoundText } from "@/lib/table/pgPartitionPresentation";
import type { PgPartitionNode } from "@/types/database";

function node(name: string, children: PgPartitionNode[] = []): PgPartitionNode {
  return { schema: "public", name, isLeaf: children.length === 0, children };
}

describe("pgPartitionPresentation", () => {
  it("flattens a multi-level tree depth-first with nesting depth", () => {
    const tree = [node("logs", [node("logs_2024", [node("logs_2024_us")])]), node("logs_default")];

    expect(flattenPgPartitionNodes(tree).map(({ depth, node: rowNode }) => `${depth}:${rowNode.name}`)).toEqual(["0:logs", "1:logs_2024", "2:logs_2024_us", "0:logs_default"]);
  });

  it("gives every row a unique key", () => {
    const rows = flattenPgPartitionNodes([node("a"), node("b", [node("b1")])]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it("renders each bound kind as its SQL fragment", () => {
    expect(pgPartitionBoundText({ kind: "range", from: ["'2024-01-01'"], to: ["'2025-01-01'"] })).toBe("FROM ('2024-01-01') TO ('2025-01-01')");
    expect(pgPartitionBoundText({ kind: "range", from: ["MINVALUE", "'a'"], to: ["MAXVALUE", "'b'"] })).toBe("FROM (MINVALUE, 'a') TO (MAXVALUE, 'b')");
    expect(pgPartitionBoundText({ kind: "list", values: ["'a'", "'b'"] })).toBe("IN ('a', 'b')");
    expect(pgPartitionBoundText({ kind: "hash", modulus: 2, remainder: 1 })).toBe("MODULUS 2 REMAINDER 1");
    expect(pgPartitionBoundText({ kind: "default" })).toBe("DEFAULT");
    expect(pgPartitionBoundText(undefined)).toBe("");
  });

  it("falls back to the raw catalog definition when the bound was not parsed", () => {
    expect(pgPartitionNodeBoundText({ ...node("p"), boundDefinition: "FOR VALUES IN (1)" })).toBe("FOR VALUES IN (1)");
    expect(pgPartitionNodeBoundText({ ...node("p"), bound: { kind: "default" }, boundDefinition: "DEFAULT" })).toBe("DEFAULT");
    expect(pgPartitionNodeBoundText(node("p"))).toBe("");
  });

  it("maps strategies to translation keys", () => {
    expect(pgPartitionKindLabelKey("range")).toBe("structureEditor.partitionKindRange");
    expect(pgPartitionKindLabelKey("list")).toBe("structureEditor.partitionKindList");
    expect(pgPartitionKindLabelKey("hash")).toBe("structureEditor.partitionKindHash");
    expect(pgPartitionKindLabelKey(undefined)).toBeUndefined();
  });
});
