import { describe, expect, it } from "vitest";

import type { BackendError, SqlErrorPosition } from "@/lib/backend/errorUtils";
import { sqlErrorEditorOffset } from "@/lib/sql/errorPosition";
import type { QueryResult } from "@/types/database";

function backendError(position?: SqlErrorPosition): BackendError {
  return {
    version: 1,
    code: "DBX-JDBC-4001",
    messageKey: "backendErrors.jdbc.sqlFailed",
    messageParams: { stage: "execute" },
    source: "jdbcAgent",
    operationOutcome: "unknown",
    detail: "ERROR: relation does not exist",
    ...(position ? { errorPosition: position } : {}),
  };
}

function errorResult(options: { editorStatement?: string; sourceFrom?: number; sourceTo?: number; position?: SqlErrorPosition }): QueryResult {
  const statement = options.editorStatement ?? "";
  return {
    columns: ["Error"],
    rows: [["ERROR: relation does not exist"]],
    affected_rows: 0,
    execution_time_ms: 0,
    execution_error: true,
    error: backendError(options.position),
    sourceStatement: statement,
    sourceFrom: options.sourceFrom ?? 0,
    sourceTo: options.sourceTo ?? statement.length,
  };
}

describe("sqlErrorEditorOffset", () => {
  it("maps a first-line column to an absolute editor offset", () => {
    const sql = "SELECT * FROM no_such_table";
    const result = errorResult({
      editorStatement: sql,
      position: { line: 1, column: 15, offset: 14 },
    });

    expect(sqlErrorEditorOffset({ editorSql: sql, result })).toEqual({ offset: 14, line: 1, column: 15 });
  });

  it("maps a later-line column", () => {
    const statement = "SELECT *\nFROM missing";
    const result = errorResult({
      editorStatement: statement,
      position: { line: 2, column: 6, offset: 14 },
    });

    expect(sqlErrorEditorOffset({ editorSql: statement, result })).toEqual({ offset: 14, line: 2, column: 6 });
  });

  it("adds the statement's absolute start offset in a multi-statement editor", () => {
    const statement = "SELECT *\nFROM missing";
    const editorSql = "SELECT 1;\n" + statement;
    const start = editorSql.indexOf(statement);
    const result = errorResult({
      editorStatement: statement,
      sourceFrom: start,
      sourceTo: start + statement.length,
      position: { line: 2, column: 6, offset: 14 },
    });

    expect(sqlErrorEditorOffset({ editorSql, result })).toEqual({ offset: start + 14, line: 2, column: 6 });
  });

  it("converts scalar-value columns to UTF-16 offsets for astral characters", () => {
    const statement = "SELECT '😀' FROM t";
    // Code-point column of FROM: S E L E C T space ' 😀 ' space = 11 chars, so FROM is column 12.
    const result = errorResult({
      editorStatement: statement,
      position: { line: 1, column: 12, offset: 11 },
    });

    // UTF-16 offset: the emoji occupies two code units, so 'FROM' starts at 12.
    expect(sqlErrorEditorOffset({ editorSql: statement, result })).toEqual({ offset: 12, line: 1, column: 12 });
  });

  it("returns undefined when the result carries no position", () => {
    const sql = "SELECT 1";
    const result = errorResult({ editorStatement: sql });

    expect(sqlErrorEditorOffset({ editorSql: sql, result })).toBeUndefined();
  });

  it("returns undefined when the statement no longer matches the editor", () => {
    const result = errorResult({
      editorStatement: "SELECT * FROM gone",
      position: { line: 1, column: 15, offset: 14 },
    });

    expect(sqlErrorEditorOffset({ editorSql: "SELECT 1", result })).toBeUndefined();
  });

  it("returns undefined for a line beyond the statement", () => {
    const sql = "SELECT 1";
    const result = errorResult({
      editorStatement: sql,
      position: { line: 5, column: 1, offset: 4 },
    });

    expect(sqlErrorEditorOffset({ editorSql: sql, result })).toBeUndefined();
  });
});
