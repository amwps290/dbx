<script setup lang="ts">
import type { PgPartitionTreeRow } from "@/lib/table/pgPartitionPresentation";

/**
 * Continuous tree guide lines for one partition row, drawn with CSS borders
 * instead of `├─`/`│` characters: the lines then span the full row height, so
 * they stay connected across rows and do not need re-drawing per line of text.
 * The parent row stretches this element, so place it in a `items-stretch` row.
 */
interface PartitionTreeGuidesProps {
  row: PgPartitionTreeRow;
}

const props = defineProps<PartitionTreeGuidesProps>();
</script>

<template>
  <span aria-hidden="true" class="flex shrink-0 items-stretch">
    <span v-for="(continues, level) in props.row.ancestorGuides" :key="level" data-partition-guide="ancestor" :data-continues="continues ? 'true' : 'false'" class="relative block w-4 shrink-0">
      <span v-if="continues" class="absolute inset-y-0 left-2 w-px bg-border" />
    </span>
    <span data-partition-guide="branch" :data-last="props.row.isLastChild ? 'true' : 'false'" class="relative block w-4 shrink-0">
      <span class="absolute left-2 top-0 w-px bg-border" :class="props.row.isLastChild ? 'h-4' : 'inset-y-0'" />
      <span class="absolute left-2 top-4 h-px w-2.5 bg-border" />
    </span>
  </span>
</template>
