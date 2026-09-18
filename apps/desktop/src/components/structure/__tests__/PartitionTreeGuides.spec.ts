// @vitest-environment happy-dom

import { createApp, nextTick, type App } from "vue";
import { afterEach, describe, expect, it } from "vitest";

import PartitionTreeGuides from "@/components/structure/PartitionTreeGuides.vue";
import type { PgPartitionTreeRow } from "@/lib/table/pgPartitionPresentation";

const mountedApps: App[] = [];

async function mount(row: PgPartitionTreeRow) {
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp(PartitionTreeGuides, { row });
  mountedApps.push(app);
  app.mount(root);
  for (let i = 0; i < 5; i += 1) {
    await nextTick();
    await Promise.resolve();
  }
  return root;
}

function row(overrides: Partial<PgPartitionTreeRow>): PgPartitionTreeRow {
  return {
    key: "public.p",
    depth: 0,
    node: { schema: "public", name: "p", isLeaf: true, children: [] },
    ancestorGuides: [],
    isLastChild: true,
    ancestorKeys: [],
    ...overrides,
  };
}

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.innerHTML = "";
});

describe("PartitionTreeGuides", () => {
  it("draws one ancestor cell per level, only lining the ones that continue", async () => {
    const root = await mount(row({ depth: 2, ancestorGuides: [true, false], isLastChild: false }));

    const ancestors = Array.from(root.querySelectorAll('[data-partition-guide="ancestor"]'));
    expect(ancestors.map((cell) => cell.getAttribute("data-continues"))).toEqual(["true", "false"]);
    // Only the continuing level renders an actual line element.
    expect(ancestors[0].querySelectorAll("span")).toHaveLength(1);
    expect(ancestors[1].querySelectorAll("span")).toHaveLength(0);
    expect(root.querySelector('[data-partition-guide="branch"]')?.getAttribute("data-last")).toBe("false");
  });

  it("marks the last child so its branch line stops at the elbow", async () => {
    const root = await mount(row({ depth: 1, ancestorGuides: [false], isLastChild: true }));

    const branch = root.querySelector('[data-partition-guide="branch"]');
    expect(branch?.getAttribute("data-last")).toBe("true");
    // The vertical line is clipped to the elbow height rather than spanning the row.
    const vertical = branch?.querySelector("span");
    expect(vertical?.className).toContain("h-4");
  });
});
