<script setup lang="ts">
// Aidi OS Banking, Overview: each bank account (balances from tied-out statements), the largest as cards, every one in
// a table, adding an account and live US bank connections. The company is chosen at the top of the page.
const props = defineProps<{ entity: string }>()
interface Acct { id: string; entity_id: string; entity: string; bank_name: string; account_name: string; last4: string | null; currency: string; kind: string; active: boolean; balance: string | null; as_of: string | null; statements: number; continuous: boolean | null }
// Fetched together, not one after another (each wait is a round trip to the server).
const [__p546_0, __p546_1, __p546_2] = await Promise.all([
  useFetch<Acct[]>('/api/banking/accounts', { key: 'aidi-accounts' }),
  useFetch<{ id: string; name: string }[]>('/api/entities', { key: 'aidi-entities' }),
  useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })])
const { data, error, refresh } = __p546_0
const { data: entities } = __p546_1
const { data: meBk } = __p546_2
const canManage = computed(() => (meBk.value?.roles ?? []).some((r) => r === 'admin' || r === 'gp'))
const entity = computed(() => props.entity)
const rows = computed(() => (data.value ?? []).filter((a) => a.active && (!entity.value || a.entity_id === entity.value)))
const byEntity = computed(() => {
  const m = new Map<string, Acct[]>()
  for (const a of rows.value) m.set(a.entity, [...(m.get(a.entity) ?? []), a])
  return [...m.entries()]
})
const totals = computed(() => {
  const t: Record<string, number> = {}
  for (const a of rows.value) if (a.balance !== null) t[a.currency] = (t[a.currency] ?? 0) + Number(a.balance)
  return Object.entries(t)
})
const money = (v: number | string | null, c: string) => v === null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(Number(v))
const day = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'No statements yet')
const adding = ref(false)
const form = reactive({ entity_id: '', bank_name: '', account_name: '', last4: '', currency: 'USD', kind: 'current' })
const msg = ref('')
async function add() {
  msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/banking/accounts', { method: 'POST', body: { ...form } }); await navigateTo('/banking/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add the account.' }
}
const KIND: Record<string, string> = { current: 'Current', savings: 'Savings', money_market: 'Money market', brokerage: 'Brokerage', other: 'Other' }
const { data: fxr } = await useFetch<{ rates: Record<string, number> }>('/api/fx', { key: 'fx' })
const fxUsd = computed(() => { const r = fxr.value?.rates; if (!r) return null; let s = 0; for (const [c, v] of totals.value) { if (!r[c]) return null; s += v / r[c] } return s })
// In US dollars at today's rate (for the total, where the cash sits and the order of the cards).
const usd = (v: number | string | null, c: string) => { const r = fxr.value?.rates; if (v === null) return 0; if (c === 'USD') return Number(v); return r?.[c] ? Number(v) / r[c] : 0 }
const total = computed(() => (totals.value.length === 1 ? { v: totals.value[0]![1], c: totals.value[0]![0], approx: false } : fxUsd.value !== null ? { v: fxUsd.value, c: 'USD', approx: true } : null))
const asOf = computed(() => rows.value.map((a) => a.as_of).filter((x): x is string => !!x).sort().pop() ?? null)
const PAL = ['#0c1a2e', '#2f6494', '#5fa8d3', '#9fb3c8', '#1c3d63']
const parts = computed(() => { const m = new Map<string, number>(); for (const a of rows.value) m.set(a.entity, (m.get(a.entity) ?? 0) + usd(a.balance, a.currency)); const s = [...m].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]); const top = s.length > 4 ? [...s.slice(0, 3), [s.length - 3 + ' more', s.slice(3).reduce((t, x) => t + x[1], 0)] as [string, number]] : s; const t = top.reduce((x, y) => x + y[1], 0) || 1; return top.map(([label, v], i) => ({ label, v, pct: v / t * 100, color: PAL[i % PAL.length]! })) })
const gaps = computed(() => rows.value.filter((a) => a.continuous === false).length)
const noStmt = computed(() => rows.value.filter((a) => !a.as_of).length)
const cards = computed(() => [...rows.value].sort((a, b) => usd(b.balance, b.currency) - usd(a.balance, a.currency)).slice(0, 4))
const cur = ref('')
const listed = computed(() => rows.value.filter((a) => !cur.value || a.currency === cur.value).sort((a, b) => a.entity.localeCompare(b.entity) || usd(b.balance, b.currency) - usd(a.balance, a.currency)))
const fmtUsd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: v >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: v >= 1e5 ? 1 : 0 }).format(v)
const big = (v: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, notation: v >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: v >= 1e6 ? 2 : 0 }).format(v)
</script>

