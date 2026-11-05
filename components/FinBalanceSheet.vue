<script setup lang="ts">
// The balance sheet at the end of the period shown, classified the way QuickBooks and audited accounts are: current and
// non-current assets and liabilities, and equity, with the company's own categories under each (shared/bs-classify.ts).
// SAFE and convertible notes sit where the company chose (What investors see); the saved figures are not changed.
import { classifiedRows, classifyBalance, safeNote, type SafeTreatment } from '~/shared/bs-classify'
interface Row { period_end: string; currency: string; lines: Record<string, number | null>; detail?: Record<string, number> | null }
// The latest period with balance sheet figures, and the one before it (P&L-only months are skipped).
const props = defineProps<{ rows: Row[]; months?: Row[]; safe: SafeTreatment; label: (d: string) => string }>()
const BS = ['cash', 'investments', 'receivables', 'long_term_investments', 'other_assets', 'total_assets', 'payables', 'debt', 'other_liabilities', 'total_liabilities', 'equity']
const has = (r: Row | null | undefined) => !!r && BS.some((k) => typeof r.lines[k] === 'number')
// A quarter or year added up from months has no categories of its own: use the month it ends in.
const det = (r: Row) => (r.detail && Object.keys(r.detail).length ? r.detail : props.months?.find((m) => m.period_end === r.period_end)?.detail ?? null)
const cls = (r: Row) => classifyBalance(r.lines, det(r), { safe: props.safe })
const withBs = computed(() => props.rows.filter((r) => has(r)))
const at = computed(() => withBs.value[withBs.value.length - 1] ?? null), before = computed(() => withBs.value[withBs.value.length - 2] ?? null)
const A = computed(() => (at.value ? cls(at.value) : null))
const B = computed(() => (before.value ? cls(before.value) : null))
const t = computed(() => (A.value ? classifiedRows(B.value ? [A.value, B.value] : [A.value]) : null))
const sym = computed(() => ({ USD: '$', NGN: '₦', GBP: '£', EUR: '€', KES: 'KSh ', GHS: 'GH₵', ZAR: 'R' } as Record<string, string>)[at.value?.currency ?? 'USD'] ?? (at.value?.currency ?? '') + ' ')
const cur = computed(() => at.value?.currency ?? 'USD')
const full = (v: number | null | undefined) => (v == null ? '—' : (v < 0 ? '(' : '') + Math.round(Math.abs(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''))
const fmt = (v: number | null | undefined, ratio: boolean) => (v == null ? '—' : ratio ? v.toFixed(2) + 'x' : full(v))
const chg = (r: { values: (number | null)[]; key?: string }) => { const a = r.values[0], b = r.values[1]; if (a == null || b == null) return '—'; const d = a - b; return r.key === 'current_ratio' ? (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2) : Math.abs(d) < 0.5 ? '0' : full(d) }
const note = computed(() => (t.value ? safeNote(t.value.moved, props.safe, (v) => briefMoney(v, cur.value)) : null))
const tiles = computed(() => { const c = A.value; if (!c) return []; return [
  { l: 'Working capital', v: c.workingCapital == null ? '—' : briefMoney(c.workingCapital, cur.value), s: 'Current assets less current liabilities', neg: (c.workingCapital ?? 0) < 0 },
  { l: 'Current ratio', v: c.currentRatio == null ? '—' : c.currentRatio.toFixed(2) + 'x', s: 'Current assets for each 1 of current liabilities', neg: c.currentRatio != null && c.currentRatio < 1 },
  { l: 'Total assets', v: briefMoney(c.totals.ta, cur.value), s: 'Current and non-current', neg: false },
  { l: "Shareholders' equity", v: briefMoney(c.totals.eq, cur.value), s: 'Assets less liabilities', neg: c.totals.eq < 0 }] })
</script>

<template>
  <div v-if="t && t.rows.length && at" class="card bsc">
    <div class="ch"><div><h3>Balance sheet</h3><p class="mut">At {{ label(at.period_end) }}, in {{ at.currency }}. Current items are due or usable within a year.</p></div></div>
    <div class="kp"><div v-for="x in tiles" :key="x.l"><span>{{ x.l }}</span><b :class="{ neg: x.neg }">{{ x.v }}</b><em>{{ x.s }}</em></div></div>
    <p v-if="note" class="nt">* {{ note }}</p>
    <div class="tw"><table class="t" data-nosearch>
      <thead><tr><th>{{ sym.trim() }}</th><th class="r">{{ label(at.period_end) }}</th><template v-if="B && before"><th class="r">{{ label(before.period_end) }}</th><th class="r">Change</th></template></tr></thead>
      <tbody><tr v-for="(r, i) in t.rows" :key="i" :class="r.kind">
        <template v-if="r.kind === 'head'"><td :colspan="B ? 4 : 2">{{ r.label }}</td></template>
        <template v-else><td>{{ r.label }}{{ r.moved ? ' *' : '' }}</td><td class="r" :class="{ neg: (r.values[0] ?? 0) < 0 }">{{ fmt(r.values[0], r.key === 'current_ratio') }}</td>
          <template v-if="B"><td class="r" :class="{ neg: (r.values[1] ?? 0) < 0 }">{{ fmt(r.values[1], r.key === 'current_ratio') }}</td><td class="r ch2">{{ chg(r) }}</td></template></template>
      </tr></tbody></table></div>
  </div>
</template>

<style scoped>
.bsc { display: flex; flex-direction: column; gap: 14px; margin: 14px 0 0; } .ch h3 { margin: 0 0 2px; } .mut { margin: 0; font-size: 13.5px; color: var(--c-muted); }
.kp { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--c-rule); } .kp > div { padding: 10px 14px; border-right: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 2px; } .kp > div:last-child { border-right: 0; }
.kp span { font-size: 12.5px; font-weight: 500; color: var(--c-muted); } .kp b { font-family: var(--font-heading); font-size: 22px; font-weight: 500; color: var(--c-navy); } .kp b.neg { color: #9b3b32; } .kp em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.nt { margin: 0; font-size: 13px; color: var(--c-ink-soft); line-height: 1.5; }
.tw { overflow-x: auto; } .t { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; }
.t th { text-align: left; font-weight: 500; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule-strong); } .t td { padding: 6px 10px; border-bottom: 1px solid var(--c-rule); }
.r { text-align: right; white-space: nowrap; } .neg { color: #9b3b32; } .ch2 { color: var(--c-ink-soft); }
.head td { padding: 12px 10px 6px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); border-bottom: 1px solid var(--c-rule-strong); }
.item td:first-child { padding-left: 22px; } .total td { font-weight: 500; } .grand td { font-weight: 600; color: var(--c-navy); background: #f5f7fb; } .ratio td { color: var(--c-ink-soft); }
@media (max-width: 900px) { .kp { grid-template-columns: repeat(2, minmax(0, 1fr)); } .kp > div:nth-child(2n) { border-right: 0; } }
</style>
