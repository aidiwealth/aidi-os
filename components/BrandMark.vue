<script setup lang="ts">
// The product mark for this address: Aidi | OS, or Finvry.
withDefaults(defineProps<{ light?: boolean }>(), { light: false })
const brand = useBrand()
</script>

<template>
  <span class="bm" :class="{ light }">
    <template v-if="brand.key === 'aidi'"><span class="aw" aria-label="Aidi"><AidiWordmark /></span></template>
    <span v-else class="fv" aria-label="Finvry"><svg class="fsq" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" :fill="light ? '#fff' : '#0c1a2e'"/><path d="M20 14h26v7H28v8h15v7H28v14h-8z" :fill="light ? '#0c1a2e' : '#fff'"/><rect x="44" y="43" width="7" height="7" fill="#5fa8d3"/></svg>Finvry</span>
  </span>
</template>

<style scoped>
.bm { display: inline-flex; align-items: center; gap: 12px; color: var(--c-navy); }
.bm.light { color: #fff; }
.aw { display: flex; width: 58px; height: 23px; } .aw :deep(svg) { width: 100%; height: 100%; display: block; }
.div { width: 1px; height: 18px; background: currentColor; opacity: .3; }
.arm { font-family: var(--font-serif); font-style: italic; font-size: 1.2rem; }
.fv { display: inline-flex; align-items: center; gap: 9px; font-family: var(--font-heading); font-weight: 600; font-size: 1.3rem; letter-spacing: -0.02em; line-height: 1; } .fsq { width: 24px; height: 24px; flex: none; }
.fv i { font-style: normal; color: #5fa8d3; }
</style>
