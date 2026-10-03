<script setup lang="ts">
const id = useRoute().params.id as string
interface Acct { id: string; entity: string; bank_name: string; account_name: string; last4: string | null; currency: string; kind: string }
interface St { id: string; period_start: string; period_end: string; opening: string; closing: string; credits: string; debits: string; txn_count: number; continuity_ok: boolean | null; source: string; by_name: string | null; document_id: string | null }
interface Tx { date: string; description: string; amount: string; balance: string | null }
const { data, error, refresh } = await useFetch<{ account: Acct; statements: St[]; transactions: Tx[] }>('/api/banking/accounts/' + id)
useHead({ title: () => (data.value ? data.value.account.bank_name + ' ' + data.value.account.account_name : 'Account') })
const cur = computed(() => data.value?.account.currency ?? 'USD')
const money = (v: number | string | null) => v === null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur.value, maximumFractionDigits: 2 }).format(Number(v))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const series = computed(() => [...(data.value?.statements ?? [])].reverse().map((s) => ({ label: new Date(s.period_end + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: Number(s.closing) })))
const q = ref('')
const txs = computed(() => (data.value?.transactions ?? []).filter((t) => !q.value || t.description.toLowerCase().includes(q.value.toLowerCase())))

// Upload → preview → confirm
interface Preview { importId: string; source: string; period_start: string | null; period_end: string | null; opening: number | null; closing: number | null; txns: { date: string; description: string; amount: number; balance: number | null }[]; notes: string; previous: { closing: string; period_end: string } | null }
const preview = ref<Preview | null>(null)
const conf = reactive({ period_start: '', period_end: '', opening: '', closing: '' })
const state = reactive({ busy: false, msg: '', ok: '' })
const fileEl = ref<HTMLInputElement | null>(null)
const over = ref(false)
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function upload(f: File | undefined) {
  if (!f) return
  state.busy = true; state.msg = ''; state.ok = ''; preview.value = null
  const fd = new FormData(); fd.append('file', f)
  try {
    const p = await $fetch<Preview>('/api/banking/accounts/' + id + '/import', { method: 'POST', body: fd })
    preview.value = p
    Object.assign(conf, { period_start: p.period_start ?? '', period_end: p.period_end ?? '', opening: p.opening === null ? (p.previous?.closing ?? '') : String(p.opening), closing: p.closing === null ? '' : String(p.closing) })
  } catch (e) { state.msg = errText(e) } finally { state.busy = false; if (fileEl.value) fileEl.value.value = '' }
}
const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/[^0-9.\-]/g, '')))
const tie = computed(() => {
  if (!preview.value) return null
  const credits = preview.value.txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const debits = -preview.value.txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  const o = num(conf.opening), c = num(conf.closing)
  const expected = o + credits - debits
  return { credits, debits, expected, diff: Math.round((c - expected) * 100) / 100, ok: !isNaN(o) && !isNaN(c) && Math.abs(c - expected) < 0.005 }
})
async function confirm() {
  if (!preview.value) return
  state.busy = true; state.msg = ''; state.ok = ''
  try {
    const r = await $fetch<{ continuity: boolean | null }>('/api/banking/imports/' + preview.value.importId + '/confirm', { method: 'POST', body: { period_start: conf.period_start, period_end: conf.period_end, opening: num(conf.opening), closing: num(conf.closing) } })
    state.ok = 'Statement saved.' + (r.continuity === false ? " Note: its opening balance doesn't match the previous statement's closing balance, so a statement may be missing." : '')
    preview.value = null; await refresh()
  } catch (e) { state.msg = errText(e) } finally { state.busy = false }
}
async function openDoc(docId: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + docId + '/download'); window.location.href = r.url } catch (e) { state.msg = errText(e) } }
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/banking" class="back">← Bank &amp; cash</NuxtLink>
    <p class="label">{{ data.account.entity }} · {{ data.account.currency }}<template v-if="data.account.last4"> · ••{{ data.account.last4 }}</template></p>
    <h1>{{ data.account.bank_name }} · {{ data.account.account_name }}</h1>

    <div class="top">
      <div class="card bal"><span class="label">Balance</span><b>{{ data.statements[0] ? money(data.statements[0].closing) : '—' }}</b><span class="sub">{{ data.statements[0] ? 'per statement ending ' + day(data.statements[0].period_end) : 'Import a statement to see the balance' }}</span></div>
      <TrendChart title="Closing balance" sub="By statement" :points="series" :foot="data.statements.length + ' statements'" />
    </div>

    <div class="card">
      <h2>Import a statement</h2>
      <div class="drop" :class="{ over }" role="button" tabindex="0" aria-label="Upload a statement"
        @click="fileEl?.click()" @keydown.enter.prevent="fileEl?.click()" @keydown.space.prevent="fileEl?.click()"
        @dragenter.prevent="over = true" @dragover.prevent="over = true" @dragleave.prevent="over = false" @drop.prevent="over = false; upload($event.dataTransfer?.files?.[0])">
        <input ref="fileEl" type="file" class="sr-only" tabindex="-1" accept=".csv,.pdf" @change="upload(($event.target as HTMLInputElement).files?.[0])">
        <p><b>{{ state.busy ? 'Reading…' : 'Drop a statement here' }}</b> or click to choose · CSV export (best) or PDF</p>
      </div>
      <p v-if="state.msg" class="error" role="alert">{{ state.msg }}</p><p v-if="state.ok" class="ok" role="status">{{ state.ok }}</p>

      <div v-if="preview" class="pv">
        <p class="muted small">Read {{ preview.txns.length }} transactions from the {{ preview.source.toUpperCase() }}. {{ preview.notes }}</p>
        <div class="grid4">
          <label class="label">From<input v-model="conf.period_start" type="date" required></label>
          <label class="label">To<input v-model="conf.period_end" type="date" required></label>
          <label class="label">Opening balance<input v-model="conf.opening" inputmode="decimal"></label>
          <label class="label">Closing balance<input v-model="conf.closing" inputmode="decimal"></label>
        </div>
        <p v-if="preview.previous" class="muted small">Previous statement closed at {{ money(preview.previous.closing) }} on {{ day(preview.previous.period_end) }}.</p>
        <div v-if="tie" class="tie" :data-ok="tie.ok">
          <span>Opening {{ money(num(conf.opening) || 0) }} + in {{ money(tie.credits) }} − out {{ money(tie.debits) }} = <b>{{ money(tie.expected) }}</b></span>
          <span v-if="tie.ok">✓ Ties out to the closing balance</span>
          <span v-else>✗ Closing balance differs by {{ money(tie.diff) }}. Check the balances or the file; it can't be saved until it ties out.</span>
        </div>
        <div class="scroll"><table class="table sm"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead>
          <tbody><tr v-for="(t, i) in preview.txns.slice(0, 200)" :key="i"><td>{{ t.date }}</td><td>{{ t.description }}</td><td class="num" :class="{ neg: t.amount < 0 }">{{ money(t.amount) }}</td><td class="num muted">{{ t.balance === null ? '' : money(t.balance) }}</td></tr></tbody></table></div>
        <p v-if="preview.txns.length > 200" class="muted small">Showing the first 200 of {{ preview.txns.length }}.</p>
        <div class="row"><button class="btn" type="button" :disabled="state.busy || !tie?.ok" @click="confirm">Save statement</button><button class="btn secondary" type="button" @click="preview = null">Discard</button></div>
      </div>
    </div>

    <div class="card">
      <h2>Statements</h2>
      <table v-if="data.statements.length" class="table"><thead><tr><th>Period</th><th class="num">Opening</th><th class="num">In</th><th class="num">Out</th><th class="num">Closing</th><th /></tr></thead>
        <tbody><tr v-for="s in data.statements" :key="s.id">
          <td>{{ day(s.period_start) }} – {{ day(s.period_end) }}<span class="sub">{{ s.txn_count }} transactions · {{ s.source.toUpperCase() }}<template v-if="s.by_name"> · {{ s.by_name }}</template><template v-if="s.continuity_ok === false"> · <b class="amber">gap before this</b></template></span></td>
          <td class="num">{{ money(s.opening) }}</td><td class="num">{{ money(s.credits) }}</td><td class="num">{{ money(s.debits) }}</td><td class="num"><b>{{ money(s.closing) }}</b></td>
          <td><span class="okmark">✓ tied</span><button v-if="s.document_id" type="button" class="link" @click="openDoc(s.document_id)">File</button></td>
        </tr></tbody></table>
      <p v-else class="muted">No statements yet.</p>
    </div>

    <div class="card">
      <div class="row"><h2>Transactions</h2><input v-model="q" placeholder="Search descriptions" aria-label="Search transactions" class="search"></div>
      <div class="scroll"><table v-if="txs.length" class="table sm"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead>
        <tbody><tr v-for="(t, i) in txs" :key="i"><td>{{ day(t.date) }}</td><td>{{ t.description }}</td><td class="num" :class="{ neg: Number(t.amount) < 0 }">{{ money(t.amount) }}</td><td class="num muted">{{ t.balance === null ? '' : money(t.balance) }}</td></tr></tbody></table></div>
      <p v-if="!txs.length" class="muted">{{ q ? 'No matches.' : 'No transactions yet.' }}</p>
    </div>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Account not found.' : 'Could not load this account.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
