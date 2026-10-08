<script setup lang="ts">
// The product mark for this address: Aidi | OS, or Finvry.
withDefaults(defineProps<{ light?: boolean }>(), { light: false })
const brand = useBrand()
</script>

<template>
  <span class="bm" :class="{ light }">
    <template v-if="brand.key === 'aidi'"><span class="aw" aria-label="Aidi"><AidiWordmark /></span></template>
    <img v-else class="fvimg" :src="light ? '/brand/finvry-logo-light.svg' : '/brand/finvry-logo.svg'" alt="Finvry">
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
.fvimg { height: 26px; width: auto; display: block; }
</style>
