<script setup lang="ts">
// Transactions: date, direction icon, description and reference, amount, running balance. Export downloads a CSV.
const props = withDefaults(defineProps<{ rows: { date: string; description: string; reference?: string | null; amount: number | string; balance?: number | string | null }[]; currency: string; title?: string; filename?: string }>(), { title: 'Transactions', filename: 'transactions' })
const day = (d: string) => { const [y, m, dd] = d.split('-'); return dd + '/' + m + '/' + y!.slice(2) }
function split(desc: string): [string, string] { const m = desc.match(/^(.*?)\s+([A-Z0-9][A-Z0-9-]{7,})$/); return m ? [m[1]!, m[2]!] : [desc, ''] }
function exportCsv() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const list = props.rows.filter((r) => r.date >= since)
  const esc = (s: string) => '"' + s.replaceAll('"', '""') + '"'
  const csv = ['Date,Description,Amount,Balance', ...(list.length ? list : props.rows).map((r) => [r.date, esc(r.description), Number(r.amount).toFixed(2), r.balance == null ? '' : Number(r.balance).toFixed(2)].join(','))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = props.filename + '.csv'; a.click(); URL.revokeObjectURL(a.href)
}
</script>
<template>
  <div class="tt">
    <div class="th"><h2>{{ title }}</h2><div class="tr"><slot name="tools" /><button v-if="rows.length" type="button" class="btn secondary ex" @click="exportCsv"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>Export last 30 days</button></div></div>
    <div class="box">
      <table v-if="rows.length"><thead><tr><th>Date</th><th>Description</th><th class="n">Amount</th><th class="n">Balance</th></tr></thead>
        <tbody><tr v-for="(r, i) in rows" :key="i">
          <td class="d">{{ day(r.date) }}</td>
          <td><div class="desc"><span class="ic" :class="Number(r.amount) < 0 ? 'out' : 'in'">{{ Number(r.amount) < 0 ? '↑' : '↓' }}</span><span class="dt">{{ r.reference !== undefined ? r.description : split(r.description)[0] }}</span><span class="ref">{{ r.reference ?? split(r.description)[1] }}</span></div></td>
          <td class="n amt" :class="{ pos: Number(r.amount) > 0 }"><Money :value="r.amount" :currency="currency" :sign="Number(r.amount) > 0 ? 'always' : 'auto'" /></td>
          <td class="n"><Money :value="r.balance" :currency="currency" muted /></td>
        </tr></tbody></table>
      <EmptyState v-else icon="wallet" title="No transactions yet"><slot name="empty" /></EmptyState>
    </div>
  </div>
</template>
<style scoped>
.th { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; } .th h2 { margin: 0; } .tr { display: flex; gap: 8px; align-items: center; }
.ex { display: inline-flex; align-items: center; gap: 8px; } .ex svg { width: 16px; height: 16px; }
.box { background: #fff; border: 1px solid var(--c-rule); max-height: 560px; overflow: auto; }
table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 13.5px; color: var(--c-muted); padding: 14px 18px; border-bottom: 1px solid var(--c-rule); position: sticky; top: 0; background: #fff; z-index: 1; }
td { padding: 14px 18px; border-bottom: 1px solid var(--c-rule); font-size: 14.5px; vertical-align: middle; } tbody tr:hover td { background: var(--c-paper-2); }
.d { color: var(--c-ink-soft); white-space: nowrap; } .n { text-align: right; white-space: nowrap; } .amt { font-weight: 500; } .amt.pos { color: var(--c-ok); }
.desc { display: flex; align-items: center; gap: 12px; min-width: 0; } .ic { width: 32px; height: 32px; flex: none; display: grid; place-items: center; background: var(--c-paper-2); color: var(--c-ink-soft); font-size: 15px; }
.ic.in { color: var(--c-ok); } .dt { color: var(--c-ink); overflow: hidden; text-overflow: ellipsis; } .ref { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: var(--c-muted); white-space: nowrap; }
.none { padding: 20px; color: var(--c-muted); margin: 0; }
@media (max-width: 700px) { .ref { display: none; } th, td { padding: 10px 12px; } }
</style>
