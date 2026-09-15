import type { DatabaseType, QueryResult } from "@/types/database";
import type { SqlParameterOptions } from "@/lib/sql/sqlParameters";
import { resultSourceRange } from "@/lib/tabs/tabPresentation";

export interface EditorErrorPosition {
  /** Absolute UTF-16 offset into the current editor document. */
  offset: number;
  /** 1-based line within the statement, for display. */
  line: number;
  /** 1-based column within the statement, for display. */
  column: number;
}

/**
 * Translate a backend-reported SQL error position (relative to the executed
 * statement text) into an absolute offset in the current editor document.
 *
 * Returns `undefined` unless the error carries a position AND the result can be
 * proven to still map to the same statement text in the editor via
 * {@link resultSourceRange}. That guard prevents jumping to a different
 * statement, or to a stale offset, when the editor moved on since execution.
 *
 * The backend reports `line`/`column`/`offset` in Unicode scalar values, so the
 * conversion walks code points (`Array.from`) and only converts to UTF-16 at
 * the very end.
 */
export function sqlErrorEditorOffset(options: { editorSql: string; result: QueryResult | undefined | null; resultIndex?: number; databaseType?: DatabaseType; parameterOptions?: SqlParameterOptions }): EditorErrorPosition | undefined {
  const position = options.result?.error?.errorPosition;
  if (!position) return undefined;

  const range = resultSourceRange(options.editorSql, options.result ?? undefined, options.resultIndex, options.databaseType, options.parameterOptions);
  if (!range) return undefined;

  // Walk to the start of the requested line within the statement text.
  const characters = Array.from(range.sql);
  let line = 1;
  let lineStart = 0;
  let index = 0;
  while (index < characters.length && line < position.line) {
    if (characters[index] === "\n") {
      line += 1;
      lineStart = index + 1;
    }
    index += 1;
  }
  if (line !== position.line) return undefined;

  // Advance within the line by (column - 1) code points, clamped to the line end.
  let columnOffset = 0;
  while (columnOffset < position.column - 1 && lineStart + columnOffset < characters.length) {
    if (characters[lineStart + columnOffset] === "\n") break;
    columnOffset += 1;
  }
  const characterIndex = lineStart + columnOffset;

  // Convert the scalar-value index into a UTF-16 offset before adding the
  // statement's absolute start, since the editor document is UTF-16 indexed.
  const utf16Offset = characters.slice(0, characterIndex).join("").length;
  return { offset: range.from + utf16Offset, line: position.line, column: position.column };
}
