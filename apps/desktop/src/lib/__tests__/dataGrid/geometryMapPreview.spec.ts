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
});
