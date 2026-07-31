import { describe, expect, it } from "vitest";
import { buildGeometryMapFeatureCollection } from "@/lib/dataGrid/geometryMapPreview";
import type { PreviewActionContext } from "@/lib/dataGrid/resultPreviewRegistry";

function context(): PreviewActionContext {
  return {
    result: {
      columns: ["shape", "name"],
      column_types: ["geometry", "text"],
      column_sortables: [],
      spatial_columns: [{ column_index: 0, srid: 4326 }],
      rows: [
        ["POINT(116.397 39.908)", "wgs84"],
        ["POINT(12957254.77 4852618.61)", "mercator"],
        ["POINT(1 2)", "unknown"],
      ],
      affected_rows: 0,
      execution_time_ms: 1,
      truncated: false,
      has_more: false,
    },
    selectedRowIds: [],
    displayRowRefs: [
      { id: 20, sourceIndex: 1, isNew: false },
      { id: 10, sourceIndex: 0, isNew: false },
      { id: 30, sourceIndex: 2, isNew: false },
    ],
  };
}

describe("buildGeometryMapFeatureCollection", () => {
  it("exposes the detected layer SRID and binds row properties by sourceIndex", () => {
    const collection = buildGeometryMapFeatureCollection(context());

    expect(collection?.detectedSrid).toBe(4326);
    expect(collection?.features.map((feature) => feature.properties.name)).toEqual(["mercator", "wgs84", "unknown"]);
  });

  it("reports detectedSrid null when spatial metadata is absent", () => {
    const ctx = context();
    ctx.result.spatial_columns = undefined;

    const collection = buildGeometryMapFeatureCollection(ctx);
    expect(collection?.detectedSrid).toBeNull();
  });

  it("binds each feature to its own per-cell SRID when the column mixes SRIDs", () => {
    const ctx = context();
    ctx.result.spatial_columns = [{ column_index: 0, srid: 4326 }];
    // Per-cell SRIDs, parallel to rows: wgs84=4326, mercator=3857, unknown=null.
    ctx.result.spatial_values = [
      [4326, null],
      [3857, null],
      [null, null],
    ];

    const collection = buildGeometryMapFeatureCollection(ctx);
    // displayRowRefs order is [mercator, wgs84, unknown]; the unknown cell falls
    // back to the column-level default 4326.
    expect(collection?.features.map((feature) => feature.properties._srid)).toEqual([3857, 4326, 4326]);
  });

  it("prefers per-cell SRIDs over column-level hints", () => {
    const ctx = context();
    ctx.result.spatial_columns = [{ column_index: 0, srid: 3857 }];
    ctx.result.spatial_values = [
      [4326, null],
      [null, null],
      [null, null],
    ];

    const collection = buildGeometryMapFeatureCollection(ctx);
    // wgs84 row carries its own 4326 even though the column hint says 3857.
    expect(collection?.features.find((f) => f.properties.name === "wgs84")?.properties._srid).toBe(4326);
  });
});
