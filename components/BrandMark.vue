<script setup lang="ts">
// The product mark for this address: Aidi | OS, or Finvry.
withDefaults(defineProps<{ light?: boolean }>(), { light: false })
const brand = useBrand()
</script>

<template>
  <span class="bm" :class="{ light }">
    <template v-if="brand.key === 'aidi'"><span class="aw" aria-label="Aidi"><AidiWordmark /></span></template>
    <span v-else class="fv" aria-label="Finvry">Finvry<i>.</i></span>
  </span>
</template>

<style scoped>
.bm { display: inline-flex; align-items: center; gap: 12px; color: var(--c-navy); }
.bm.light { color: #fff; }
.aw { display: flex; width: 58px; height: 23px; } .aw :deep(svg) { width: 100%; height: 100%; display: block; }
.div { width: 1px; height: 18px; background: currentColor; opacity: .3; }
.arm { font-family: var(--font-serif); font-style: italic; font-size: 1.2rem; }
.fv { font-family: var(--font-serif); font-weight: 500; font-size: 1.75rem; letter-spacing: -0.01em; line-height: 1; }
.fv i { font-style: normal; color: #5fa8d3; }
</style>
