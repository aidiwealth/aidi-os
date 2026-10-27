<script setup lang="ts">
// One brokerage account: live value and its last 30 days, positions with their weight against the single-company
// limit, gain and signal, cash, and the account's trades. Ask for proposals, record a trade placed at the broker, or
// set the opening holdings and cash.
import { usd, big, pct, signed, fixed, ptTime } from '~/shared/market-format'
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = await useFetch<any>(() => '/api/markets/accounts/' + id.value)
useHead({ title: () => 'Public markets · ' + (data.value?.account?.name ?? 'Account') })
let poll: ReturnType<typeof setInterval> | null = null
onMounted(() => { poll = setInterval(() => { if (!document.hidden) void refresh() }, 30_000) })
onBeforeUnmount(() => { if (poll) clearInterval(poll) })
const a = computed(() => data.value?.account ?? null)
const OWNER: Record<string, string> = { entity: 'Company', client: 'Wealth client', plan: 'Retirement plan' }
const STATUS: Record<string, string> = { waiting: 'Waiting for approval', ticket: 'Ticket to place', filled: 'Filled', rejected: 'Rejected', expired: 'Expired', cancelled: 'Cancelled', approved: 'Approved', pending: 'To confirm', confirmed: 'Confirmed' }
const err = (e: unknown) => (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not save.'
const gain = computed(() => (data.value?.positions ?? []).reduce((s: number, p: any) => s + (p.value - p.cost), 0))
const weights = computed(() => (data.value?.positions ?? []).map((p: any) => ({ label: p.symbol, value: Math.round(p.weight * 10) / 10, note: p.kind === 'stock' ? (p.signal_label ?? 'no value yet') : p.kind === 'etf' ? 'ETF' : 'crypto' })).sort((x: any, y: any) => y.value - x.value))
const msg = ref(''), okm = ref('')
async function propose() { msg.value = ''; okm.value = ''; try { const r = await $fetch<{ created: number }>('/api/markets/accounts/' + id.value + '/propose', { method: 'POST' }); okm.value = r.created ? r.created + ' trade' + (r.created === 1 ? '' : 's') + ' proposed. Approve them in Trades.' : 'Nothing to trade right now: every position is within its limits and no signal calls for a change.'; await refresh() } catch (e) { msg.value = err(e) } }
// Opening holdings and cash.
const op = reactive({ open: false, busy: false, msg: '', rows: [] as { symbol: string; qty: number | string; cost: number | string }[], cash: '' as number | string })
function openOpening() { Object.assign(op, { open: true, busy: false, msg: '', cash: data.value?.cash ?? 0, rows: [...(data.value?.positions ?? []).map((p: any) => ({ symbol: p.symbol, qty: p.qty, cost: p.cost })), { symbol: '', qty: '', cost: '' }] }) }
async function saveOpening() {
  op.busy = true; op.msg = ''
  try { await $fetch('/api/markets/accounts/' + id.value + '/opening', { method: 'POST', body: { cash: op.cash === '' ? null : Number(op.cash), positions: op.rows.filter((r) => r.symbol.trim()).map((r) => ({ symbol: r.symbol.trim().toUpperCase(), qty: Number(r.qty || 0), cost: Number(r.cost || 0) })) } }); op.open = false; await refresh() }
  catch (e) { op.msg = err(e) } finally { op.busy = false }
}
// A trade placed directly at the broker.
const tr = reactive({ open: false, busy: false, msg: '', symbol: '', side: 'buy', qty: '' as number | string, price: '' as number | string, fees: 0 as number | string, filled_at: '' })
function openTrade() { Object.assign(tr, { open: true, busy: false, msg: '', symbol: '', side: 'buy', qty: '', price: '', fees: 0, filled_at: new Date(Date.now() - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16) }) }
async function saveTrade() {
  tr.busy = true; tr.msg = ''
  try { await $fetch('/api/markets/fills', { method: 'POST', body: { account_id: id.value, symbol: tr.symbol.trim().toUpperCase(), side: tr.side, qty: Number(tr.qty), price: Number(tr.price), fees: Number(tr.fees || 0), filled_at: new Date(tr.filled_at).toISOString() } }); tr.open = false; await navigateTo('/markets/trades?t=fills') }
  catch (e) { tr.msg = err(e) } finally { tr.busy = false }
}
</script>
<template>
  <section class="ad">
    <NuxtLink to="/markets/accounts" class="back">← Accounts</NuxtLink>
    <div v-if="error" class="card"><p class="error">{{ (error as any).data?.error?.message ?? 'Could not load this account.' }}</p></div>
    <template v-else-if="data && a">
      <div class="hd">
        <div><p class="label">{{ a.broker_name }} · {{ OWNER[a.owner_type] }}{{ a.owner ? ': ' + a.owner : '' }}{{ a.kind === 'retirement' ? ' · retirement' : '' }}</p><h1>{{ a.name }}</h1>
          <div class="px"><b>{{ usd(data.value) }}</b><span class="mut">cash {{ usd(data.cash) }} · {{ gain >= 0 ? 'gain' : 'loss' }} <span :class="gain >= 0 ? 'up' : 'dn'">{{ usd(Math.abs(gain)) }}</span> on positions</span></div></div>
        <div class="acts"><button class="btn secondary" @click="openOpening">Set holdings and cash</button><button class="btn secondary" @click="openTrade">Record a trade</button><button v-if="a.owner_type !== 'client'" class="btn" @click="propose">Ask for proposals</button></div>
      </div>
      <p v-if="okm" class="okm">{{ okm }}</p><p v-if="msg" class="error">{{ msg }}</p>
      <p v-if="a.owner_type === 'client'" class="warn">Client account: tracked here, but no trades are proposed until the compliance switches are on.</p>
      <div class="g2">
        <div class="card"><p class="k">Value, last 30 days <span class="mut">positions at daily closes, plus today's cash</span></p>
          <PriceChart v-if="data.history.length > 2" :points="data.history" :height="200" label="Account value" /><p v-else class="mut empty">Add holdings to see the trend.</p></div>
        <HBars title="Weight of each position" :sub="data.limits ? 'single-company limit ' + data.limits.single + '% (' + data.limits.label + ')' : ''" :rows="weights" unit="pct" :ref-line="data.limits?.single ?? null" ref-label="Single-company limit" />
      </div>
      <div class="card tbl">
        <table v-if="data.positions.length" class="table" data-nosearch>
          <thead><tr><th>Holding</th><th class="n">Shares</th><th class="n">Price</th><th class="n">Value</th><th class="n">Gain</th><th class="n">Weight</th><th>Signal</th></tr></thead>
          <tbody><tr v-for="p in data.positions" :key="p.symbol">
            <td><NuxtLink :to="'/markets/' + p.symbol"><b>{{ p.symbol }}</b></NuxtLink> <span class="mut">{{ p.name }}</span><em v-if="p.ai_headline" class="ai">AI: {{ p.ai_headline }}</em></td>
            <td class="n">{{ fixed(p.qty, p.qty % 1 ? 4 : 0) }}</td><td class="n">{{ usd(p.price) }}<em v-if="p.change_pct != null" :class="p.change_pct >= 0 ? 'up' : 'dn'">{{ signed(p.change_pct, 2) }}</em></td>
            <td class="n"><b>{{ usd(p.value) }}</b></td><td class="n" :class="p.value - p.cost >= 0 ? 'up' : 'dn'">{{ usd(p.value - p.cost) }}<em class="mut">cost {{ usd(p.cost) }}</em></td>
            <td class="n">{{ pct(p.weight) }}</td><td><span v-if="p.signal" class="sig" :class="p.signal">{{ p.signal_label }}</span><span v-else class="mut sm">{{ p.kind === 'stock' ? 'open it to value' : p.kind === 'etf' ? 'ETF' : 'by risk' }}</span></td></tr></tbody>
        </table>
        <EmptyState v-else compact icon="chart" title="No holdings yet" text="Enter what the account holds at the broker today, and its cash."><button class="btn" @click="openOpening">Set holdings and cash</button></EmptyState>
      </div>
      <div class="g2">
        <div class="card"><p class="k">Trades</p>
          <ul v-if="data.proposals.length" class="li"><li v-for="p in data.proposals" :key="p.id"><span class="sd" :class="p.side">{{ p.side === 'buy' ? 'Buy' : 'Sell' }}</span><b>{{ fixed(p.qty, p.qty % 1 ? 4 : 0) }} {{ p.symbol }}</b><span class="mut">{{ usd(p.notional) }} · {{ STATUS[p.status] }} · {{ ptTime(p.created_at) }}</span></li></ul>
          <p v-else class="mut sm">None yet.</p><NuxtLink to="/markets/trades" class="sm">Open Trades →</NuxtLink></div>
        <div class="card"><p class="k">Fills</p>
          <ul v-if="data.fills.length" class="li"><li v-for="x in data.fills" :key="x.id"><span class="sd" :class="x.side">{{ x.side === 'buy' ? 'Bought' : 'Sold' }}</span><b>{{ fixed(x.qty, x.qty % 1 ? 4 : 0) }} {{ x.symbol }} at {{ usd(x.price) }}</b><span class="mut">{{ STATUS[x.status] }} · {{ ptTime(x.filled_at) }}</span></li></ul>
          <p v-else class="mut sm">None yet.</p></div>
      </div>
    </template>

    <AppModal :open="op.open" wide title="Holdings and cash at the broker" @close="op.open = false">
      <form id="opf" class="fm" @submit.prevent="saveOpening">
        <p class="mut sm">What the account holds today, from the broker's app or statement. These are opening figures: no journals are posted. Set shares to 0 to remove a holding.</p>
        <table class="table" data-nosearch><thead><tr><th>Symbol</th><th>Shares</th><th>Total cost (USD)</th></tr></thead>
          <tbody><tr v-for="(r, i) in op.rows" :key="i"><td><input v-model="r.symbol" maxlength="12" placeholder="e.g. MSFT" @input="i === op.rows.length - 1 && r.symbol && op.rows.push({ symbol: '', qty: '', cost: '' })"></td><td><input v-model="r.qty" type="number" min="0" step="any"></td><td><input v-model="r.cost" type="number" min="0" step="any"></td></tr></tbody></table>
        <label class="label">Cash in the account (USD)<input v-model="op.cash" type="number" step="any"></label>
        <p v-if="op.msg" class="error">{{ op.msg }}</p>
      </form>
      <template #foot><button type="button" class="btn secondary" @click="op.open = false">Cancel</button><button class="btn" type="submit" form="opf" :disabled="op.busy">{{ op.busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
    <AppModal :open="tr.open" title="Record a trade" @close="tr.open = false">
      <form id="trf" class="fm" @submit.prevent="saveTrade">
        <p class="mut sm">A trade placed directly at {{ a?.broker_name }}. It waits in Trades for someone to confirm it before anything is written.</p>
        <div class="g2f"><label class="label">Symbol<input v-model="tr.symbol" maxlength="12" required></label><label class="label">Side<select v-model="tr.side"><option value="buy">Bought</option><option value="sell">Sold</option></select></label></div>
        <div class="g2f"><label class="label">Shares<input v-model="tr.qty" type="number" min="0" step="any" required></label><label class="label">Price (USD)<input v-model="tr.price" type="number" min="0" step="any" required></label></div>
        <div class="g2f"><label class="label">Fees (USD)<input v-model="tr.fees" type="number" min="0" step="any"></label><label class="label">Filled at<input v-model="tr.filled_at" type="datetime-local" required></label></div>
        <p v-if="tr.msg" class="error">{{ tr.msg }}</p>
      </form>
      <template #foot><button type="button" class="btn secondary" @click="tr.open = false">Cancel</button><button class="btn" type="submit" form="trf" :disabled="tr.busy">{{ tr.busy ? 'Saving…' : 'Send to confirm' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.ad { display: flex; flex-direction: column; gap: 14px; } .back { font-size: 13px; color: var(--c-blue-deep); text-decoration: none; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 2px 0 6px; }
.px { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; font-size: 13.5px; } .px b { font-size: 30px; font-weight: 600; font-variant-numeric: tabular-nums; }
.acts { display: flex; gap: 8px; flex-wrap: wrap; }
.g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .card { padding: 16px 18px; } .k { margin: 0 0 8px; font-size: 13px; color: var(--c-ink-soft); font-weight: 500; } .k .mut { font-weight: 400; margin-left: 6px; font-size: 12px; }
.tbl { padding: 0; overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: 14px; } th, td { padding: 10px 14px; text-align: left; border-top: 1px solid var(--c-line-soft); } .n { text-align: right; white-space: nowrap; }
td em { display: block; font-style: normal; font-size: 12px; } td a { color: var(--c-ink); text-decoration: none; } .ai { color: var(--c-ink-soft); max-width: 360px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.li { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; } .li li { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.sd { font-size: 11.5px; padding: 1px 6px; } .sd.buy { background: var(--c-blue-deep); color: #fff; } .sd.sell { border: 1px solid var(--c-warn); color: var(--c-warn); }
.sig { display: inline-block; font-size: 12px; font-weight: 500; padding: 3px 8px; border: 1px solid transparent; white-space: nowrap; } .sig.strong_buy, .sig.buy { background: var(--c-blue-deep); color: #fff; } .sig.hold { background: var(--c-paper-2); color: var(--c-ink-soft); } .sig.trim { border-color: var(--c-warn); color: var(--c-warn); } .sig.sell { border-color: var(--c-danger); color: var(--c-danger); }
.up { color: var(--c-blue-deep); } .dn { color: var(--c-danger); } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; } .empty { padding: 50px 0; text-align: center; }
.okm { margin: 0; padding: 10px 14px; background: #e6ecf2; color: var(--c-blue-deep); font-size: 13.5px; } .warn { margin: 0; padding: 10px 14px; background: #fff6e6; color: #7a4a06; font-size: 13.5px; } .error { color: var(--c-danger); margin: 0; }
.fm { display: flex; flex-direction: column; gap: 12px; } .fm .label { display: flex; flex-direction: column; gap: 4px; } .fm input, .fm select { font: inherit; font-size: 14px; height: 34px; border: 1px solid var(--c-rule-strong); padding: 0 8px; background: #fff; width: 100%; box-sizing: border-box; }
.fm td { padding: 4px 6px; } .g2f { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 900px) { .g2 { grid-template-columns: 1fr; } }
</style>
