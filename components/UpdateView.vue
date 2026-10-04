<script setup lang="ts">
// An investor update as readers see it: title, the period's key figures, then the letter.
const props = defineProps<{ title: string; label: string; body: string; company: string; currency: string; current: Record<string, number | null> | null; previous: Record<string, number | null> | null }>()
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const money = (v: number | null | undefined) => v == null ? '—' : (SYM[props.currency] ?? props.currency + ' ') + Math.round(v).toLocaleString('en-US')
const chg = (k: string) => { const a = props.current?.[k], b = props.previous?.[k]; return a == null || b == null || b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 1000) / 10 }
const KPIS = [['revenue', 'Revenue'], ['gross_margin', 'Gross margin'], ['net_income', 'Net income'], ['cash', 'Cash']] as const
const html = computed(() => renderMarkdown(props.body))
</script>
<template>
  <article class="uv">
    <p class="label">{{ company }} · {{ label }}</p><h1>{{ title }}</h1>
    <div v-if="current" class="ks"><div v-for="[k, l] in KPIS" :key="k" class="k"><span>{{ l }}</span><b>{{ k === 'gross_margin' ? (current[k] == null ? '—' : current[k] + '%') : money(current[k]) }}</b><em v-if="chg(k) != null" :class="{ up: chg(k)! > 0, dn: chg(k)! < 0 }">{{ chg(k)! > 0 ? '+' : '' }}{{ chg(k) }}%</em></div></div>
    <div class="md" v-html="html" />
  </article>
</template>
<style scoped>
.uv h1 { margin: 4px 0 18px; } .ks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; } .k { background: var(--c-paper-2); padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; }
.k span { font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 20px; font-weight: 600; } .k em { font-style: normal; font-size: 12px; color: var(--c-muted); } .k em.up { color: var(--c-ok); } .k em.dn { color: var(--c-danger); }
.md { font-size: 15.5px; line-height: 1.7; color: var(--c-ink); max-width: 720px; } .md :deep(h3) { font-family: var(--font-heading); font-weight: 500; font-size: 22px; color: var(--c-navy); margin: 22px 0 6px; } .md :deep(p) { margin: 0 0 12px; } .md :deep(ul) { margin: 0 0 12px; padding-left: 20px; } .md :deep(li) { margin-bottom: 4px; }
@media (max-width: 700px) { .ks { grid-template-columns: 1fr 1fr; } }
</style>
