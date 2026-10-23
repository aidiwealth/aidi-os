<script setup lang="ts">
// The company (or the whole group) a Sales, Marketing, Banking or Stage page is on, shown under its title when the
// company has subsidiaries. The same choice as Financials, kept in the address.
const { options, s, many, pages } = await useCoScope()
const mainName = computed(() => pages.value.find((p) => p.main)?.name ?? '')
const label = (v: string, l: string) => (v === 'group' ? (mainName.value ? mainName.value + ' group' : 'Group') + ' · all companies' : l)
</script>
<template>
  <label v-if="many" class="ss"><span>Showing</span>
    <select v-model="s" aria-label="Company"><option v-for="o in options" :key="o.value" :value="o.value">{{ label(o.value, o.label) }}</option></select>
  </label>
</template>
<style scoped>
.ss { display: inline-flex; align-items: center; gap: 8px; margin: 2px 0 6px; font-size: 13px; color: var(--c-muted); }
.ss select { font: inherit; font-size: 14px; font-weight: 600; color: var(--c-ink); padding: 5px 28px 5px 9px; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 0; min-width: 0; max-width: 100%; }
</style>
