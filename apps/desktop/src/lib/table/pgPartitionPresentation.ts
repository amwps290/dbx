import type { PgPartitionBound, PgPartitionKind, PgPartitionNode } from "@/types/database";

/** One flattened row of a partition tree, carrying its nesting depth for indentation. */
export interface PgPartitionTreeRow {
  key: string;
  depth: number;
  node: PgPartitionNode;
}

/**
 * Depth-first flatten of a partition tree so the editor can render multi-level
 * hierarchies as an indented list without recursive components.
 */
export function flattenPgPartitionNodes(nodes: PgPartitionNode[], depth = 0, keyPrefix = ""): PgPartitionTreeRow[] {
  const rows: PgPartitionTreeRow[] = [];
  for (const node of nodes) {
    const key = `${keyPrefix}${node.schema}.${node.name}`;
    rows.push({ key, depth, node });
    rows.push(...flattenPgPartitionNodes(node.children, depth + 1, `${key}/`));
  }
  return rows;
}

/** Renders a parsed bound as the SQL fragment PostgreSQL uses in `CREATE TABLE ... PARTITION OF`. */
export function pgPartitionBoundText(bound?: PgPartitionBound): string {
  if (!bound) return "";
  if (bound.kind === "default") return "DEFAULT";
  if (bound.kind === "range") return `FROM (${bound.from.join(", ")}) TO (${bound.to.join(", ")})`;
  if (bound.kind === "list") return `IN (${bound.values.join(", ")})`;
  return `MODULUS ${bound.modulus} REMAINDER ${bound.remainder}`;
}

/**
 * Bound text for a tree node, falling back to the raw catalog definition when
 * the bound shape was not recognized by the backend parser.
 */
export function pgPartitionNodeBoundText(node: PgPartitionNode): string {
  return node.bound ? pgPartitionBoundText(node.bound) : node.boundDefinition || "";
}

/**
 * Splits user-entered partition bound values on top-level commas only. Commas
 * inside single quotes (with `''` escapes) or nested parentheses stay in the
 * value, so `lower('a,b'), 2` yields two values.
 */
export function splitPgPartitionBoundValues(input: string): string[] {
  const values: string[] = [];
  let current = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < input.length; index += 1) {
    const ch = input[index];
    if (ch === "'" && !inDouble) {
      if (inSingle && input[index + 1] === "'") {
        current += "''";
        index += 1;
        continue;
      }
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (!inSingle && !inDouble && ch === "(") depth += 1;
    if (!inSingle && !inDouble && ch === ")") depth -= 1;
    if (ch === "," && !inSingle && !inDouble && depth === 0) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current.trim());
  return values.filter((value) => value.length > 0);
}

/** Translation key for a partition strategy label. */
export function pgPartitionKindLabelKey(kind?: PgPartitionKind): string | undefined {
  if (kind === "range") return "structureEditor.partitionKindRange";
  if (kind === "list") return "structureEditor.partitionKindList";
  if (kind === "hash") return "structureEditor.partitionKindHash";
  return undefined;
}
