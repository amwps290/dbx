import { describe, expect, it } from "vitest";
import { getTableMetadataCapabilities } from "@/lib/table/tableMetadataCapabilities";

describe("tableMetadataCapabilities", () => {
  it("exposes only collection indexes for MongoDB table information", () => {
    expect(getTableMetadataCapabilities("mongodb")).toEqual({
      columns: false,
      indexes: true,
      foreignKeys: false,
      constraints: false,
      triggers: false,
      partitions: false,
      ddl: false,
    });
  });

  it("exposes structured constraints only for dialects that implement list_constraints", () => {
    expect(getTableMetadataCapabilities("oracle").constraints).toBe(true);
    expect(getTableMetadataCapabilities("postgres").constraints).toBe(true);
    expect(getTableMetadataCapabilities("kingbase").constraints).toBe(true);
    expect(getTableMetadataCapabilities("vastbase").constraints).toBe(true);
    expect(getTableMetadataCapabilities("opengauss").constraints).toBe(true);
    expect(getTableMetadataCapabilities("mysql").constraints).toBe(false);
    expect(getTableMetadataCapabilities(undefined).constraints).toBe(false);
  });

  it("exposes partitions only for dialects with declarative partitioning metadata", () => {
    expect(getTableMetadataCapabilities("postgres").partitions).toBe(true);
    expect(getTableMetadataCapabilities("mysql").partitions).toBe(false);
    expect(getTableMetadataCapabilities("oracle").partitions).toBe(false);
    expect(getTableMetadataCapabilities(undefined).partitions).toBe(false);
  });
});
