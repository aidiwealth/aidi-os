<script setup lang="ts">
// An investor update as readers see it: title, the period's key figures, then the letter.
const props = defineProps<{ html?: string; title: string; label: string; body: string; company: string; currency: string; current: Record<string, number | null> | null; previous: Record<string, number | null> | null }>()
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const money = (v: number | null | undefined) => v == null ? '—' : (SYM[props.currency] ?? props.currency + ' ') + Math.round(v).toLocaleString('en-US')
const chg = (k: string) => { const a = props.current?.[k], b = props.previous?.[k]; return a == null || b == null || b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 1000) / 10 }
const KI = { revenue: ['money', 'b'], gross_margin: ['chart', 'c'], net_income: ['chart', 'n'], cash: ['billing', 'g'] } as const
const KPIS = [['revenue', 'Revenue'], ['gross_margin', 'Gross margin'], ['net_income', 'Net income'], ['cash', 'Cash']] as const
const html = computed(() => renderMarkdown(props.body))
</script>
<template>
  <article v-if="html" class="uv"><p class="label">{{ company }} · {{ label }}</p><div class="ext" v-html="html" /></article>
  <article v-else class="uv">
    <p class="label">{{ company }} · {{ label }}</p><h1>{{ title }}</h1>
    <div v-if="current" class="fx-stats"><StatTile v-for="[k, l] in KPIS" :key="k" :label="l" :value="k === 'gross_margin' ? (current[k] == null ? '—' : current[k] + '%') : money(current[k])" :icon="KI[k][0]" :tone="KI[k][1]" :note="chg(k) != null ? (chg(k)! > 0 ? '+' : '') + chg(k) + '%' : undefined" :note-tone="chg(k) == null ? '' : chg(k)! > 0 ? 'up' : chg(k)! < 0 ? 'dn' : ''" /></div>
    <div class="md" v-html="html" />
  </article>
</template>
<style scoped>
.uv h1 { margin: 4px 0 18px; }
.md { font-size: 15.5px; line-height: 1.7; color: var(--c-ink); max-width: 720px; } .md :deep(h3) { font-family: var(--font-heading); font-weight: 500; font-size: 22px; color: var(--c-navy); margin: 22px 0 6px; } .md :deep(p) { margin: 0 0 12px; } .md :deep(ul) { margin: 0 0 12px; padding-left: 20px; } .md :deep(li) { margin-bottom: 4px; }
</style>
