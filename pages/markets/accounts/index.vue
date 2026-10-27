<script setup lang="ts">
// Brokerage accounts as cards: owner, broker, live value, cash, today's move, the mix against target, and what is
// waiting. Add or change an account here; open one to see its positions and ask for proposals.
import { usd, big, pct, signed } from '~/shared/market-format'
useHead({ title: 'Public markets · Accounts' })
interface Acct { id: string; name: string; broker: string; broker_name: string; broker_label: string | null; kind: string; owner_type: string; owner: string | null; entity_id: string | null; wm_client_id: string | null; execution: string; external_id: string | null; risk_level: string; model: Record<string, number>; cash: number; daily_limit: number; value: number; today_pct: number | null; positions: number; mix: Record<string, number>; waiting: number; tickets: number; fills: number }
const { data, refresh } = await useFetch<{ accounts: Acct[]; entities: { id: string; name: string }[]; clients: { id: string; name: string }[]; risk_levels: { code: string; label: string }[]; brokers: Record<string, string> }>('/api/markets/accounts')
let poll: ReturnType<typeof setInterval> | null = null
onMounted(() => { poll = setInterval(() => { if (!document.hidden) void refresh() }, 60_000) })
onBeforeUnmount(() => { if (poll) clearInterval(poll) })
const tot = computed(() => (data.value?.accounts ?? []).reduce((a, x) => ({ v: a.v + x.value, c: a.c + x.cash, w: a.w + x.waiting + x.tickets, f: a.f + x.fills }), { v: 0, c: 0, w: 0, f: 0 }))
const MIX: [string, string][] = [['stocks', 'Stocks'], ['etf', 'ETFs'], ['crypto', 'Crypto'], ['cash', 'Cash']]
const OWNER: Record<string, string> = { entity: 'Company', client: 'Wealth client', plan: 'Retirement plan' }
const err = (e: unknown) => (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not save.'
const blank = () => ({ id: '', name: '', broker: 'robinhood', broker_label: '', kind: 'taxable', owner_type: 'entity', entity_id: '', wm_client_id: '', execution: 'manual', external_id: '', risk_level: 'moderate', model: { stocks: 60, etf: 30, crypto: 0, cash: 10 }, daily_limit: 25000 })
const f = reactive({ open: false, busy: false, msg: '', d: blank() as ReturnType<typeof blank> })
function edit(a?: Acct) { Object.assign(f, { open: true, busy: false, msg: '', d: a ? { id: a.id, name: a.name, broker: a.broker, broker_label: a.broker_label ?? '', kind: a.kind, owner_type: a.owner_type, entity_id: a.entity_id ?? '', wm_client_id: a.wm_client_id ?? '', execution: a.execution, external_id: a.external_id ?? '', risk_level: a.risk_level, model: { stocks: 0, etf: 0, crypto: 0, cash: 0, ...a.model }, daily_limit: a.daily_limit } : blank() }) }
watch(() => f.d.owner_type, (t) => { if (t === 'plan') f.d.kind = 'retirement' })
const mixSum = computed(() => Object.values(f.d.model).reduce((a, x) => a + Number(x || 0), 0))
async function save() {
  f.busy = true; f.msg = ''
  const d = f.d
  try { await $fetch('/api/markets/accounts', { method: 'POST', body: { ...d, id: d.id || undefined, entity_id: d.entity_id || null, wm_client_id: d.wm_client_id || null, broker_label: d.broker_label || null, external_id: d.external_id || null, model: Object.fromEntries(Object.entries(d.model).map(([k, x]) => [k, Number(x)])), daily_limit: Number(d.daily_limit) } }); f.open = false; await refresh() }
  catch (e) { f.msg = err(e) } finally { f.busy = false }
}
</script>
<template>
  <section class="ac">
    <p class="label">Wealth management</p>
    <div class="head"><div><h1>Accounts</h1><p class="lead">Every brokerage account, who owns it and how its trades are placed.</p></div><button class="btn" @click="edit()">Add account</button></div>
    <MarketsNav :waiting="tot.w + tot.f" />
    <div v-if="data" class="fx-stats">
      <StatTile label="In brokerage accounts" :value="usd(tot.v)" icon="money" tone="n" :note="data.accounts.length + ' account' + (data.accounts.length === 1 ? '' : 's') + ' · live'" full />
      <StatTile label="Cash waiting to invest" :value="usd(tot.c)" icon="chart" tone="b" note="across all accounts" full />
      <StatTile label="Trades waiting" :value="tot.w" icon="flag" tone="a" note="proposals and tickets" to="/markets/trades" />
      <StatTile label="Fills to confirm" :value="tot.f" icon="check" tone="c" note="nothing posts until confirmed" to="/markets/trades?t=fills" />
    </div>
    <div v-if="data?.accounts.length" class="grid">
      <article v-for="a in data.accounts" :key="a.id" class="card acct">
        <div class="top"><div><NuxtLink :to="'/markets/accounts/' + a.id" class="nm">{{ a.name }}</NuxtLink><div class="mut sm">{{ a.broker_name }} · {{ OWNER[a.owner_type] }}{{ a.owner ? ': ' + a.owner : '' }}{{ a.kind === 'retirement' ? ' · retirement' : '' }}</div></div>
          <span class="pill" :class="{ blue: a.execution === 'alpaca' }">{{ a.execution === 'alpaca' ? 'Orders by API' : 'Manual tickets' }}</span></div>
        <div class="val"><b>{{ usd(a.value) }}</b><span v-if="a.today_pct != null" :class="a.today_pct >= 0 ? 'up' : 'dn'">{{ signed(a.today_pct, 2) }} today</span><span class="mut">· cash {{ usd(a.cash) }}</span></div>
        <div class="mix"><span class="mut sm">Mix against target <i class="tm" /> target</span>
          <div v-for="[k, l] in MIX" :key="k" class="mr"><span class="mut">{{ l }}</span><span class="bar"><i :style="{ width: Math.min(100, a.mix[k] ?? 0) + '%' }" /><u :style="{ left: Math.min(100, a.model[k] ?? 0) + '%' }" /></span><span class="r">{{ pct(a.mix[k] ?? 0, 0) }}</span></div></div>
        <div class="ft"><span class="mut sm">{{ a.positions }} position{{ a.positions === 1 ? '' : 's' }}<template v-if="a.waiting + a.tickets"> · {{ a.waiting + a.tickets }} trade{{ a.waiting + a.tickets === 1 ? '' : 's' }} waiting</template><template v-if="a.fills"> · {{ a.fills }} to confirm</template></span>
          <span><button class="lk" @click="edit(a)">Edit</button> · <NuxtLink :to="'/markets/accounts/' + a.id">Open →</NuxtLink></span></div>
      </article>
    </div>
    <EmptyState v-else-if="data" card icon="wallet" title="No accounts yet" text="Add the family office's Robinhood account, the Schwab 401(k) and the Alpaca account, then enter what each holds today."><button class="btn" @click="edit()">Add account</button></EmptyState>
    <p class="foot">Values update live from prices. Each position is also a line in Investments &amp; AUM, valued the same way.</p>

    <AppModal :open="f.open" wide :title="f.d.id ? 'Edit account' : 'Add account'" @close="f.open = false">
      <form id="acf" class="fm" @submit.prevent="save">
        <div class="g3"><label class="label">Name<input v-model="f.d.name" maxlength="120" placeholder="e.g. Aidi Family" required></label>
          <label class="label">Broker<select v-model="f.d.broker"><option v-for="(l, k) in data?.brokers" :key="k" :value="k">{{ l }}</option></select></label>
          <label v-if="f.d.broker === 'other'" class="label">Broker name<input v-model="f.d.broker_label" maxlength="80"></label>
          <label class="label">How trades are placed<select v-model="f.d.execution"><option value="manual">Manual tickets (you place them)</option><option value="alpaca" :disabled="f.d.broker !== 'alpaca'">Orders by API (Alpaca)</option></select></label></div>
        <div class="g3"><label class="label">Owner<select v-model="f.d.owner_type"><option value="entity">A company in the group</option><option value="plan">A retirement plan (e.g. Solo 401(k))</option><option value="client">A wealth client</option></select></label>
          <label v-if="f.d.owner_type === 'entity'" class="label">Company<select v-model="f.d.entity_id" required><option value="" disabled>Choose…</option><option v-for="e in data?.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
          <label v-if="f.d.owner_type === 'client'" class="label">Client<select v-model="f.d.wm_client_id" required><option value="" disabled>Choose…</option><option v-for="c in data?.clients" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
          <label class="label">Account type<select v-model="f.d.kind"><option value="taxable">Taxable</option><option value="retirement">Retirement</option></select></label></div>
        <p class="mut sm">{{ f.d.owner_type === 'entity' ? 'Confirmed fills post journals to this company.' : f.d.owner_type === 'plan' ? 'The plan holds its own assets: holdings and cash only, no journals.' : 'Tracked on the client; no trades are proposed until the compliance switches are on.' }}</p>
        <div class="g3"><label class="label">Risk level<select v-model="f.d.risk_level"><option v-for="r in data?.risk_levels" :key="r.code" :value="r.code">{{ r.label }}</option></select></label>
          <label class="label">Daily limit (USD)<input v-model.number="f.d.daily_limit" type="number" min="0" step="1000"></label>
          <label v-if="f.d.execution === 'alpaca'" class="label">Alpaca account ID<input v-model="f.d.external_id" maxlength="80"></label></div>
        <div><span class="label">Target mix ({{ mixSum }}% of 100%)</span><div class="g4"><label v-for="[k, l] in MIX" :key="k" class="label">{{ l }} %<input v-model.number="(f.d.model as any)[k]" type="number" min="0" max="100"></label></div></div>
        <p v-if="f.msg" class="error">{{ f.msg }}</p>
      </form>
      <template #foot><button type="button" class="btn secondary" @click="f.open = false">Cancel</button><button class="btn" type="submit" form="acf" :disabled="f.busy || mixSum !== 100">{{ f.busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.ac { display: flex; flex-direction: column; gap: 14px; } .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .head h1 { margin: 2px 0 4px; } .lead { margin: 0; color: var(--c-muted); font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.acct { padding: 0; display: flex; flex-direction: column; } .top { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; padding: 16px 18px 6px; } .nm { font-weight: 600; font-size: 16px; color: var(--c-ink); text-decoration: none; }
.pill { font-size: 12px; padding: 3px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); white-space: nowrap; } .pill.blue { background: #e6ecf2; color: var(--c-blue-deep); }
.val { padding: 4px 18px; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 13px; } .val b { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; margin-right: 4px; }
.mix { padding: 8px 18px 14px; display: flex; flex-direction: column; gap: 6px; } .mr { display: grid; grid-template-columns: 64px 1fr 40px; gap: 8px; align-items: center; font-size: 12.5px; }
.bar { position: relative; height: 8px; background: var(--c-paper-2); } .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c-blue-deep); } .bar u { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--c-ink); }
.tm { display: inline-block; width: 2px; height: 10px; background: var(--c-ink); vertical-align: -1px; margin-left: 4px; } .r { text-align: right; font-variant-numeric: tabular-nums; }
.ft { margin-top: auto; border-top: 1px solid var(--c-rule); padding: 10px 18px; display: flex; justify-content: space-between; gap: 8px; font-size: 13px; flex-wrap: wrap; } .ft a, .lk { color: var(--c-blue-deep); text-decoration: none; } .lk { background: none; border: 0; padding: 0; font: inherit; cursor: pointer; }
.up { color: var(--c-blue-deep); } .dn { color: var(--c-danger); } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; } .foot { font-size: 12px; color: var(--c-muted); margin: 0; }
.fm { display: flex; flex-direction: column; gap: 12px; } .fm .label { display: flex; flex-direction: column; gap: 4px; } .fm input, .fm select { font: inherit; font-size: 14px; height: 36px; border: 1px solid var(--c-rule-strong); padding: 0 8px; background: #fff; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .g4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 4px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 800px) { .g3, .g4 { grid-template-columns: 1fr 1fr; } }
</style>
