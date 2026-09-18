// @vitest-environment happy-dom

import { createApp, nextTick, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

import TablePartitionsPanel from "@/components/structure/TablePartitionsPanel.vue";
import type { PgTablePartitioning } from "@/types/database";

const mountedApps: App[] = [];

async function mount(props: Record<string, unknown>) {
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp(TablePartitionsPanel, props);
  mountedApps.push(app);
  app.mount(root);
  for (let i = 0; i < 10; i += 1) {
    await nextTick();
    await Promise.resolve();
  }
  return root;
}

const partitioned: PgTablePartitioning = {
  isPartitioned: true,
  isPartition: false,
  strategy: "range",
  keyDefinition: "RANGE (sold_on)",
  keyColumns: ["sold_on"],
  defaultPartition: "sales_default",
  partitions: [
    {
      schema: "public",
      name: "sales_2024",
      isLeaf: true,
      bound: { kind: "range", from: ["'2024-01-01'"], to: ["'2025-01-01'"] },
      rowEstimate: 366,
      totalBytes: 1048576,
      children: [],
    },
    {
      schema: "public",
      name: "sales_nested",
      strategy: "list",
      isLeaf: false,
      bound: { kind: "range", from: ["'2025-01-01'"], to: ["'2026-01-01'"] },
      children: [{ schema: "public", name: "sales_nested_cn", isLeaf: true, bound: { kind: "list", values: ["'cn'"] }, children: [] }],
    },
  ],
};

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.innerHTML = "";
});

describe("TablePartitionsPanel", () => {
  it("renders the strategy, key, default partition and flattened rows", async () => {
    const root = await mount({ partitioning: partitioned, loading: false, error: "" });
    const text = root.textContent ?? "";

    expect(text).toContain("structureEditor.partitionKindRange");
    expect(text).toContain("RANGE (sold_on)");
    expect(text).toContain("structureEditor.partitionsDefault");
    expect(text).toContain("sales_default");
    expect(text).toContain("sales_2024");
    expect(text).toContain("FROM ('2024-01-01') TO ('2025-01-01')");
    // Nested child appears with its own bound, and the parent shows its strategy.
    expect(text).toContain("sales_nested_cn");
    expect(text).toContain("IN ('cn')");
    expect(text).toContain("structureEditor.partitionKindList");
    expect(text).toContain("structureEditor.partitionsRowEstimate");
    expect(text).toContain("structureEditor.partitionsSize");
  });

  it("filters rows by the search query", async () => {
    const root = await mount({ partitioning: partitioned, loading: false, error: "", searchQuery: "2024" });
    const text = root.textContent ?? "";
    expect(text).toContain("sales_2024");
    expect(text).not.toContain("sales_nested_cn");
  });

  it("shows the empty state for a non-partitioned table", async () => {
    const root = await mount({
      partitioning: { isPartitioned: false, isPartition: false, keyColumns: [], partitions: [] },
      loading: false,
      error: "",
    });
    expect(root.textContent ?? "").toContain("structureEditor.partitionsEmpty");
  });

  it("shows the error instead of the empty state", async () => {
    const root = await mount({ partitioning: null, loading: false, error: "permission denied" });
    expect(root.textContent ?? "").toContain("permission denied");
    expect(root.textContent ?? "").not.toContain("structureEditor.partitionsEmpty");
  });
});
