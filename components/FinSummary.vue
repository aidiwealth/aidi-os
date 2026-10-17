<script setup lang="ts">
// For investors (data room, investor page, updates): a short financial summary and where the figures come from, when
// the company has chosen to show them.
defineProps<{ fin: { summary: { period: string; latest: string | null; currency: string; items: { label: string; value: number | null; unit: 'money' | 'pct' | 'months'; note?: string }[] } | null; sources: { name: string; url: string; synced: string | null }[] } | null | undefined }>()
const fmt = (v: number | null, unit: string, c: string) => (v == null ? '—' : unit === 'pct' ? v.toFixed(1) + '%' : unit === 'months' ? (v >= 36 ? '36+ months' : v.toFixed(1) + ' months') : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, notation: Math.abs(v) >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(v) >= 1e6 ? 1 : 0 }).format(v))
const host = (u: string) => { try { const h = new URL(u).hostname.replace(/^www\./, ''); return /docs\.google/.test(h) ? 'Google Sheets' : /sharepoint|onedrive|live\.com/.test(h) ? 'Excel online' : /dropbox/.test(h) ? 'Dropbox' : h } catch { return 'Link' } }
</script>
<template>
  <section v-if="fin && (fin.summary || fin.sources.length)" class="fs">
    <div v-if="fin.summary" class="fsh"><h3>Financial summary</h3><span>{{ fin.summary.period }}</span></div>
    <div v-if="fin.summary" class="fsg"><div v-for="i in fin.summary.items" :key="i.label"><em>{{ i.label }}</em><b :class="{ neg: (i.value ?? 0) < 0 && i.unit === 'money' }">{{ fmt(i.value, i.unit, fin.summary.currency) }}</b><span v-if="i.note">{{ i.note }}</span></div></div>
    <p v-if="fin.sources.length" class="src">Figures come from <template v-for="(s, n) in fin.sources" :key="s.url"><a :href="s.url" target="_blank" rel="noopener nofollow">{{ s.name }}</a> ({{ host(s.url) }}{{ s.synced ? ', updated ' + s.synced : '' }}){{ n < fin.sources.length - 1 ? ', ' : '' }}</template>, shared by the company.</p>
  </section>
</template>
<style scoped>
.fs { background: #fff; border: 1px solid var(--c-rule); padding: 18px 20px; margin: 0 0 16px; } .fsh { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 12px; } .fsh h3 { margin: 0; font-size: 16px; } .fsh span { font-size: 12.5px; color: var(--c-muted); }
.fsg { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px 18px; } .fsg em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .fsg b { font-size: 19px; font-weight: 500; color: var(--c-navy); font-variant-numeric: tabular-nums; } .fsg b.neg { color: var(--c-danger); } .fsg span { display: block; font-size: 12px; color: var(--c-muted); }
.src { margin: 14px 0 0; padding-top: 12px; border-top: 1px solid var(--c-rule); font-size: 12.5px; color: var(--c-ink-soft); } .src a { color: var(--c-blue-deep); }
</style>
