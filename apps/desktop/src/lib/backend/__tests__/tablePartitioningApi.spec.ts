import { afterEach, describe, expect, it, vi } from "vitest";

import { getTablePartitioning } from "@/lib/backend/http";

describe("PostgreSQL table partitioning web API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the structured partitioning view from the schema endpoint", async () => {
    const payload = {
      isPartitioned: true,
      isPartition: false,
      strategy: "range",
      keyDefinition: "RANGE (sold_on)",
      keyColumns: ["sold_on"],
      partitions: [{ schema: "public", name: "sales_2024", isLeaf: true, children: [] }],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTablePartitioning("connection 1", "sales/db", "public", "order items")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/schema/table-partitioning?connection_id=connection+1&database=sales%2Fdb&schema=public&table=order+items");
  });
});