h1 { margin-bottom: 18px; } h2 { margin-bottom: 12px; }
.top { display: grid; grid-template-columns: 1fr 2fr; gap: 16px; margin-bottom: 16px; }
.bal { display: flex; flex-direction: column; gap: 6px; justify-content: center; } .bal b { font-family: var(--font-heading); font-weight: 500; font-size: 34px; color: var(--c-navy); }
.card { margin-bottom: 16px; }
.drop { border: 1px dashed var(--c-rule-strong); background: var(--c-paper); padding: 20px; text-align: center; cursor: pointer; } .drop p { margin: 0; font-size: 13px; color: var(--c-muted); } .drop b { color: var(--c-navy); }
.drop:hover, .drop.over { background: #eef4f9; border-color: var(--c-blue); } .drop:focus-visible { outline: 2px solid var(--c-blue); outline-offset: 2px; }
.pv { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; } .grid4 label { display: flex; flex-direction: column; gap: 6px; }
input { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.tie { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-left: 4px solid var(--c-danger); background: #fdf1f0; font-size: 14px; }
.tie[data-ok="true"] { border-left-color: var(--c-ok); background: #f2faf5; } .tie span:last-child { font-weight: 500; }
.scroll { overflow-x: auto; max-height: 420px; overflow-y: auto; }
.table { width: 100%; border-collapse: collapse; } .table.sm td, .table.sm th { padding: 7px 10px; font-size: 13px; }
th { text-align: left; font-size: var(--type-label); letter-spacing: .12em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); position: sticky; top: 0; background: #fff; }
td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .num { text-align: right; white-space: nowrap; } .neg { color: var(--c-danger); }
.sub { display: block; font-size: 12px; color: var(--c-muted); } .okmark { color: var(--c-ok); font-size: 12px; margin-right: 8px; } .amber { color: var(--c-warn); }
.row { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .search { max-width: 280px; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.muted { color: var(--c-muted); } .small { font-size: 12.5px; margin: 0; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1000px) { .top { grid-template-columns: 1fr; } .grid4 { grid-template-columns: 1fr 1fr; } }
</style>
