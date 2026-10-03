<script setup lang="ts">
useHead({ title: 'Bank & cash' })
interface Acct { id: string; entity_id: string; entity: string; bank_name: string; account_name: string; last4: string | null; currency: string; kind: string; active: boolean; balance: string | null; as_of: string | null; statements: number; continuous: boolean | null }
const { data, error, refresh } = await useFetch<Acct[]>('/api/banking/accounts')
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
const entity = ref('')
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
</script>

<template>
  <section>
    <p class="label">Family Office</p>
    <div class="head">
      <h1>Bank &amp; cash</h1>
      <div class="tools">
        <select v-model="entity" aria-label="Entity"><option value="">All entities</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select>
        <button class="btn" type="button" @click="adding = !adding">{{ adding ? 'Close' : 'Add account' }}</button>
      </div>
    </div>
    <p class="lead">Balances come only from imported statements that tie out: opening balance plus money in, minus money out, must equal the closing balance.</p>

    <form v-if="adding" class="card add" @submit.prevent="add">
      <label class="label">Entity<select v-model="form.entity_id" required><option value="" disabled>Choose</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      <label class="label">Bank<input v-model="form.bank_name" required maxlength="120" placeholder="e.g. Mercury, GTBank"></label>
      <label class="label">Account name<input v-model="form.account_name" required maxlength="160" placeholder="e.g. Operating"></label>
      <label class="label">Last 4 digits<input v-model="form.last4" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="1234"></label>
      <label class="label">Currency<select v-model="form.currency"><option v-for="c in ['USD', 'NGN', 'GBP', 'EUR', 'CAD', 'ZAR', 'KES', 'GHS']" :key="c" :value="c">{{ c }}</option></select></label>
      <label class="label">Type<select v-model="form.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
      <p class="hint">Only the last 4 digits of the account number are stored, never the full number.</p>
      <button class="btn" type="submit">Add account</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    </form>

    <div v-if="totals.length" class="kpis">
      <div v-for="[c, v] in totals" :key="c" class="kpi"><span class="label">Total {{ c }}</span><b>{{ money(v, c) }}</b><span class="sub">latest statement per account</span></div>
    </div>

    <p v-if="error" class="error" role="alert">{{ error.statusCode === 403 ? 'Bank & cash is limited to GPs and family.' : 'Could not load accounts.' }}</p>
    <p v-else-if="!rows.length" class="muted">No accounts yet. Add one, then import its statements.</p>
    <div v-for="[name, accts] in byEntity" :key="name" class="grp">
      <h2>{{ name }}</h2>
      <table class="table"><tbody>
        <tr v-for="a in accts" :key="a.id">
          <td><NuxtLink :to="'/banking/' + a.id" class="co">{{ a.bank_name }} · {{ a.account_name }}</NuxtLink><span class="sub">{{ KIND[a.kind] }}<template v-if="a.last4"> · ••{{ a.last4 }}</template> · {{ a.currency }}</span></td>
          <td class="num"><b>{{ money(a.balance, a.currency) }}</b><span class="sub">as of {{ day(a.as_of) }}</span></td>
          <td class="muted">{{ a.statements }} statement{{ a.statements === 1 ? '' : 's' }}<span v-if="a.continuous === false" class="sub amber">gap between statements</span></td>
        </tr>
      </tbody></table>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 8px; gap: 12px; flex-wrap: wrap; }
.tools { display: flex; gap: 10px; align-items: center; }
.lead { color: var(--c-muted); margin: 0 0 20px; max-width: 75ch; }
.add { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; align-items: end; margin-bottom: 20px; } .add label { display: flex; flex-direction: column; gap: 6px; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.hint { font-size: 12px; color: var(--c-muted); margin: 0; grid-column: 1 / -1; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-family: var(--font-heading); font-weight: 500; font-size: 28px; color: var(--c-navy); }
.grp { margin-bottom: 18px; } .grp h2 { font-family: var(--font-body); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; margin: 0 0 8px; }
.table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--c-rule); }
td { padding: 12px 16px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .num { text-align: right; } .num b { font-weight: 500; color: var(--c-navy); }
.co { color: var(--c-navy); font-weight: 500; text-decoration: none; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.amber { color: var(--c-warn) !important; } .muted { color: var(--c-muted); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .add { grid-template-columns: 1fr; } }
</style>
