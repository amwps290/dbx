import { describe, it, expect } from "vitest";
import { appendQueryResultSegment } from "@/stores/queryStore";
import type { QueryResult } from "@/types/database";

function make(rows: number, spatial?: QueryResult["spatial_columns"]): QueryResult {
  return {
    columns: ["geom"],
    column_types: ["geometry"],
    spatial_columns: spatial,
    rows: Array.from({ length: rows }, (_, i) => [`POINT(${i} ${i})`]),
    affected_rows: 0,
    execution_time_ms: 0,
  } as unknown as QueryResult;
}

describe("appendQueryResultSegment spatial merge", () => {
  it("keeps the first non-null SRID per column across pages", () => {
    const previous = make(2, [{ column_index: 0, srid: 4326 }]);
    const segment = make(2, [{ column_index: 0, srid: 3857 }]);
    const merged = appendQueryResultSegment(previous, segment, 100);
    expect(merged.spatial_columns).toEqual([{ column_index: 0, srid: 4326 }]);
    expect(merged.rows).toHaveLength(4);
  });

  it("adopts the segment SRID when the previous page was unknown", () => {
    const previous = make(1, [{ column_index: 0, srid: null }]);
    const segment = make(1, [{ column_index: 0, srid: 4490 }]);
    const merged = appendQueryResultSegment(previous, segment, 100);
    expect(merged.spatial_columns).toEqual([{ column_index: 0, srid: 4490 }]);
  });
});
