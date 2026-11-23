<script setup lang="ts">
// The financial statements on a board (when the board shows them): for the group, the consolidation schedule (each
// company, eliminations and the group) for a chosen month; then the profit and loss by month and the balance sheet,
// as on Financials.
import { deriveLines } from '~/shared/fin-view'
// On a shared board link, src is that link's statements (read-only, no link into the app).
const props = defineProps<{ subject: string; currency: string; src?: string }>()
interface St { id: string | null; period_end: string; period_type: string; currency: string; lines: Record<string, number>; kpis: Record<string, number>; detail?: Record<string, number>; derived: Record<string, number | null>; parts?: unknown[] }
const { data } = useFetch<{ name: string; statements: St[]; safe_treatment?: 'equity' | 'liability' | null }>(props.src ?? '/api/financials', { query: computed(() => ({ subject: props.subject, period_type: 'month', currency: props.currency })), watch: [() => props.subject, () => props.currency], server: false })
const rows = computed(() => (data.value?.statements ?? []).filter((r) => r.period_end <= new Date().toISOString().slice(0, 10) && Object.keys(r.lines).length))
const last = computed(() => [...rows.value].reverse().slice(0, 12))
const lbl = (d: string) => new Date(d.slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pct = (v: number | null | undefined) => (v == null ? '—' : (Math.round(v * 10) / 10) + '%')
const der = (r: St) => r.derived ?? deriveLines(r.lines, 1)
</script>
<template>
  <div v-if="rows.length" class="bs">
    <div class="bsh"><h2>Financial statements</h2><NuxtLink v-if="!src" :to="{ path: '/financials', query: { s: subject } }" class="lk2">Open Financials</NuxtLink></div>
    <ClientOnly><FinConsolidation v-if="rows.some((r) => r.parts?.length)" :rows="rows as any" :currency="currency" :name="data?.name ?? ''" :can-edit="false" :safe="data?.safe_treatment ?? null" /></ClientOnly>
    <div class="card pad0"><table class="t"><thead><tr><th>Period</th><th class="n">Revenue</th><th class="n">Gross margin</th><th class="n">EBITDA</th><th class="n">Net income</th><th class="n">Cash</th></tr></thead>
      <tbody><tr v-for="r in last" :key="r.period_end"><td>{{ lbl(r.period_end) }}</td><td class="n"><Money :value="der(r).revenue" :currency="r.currency" /></td><td class="n">{{ pct(der(r).gross_margin) }}</td>
        <td class="n"><Money :value="der(r).ebitda" :currency="r.currency" /></td><td class="n"><Money :value="der(r).net_income" :currency="r.currency" /></td><td class="n"><Money :value="der(r).cash" :currency="r.currency" /></td></tr></tbody></table></div>
    <FinBalanceSheet :rows="rows as any" :months="rows as any" :safe="data?.safe_treatment ?? null" :label="lbl" />
  </div>
</template>
<style scoped>
.bs { margin-top: 22px; display: flex; flex-direction: column; gap: 14px; } .bsh { display: flex; justify-content: space-between; align-items: baseline; } .bsh h2 { margin: 0; }
.lk2 { font-size: 13px; color: var(--c-blue); text-decoration: none; } .pad0 { padding: 0; overflow-x: auto; }
.t { width: 100%; border-collapse: collapse; font-size: 13px; } .t th { text-align: left; font-weight: 500; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; }
.t td { padding: 10px 14px; border-bottom: 1px solid var(--c-rule); } .t .n { text-align: right; } .t tr:last-child td { border-bottom: 0; }
</style>