<template>
  <div class="aa">
    <AppModal :open="adding" title="Add a bank account" @close="adding = false"><form class="mfrm" @submit.prevent="add">
      <label class="label">Entity<select v-model="form.entity_id" required><option value="" disabled>Choose</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      <label class="label">Bank<input v-model="form.bank_name" required maxlength="120" placeholder="e.g. Chase, GTBank"></label>
      <label class="label">Account name<input v-model="form.account_name" required maxlength="160" placeholder="e.g. Operating"></label>
      <label class="label">Last 4 digits<input v-model="form.last4" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="1234"></label>
      <label class="label">Currency<select v-model="form.currency"><option v-for="c in ['USD', 'NGN', 'GBP', 'EUR', 'CAD', 'ZAR', 'KES', 'GHS']" :key="c" :value="c">{{ c }}</option></select></label>
      <label class="label">Type<select v-model="form.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
      <p class="hint">Only the last 4 digits are stored.</p>
      <button class="btn" type="submit">Add account</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    </form></AppModal>

    <p v-if="error" class="error" role="alert">{{ error.statusCode === 403 ? 'Bank & cash is limited to GPs and family.' : 'Could not load accounts.' }}</p>
    <EmptyState v-else-if="!rows.length" card icon="banking" title="No bank accounts yet" text="Add each account, then import its statements. A balance counts once its statement ties out."><button v-if="canManage" class="btn" @click="adding = true">Add account</button></EmptyState>
    <template v-else>
      <div class="acs">
        <NuxtLink v-for="a in cards" :key="a.id" :to="'/banking/' + a.id" class="ac"><span class="n">{{ a.bank_name }}</span><span class="s">{{ a.entity }}{{ a.last4 ? ' · ··' + a.last4 : '' }}</span><span class="v"><Money :value="a.balance" :currency="a.currency" /></span><span class="f"><span>{{ a.as_of ? day(a.as_of) : 'No statement' }}</span><span>{{ a.statements }} statement{{ a.statements === 1 ? '' : 's' }}</span></span></NuxtLink>
      </div>
      <div class="panel">
        <div class="ph"><div class="pt"><h3>Accounts</h3><span class="st"><i class="dot" :class="{ w: gaps || noStmt }" />{{ gaps ? gaps + ' with a gap between statements' : noStmt ? noStmt + ' with no statement yet' : 'All tie out' + (asOf ? ' to ' + day(asOf) : '') }}</span></div>
          <div class="pa"><div class="seg"><button type="button" :class="{ on: !cur }" @click="cur = ''">All<em>{{ rows.length }}</em></button><button v-for="[c] in totals" :key="c" type="button" :class="{ on: cur === c }" @click="cur = c">{{ c }}<em>{{ rows.filter((a) => a.currency === c).length }}</em></button></div>
            <button v-if="canManage" class="bt" type="button" @click="adding = true">+ Add account</button></div></div>
        <table data-nosearch><thead><tr><th>Account</th><th>Company</th><th>As of</th><th class="r">Balance</th><th class="r">Statements</th></tr></thead>
          <tbody><tr v-for="a in listed" :key="a.id"><td><NuxtLink :to="'/banking/' + a.id" class="co">{{ a.bank_name }} · {{ a.account_name }}</NuxtLink><span class="sub">{{ KIND[a.kind] }}<template v-if="a.last4"> · ··{{ a.last4 }}</template> · import statements</span></td>
            <td class="mut">{{ a.entity }}</td><td class="mut nw">{{ day(a.as_of) }}</td><td class="r num nw"><Money :value="a.balance" :currency="a.currency" /></td>
            <td class="r mut nw">{{ a.statements }}<span v-if="a.continuous === false" class="gap">gap</span></td></tr></tbody></table>
      </div>
    </template>
    <ClientOnly><BankFeeds class="feeds" /></ClientOnly>
  </div>
</template>

<style scoped>
.aa { display: flex; flex-direction: column; gap: 16px; }
.panel { background: #fff; border: 1px solid var(--c-rule); }
.acs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .ac { background: var(--c-navy); color: #fff; padding: 16px 16px 14px; min-height: 120px; display: flex; flex-direction: column; text-decoration: none; } .ac:hover { background: #13253f; }
.ac .n { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; } .ac .s { font-size: 12.5px; opacity: .65; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ac .v { margin-top: auto; font-size: 20px; font-weight: 500; font-variant-numeric: tabular-nums; } .ac .f { display: flex; justify-content: space-between; font-size: 11px; opacity: .6; margin-top: 4px; }
.ph { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 20px; flex-wrap: wrap; } .pt { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; } .ph h3 { margin: 0; font-size: 15px; font-weight: 600; } .st { font-size: 12.5px; color: var(--c-ink-soft); } .pa { display: flex; gap: 10px; align-items: center; }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #5fa8d3; margin-right: 6px; vertical-align: 1px; } .dot.w { background: #b4541a; }
.seg { display: inline-flex; gap: 4px; } .seg button { background: none; border: 0; padding: 5px 11px; font: inherit; font-size: 13px; color: var(--c-ink-soft); cursor: pointer; } .seg button.on { background: var(--c-paper-2); color: var(--c-ink); font-weight: 500; } .seg em { font-style: normal; color: var(--c-muted); margin-left: 5px; font-size: 12px; }
.bt { padding: 6px 12px; font: inherit; font-size: 13px; background: #fff; border: 1px solid var(--c-rule-strong); color: var(--c-ink); cursor: pointer; }
table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; font-weight: 500; font-size: 12.5px; color: var(--c-muted); padding: 10px 20px; border-top: 1px solid var(--c-rule); } td { padding: 12px 20px; border-top: 1px solid var(--c-rule); vertical-align: middle; }
.co { color: var(--c-ink); font-weight: 500; text-decoration: none; } .co:hover { color: var(--c-blue-deep); } .sub { display: block; font-size: 12.5px; color: var(--c-muted); }
.r { text-align: right; } .num { font-variant-numeric: tabular-nums; } .mut { color: var(--c-muted); } .nw { white-space: nowrap; } .gap { margin-left: 8px; font-size: 11.5px; color: #b4541a; } .error { color: var(--c-danger); }
.mfrm { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .mfrm label.label { display: flex; flex-direction: column; gap: 6px; } .mfrm .btn, .mfrm .hint, .mfrm .error { grid-column: 1 / -1; } .mfrm .btn { justify-self: start; } .hint { font-size: 12px; color: var(--c-muted); margin: 0; }
input, select { font: inherit; font-size: 14px; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
@media (max-width: 1000px) { .acs { grid-template-columns: 1fr 1fr; } }
@media (max-width: 640px) { .acs { grid-template-columns: 1fr; } th:nth-child(2), td:nth-child(2), th:nth-child(3), td:nth-child(3) { display: none; } }
</style>
