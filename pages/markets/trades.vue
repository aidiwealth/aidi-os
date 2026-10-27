<script setup lang="ts">
// Trades: proposals waiting for approval (with every check), tickets to place at the broker (fields to copy, then
// what filled), fills to confirm (with exactly what confirming writes) and the history. Approving needs a fresh code;
// nothing reaches holdings, cash or the books until a fill is confirmed.
import { usd, fixed, ptTime } from '~/shared/market-format'
useHead({ title: 'Public markets · Trades' })
const route = useRoute(); const router = useRouter()
const { data, refresh } = await useFetch<any>('/api/markets/trades')
let poll: ReturnType<typeof setInterval> | null = null
onMounted(() => { poll = setInterval(() => { if (!document.hidden) void refresh() }, 30_000) })
onBeforeUnmount(() => { if (poll) clearInterval(poll) })
const waiting = computed(() => (data.value?.proposals ?? []).filter((p: any) => p.status === 'waiting'))
const tickets = computed(() => (data.value?.proposals ?? []).filter((p: any) => p.status === 'ticket'))
const toConfirm = computed(() => (data.value?.fills ?? []).filter((f: any) => f.status === 'pending'))
const history = computed(() => [...(data.value?.proposals ?? []).filter((p: any) => !['waiting', 'ticket'].includes(p.status)).map((p: any) => ({ ...p, what: 'Proposal', at: p.decided_at ?? p.created_at })), ...(data.value?.fills ?? []).filter((f: any) => f.status !== 'pending').map((f: any) => ({ ...f, what: 'Fill', at: f.decided_at ?? f.created_at }))].sort((a, b) => (a.at < b.at ? 1 : -1)))
const TABS = computed(() => [['waiting', 'Waiting', waiting.value.length], ['tickets', 'Tickets', tickets.value.length], ['fills', 'Fills to confirm', toConfirm.value.length], ['private', 'Pre-IPO', 0], ['history', 'History', 0]] as [string, string, number][])
const tab = computed({ get: () => String(route.query.t ?? (waiting.value.length ? 'waiting' : tickets.value.length ? 'tickets' : toConfirm.value.length ? 'fills' : 'waiting')), set: (t: string) => router.replace({ query: { t } }) })
const STATUS: Record<string, string> = { filled: 'Filled', rejected: 'Rejected', expired: 'Expired', cancelled: 'Cancelled', confirmed: 'Confirmed', approved: 'Approved' }
const err = (e: unknown) => (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not do that.'
const q = (x: number) => fixed(x, x % 1 ? 4 : 0)
const msg = ref('')

// Approve with a code.
const ap = reactive({ open: false, p: null as any, code: '', sent: false, busy: false, msg: '' })
function approve(p: any) { Object.assign(ap, { open: true, p, code: '', sent: false, busy: false, msg: '' }) }
async function sendCode() { ap.msg = ''; try { await $fetch('/api/markets/code', { method: 'POST' }); ap.sent = true } catch (e) { ap.msg = err(e) } }
async function doApprove() { ap.busy = true; ap.msg = ''; try { await $fetch('/api/markets/proposals/' + ap.p.id, { method: 'POST', body: { action: 'approve', code: ap.code } }); ap.open = false; await refresh(); tab.value = 'tickets' } catch (e) { ap.msg = err(e) } finally { ap.busy = false } }
async function decide(p: any, action: 'reject' | 'cancel') { msg.value = ''; if (!await askConfirm(action === 'reject' ? 'Reject this proposal?' : 'Cancel this ticket? Use this only if it was not placed.')) return; try { await $fetch('/api/markets/proposals/' + p.id, { method: 'POST', body: { action } }); await refresh() } catch (e) { msg.value = err(e) } }
// Tickets: copy a field, then enter what filled.
const copied = ref('')
async function copy(v: string, k: string) { try { await navigator.clipboard.writeText(v); copied.value = k; setTimeout(() => { if (copied.value === k) copied.value = '' }, 1500) } catch { /* clipboard blocked */ } }
const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16)
const fillForm = reactive<Record<string, { qty: number | string; price: number | string; fees: number | string; at: string; busy: boolean; msg: string }>>({})
const ff = (p: any) => (fillForm[p.id] ??= { qty: p.qty, price: '', fees: 0, at: nowLocal(), busy: false, msg: '' })
async function recordFill(p: any) { const x = ff(p); x.busy = true; x.msg = ''; try { await $fetch('/api/markets/fills', { method: 'POST', body: { account_id: p.account_id, proposal_id: p.id, symbol: p.symbol, side: p.side, qty: Number(x.qty), price: Number(x.price), fees: Number(x.fees || 0), filled_at: new Date(x.at).toISOString() } }); await refresh(); tab.value = 'fills' } catch (e) { x.msg = err(e) } finally { x.busy = false } }
// Fills: confirm or reject.
const fb = reactive<Record<string, string>>({})
async function fillDo(f: any, action: 'confirm' | 'reject') { fb[f.id] = ''; if (action === 'reject' && !await askConfirm('Reject this fill? Nothing is written.')) return; try { await $fetch('/api/markets/fills/' + f.id, { method: 'POST', body: { action } }); await refresh() } catch (e) { fb[f.id] = err(e) } }
</script>
<template>
  <section class="tr">
    <p class="label">Wealth management</p>
    <div class="head"><div><h1>Trades</h1><p class="lead">Approve with a code, place the ticket at the broker, enter what filled, then confirm. Nothing reaches the books until a fill is confirmed.</p></div></div>
    <MarketsNav :waiting="waiting.length + tickets.length + toConfirm.length" />
    <nav class="tabs" aria-label="Trades"><button v-for="[k, l, n] in TABS" :key="k" :class="{ on: tab === k }" @click="tab = k">{{ l }}<em v-if="n">{{ n }}</em></button></nav>
    <p v-if="msg" class="error">{{ msg }}</p>

    <div v-if="tab === 'waiting'" class="list">
      <article v-for="p in waiting" :key="p.id" class="card pr">
        <div class="pt"><div><span class="sd" :class="p.side">{{ p.side === 'buy' ? '↑ Buy' : '↓ Sell' }}</span> <b>{{ q(p.qty) }} {{ p.symbol }}</b> <span class="mut">{{ p.name }}</span><div class="mut sm">{{ p.account }} · {{ p.broker_name }} · limit {{ usd(p.limit_price) }} · {{ usd(p.notional) }}{{ p.valuation_version ? ' · valuation v' + p.valuation_version : '' }}</div></div>
          <div class="pa"><button class="btn secondary" @click="decide(p, 'reject')">Reject</button><button class="btn" :disabled="p.checks.some((c: any) => !c.ok) || p.owner_type === 'client'" @click="approve(p)">Approve</button></div></div>
        <p class="why"><b>Why:</b> {{ p.reason }}</p>
        <div class="chk"><span v-for="c in p.checks" :key="c.name" :class="c.ok ? 'ok' : 'no'">{{ c.name }}<em>{{ c.detail }}</em></span></div>
        <p class="mut sm">Proposed {{ ptTime(p.created_at) }} · expires {{ ptTime(p.expires_at) }}</p>
      </article>
      <EmptyState v-if="!waiting.length" card icon="check" title="Nothing waiting" text="Proposals appear here each evening after the US close, or when you ask for them on an account." />
    </div>

    <div v-else-if="tab === 'tickets'" class="list">
      <article v-for="p in tickets" :key="p.id" class="card tk">
        <div><div class="pt"><div><b>Ticket · {{ p.side === 'buy' ? 'Buy' : 'Sell' }} {{ p.symbol }}</b><div class="mut sm">{{ p.account }} · {{ p.broker_name }} · approved by {{ p.decided_by ?? '—' }} {{ ptTime(p.decided_at) }}</div></div><button class="lk" @click="decide(p, 'cancel')">Not placed</button></div>
          <p v-if="p.execution === 'alpaca'" class="mut sm">Sending orders to Alpaca by API comes next; until then place it in Alpaca and enter the fill here.</p>
          <div v-for="[l, v] in ([['Symbol', p.symbol], ['Side', p.side === 'buy' ? 'Buy' : 'Sell'], ['Quantity', q(p.qty)], ['Order type', 'Limit'], ['Limit price', String(p.limit_price)], ['Time in force', 'Day']] as [string, string][])" :key="l" class="fld"><span class="mut sm">{{ l }}</span><b>{{ v }}</b><button class="btn secondary sm" type="button" @click="copy(v, p.id + l)">{{ copied === p.id + l ? 'Copied' : 'Copy' }}</button></div></div>
        <form class="fill" @submit.prevent="recordFill(p)"><b>After placing it, enter what filled</b>
          <div class="g2"><label class="label">Shares filled<input v-model="ff(p).qty" type="number" min="0" step="any" required></label><label class="label">Average price<input v-model="ff(p).price" type="number" min="0" step="any" required></label></div>
          <div class="g2"><label class="label">Fees<input v-model="ff(p).fees" type="number" min="0" step="any"></label><label class="label">Filled at<input v-model="ff(p).at" type="datetime-local" required></label></div>
          <p v-if="ff(p).msg" class="error">{{ ff(p).msg }}</p>
          <button class="btn" :disabled="ff(p).busy">{{ ff(p).busy ? 'Saving…' : 'Record fill' }}</button></form>
      </article>
      <EmptyState v-if="!tickets.length" card icon="check" title="No tickets to place" text="Approved trades for manual brokers (Robinhood, Schwab) appear here with the fields to copy." />
    </div>

    <div v-else-if="tab === 'fills'" class="list">
      <article v-for="f in toConfirm" :key="f.id" class="card pr">
        <div class="pt"><div><b>{{ f.side === 'buy' ? 'Bought' : 'Sold' }} {{ q(f.qty) }} {{ f.symbol }} at {{ usd(f.price) }}</b><div class="mut sm">{{ f.account }} · {{ f.broker_name }} · {{ f.source === 'alpaca' ? 'from Alpaca' : 'entered by ' + (f.entered_by ?? '—') }} · filled {{ ptTime(f.filled_at) }}{{ f.fees ? ' · fees ' + usd(f.fees) : '' }}</div></div>
          <div class="pa"><button class="btn secondary" @click="fillDo(f, 'reject')">Reject</button><button class="btn" :disabled="!f.preview" @click="fillDo(f, 'confirm')">Confirm and post</button></div></div>
        <template v-if="f.preview"><p class="sm" style="margin: 4px 0 6px; font-weight: 500;">What confirming writes</p>
          <div class="fx"><div><span class="mut sm">Position</span><b>{{ q(f.preview.position_before.qty) }} → {{ q(f.preview.position_after.qty) }} {{ f.symbol }}</b><em class="mut">cost {{ usd(f.preview.position_after.cost) }}</em></div>
            <div><span class="mut sm">Cash at {{ f.broker_name }}</span><b>{{ usd(f.preview.cash_before) }} → {{ usd(f.preview.cash_after) }}</b></div>
            <div><span class="mut sm">Investments &amp; AUM</span><b>{{ f.symbol }} line updated</b></div>
            <div v-if="f.side === 'sell'"><span class="mut sm">Realised {{ f.preview.realised >= 0 ? 'gain' : 'loss' }}</span><b :class="f.preview.realised >= 0 ? 'up' : 'dn'">{{ usd(Math.abs(f.preview.realised)) }}</b></div></div>
          <table v-if="f.preview.journal" class="jt" data-nosearch><thead><tr><th>Journal · {{ f.preview.journal.entity }}</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead>
            <tbody><tr v-for="l in f.preview.journal.lines" :key="l.account"><td>{{ l.account }}</td><td class="n">{{ l.debit ? usd(l.debit) : '' }}</td><td class="n">{{ l.credit ? usd(l.credit) : '' }}</td></tr></tbody></table>
          <p v-else class="mut sm">No journal: {{ f.preview.journal_why }}</p></template>
        <p v-else class="error">{{ f.preview_error }}</p>
        <p v-if="fb[f.id]" class="error">{{ fb[f.id] }}</p>
      </article>
      <EmptyState v-if="!toConfirm.length" card icon="check" title="No fills to confirm" text="Fills entered from tickets, or trades recorded on an account, wait here." />
    </div>

    <PrivateCommitments v-else-if="tab === 'private'" :code-method="data?.code_method" />
    <div v-else class="card tbl">
      <table v-if="history.length" class="table" data-nosearch><thead><tr><th>When</th><th>What</th><th>Trade</th><th>Account</th><th class="n">Amount</th><th>Status</th><th>By</th></tr></thead>
        <tbody><tr v-for="h in history" :key="h.what + h.id"><td class="nw">{{ ptTime(h.at) }}</td><td>{{ h.what }}</td><td>{{ h.side === 'buy' ? 'Buy' : 'Sell' }} {{ q(h.qty) }} {{ h.symbol }}</td><td>{{ h.account }}</td><td class="n">{{ usd(h.notional ?? h.qty * h.price) }}</td><td>{{ STATUS[h.status] ?? h.status }}</td><td>{{ h.decided_by ?? '—' }}</td></tr></tbody></table>
      <EmptyState v-else compact icon="check" title="No history yet" />
    </div>

    <AppModal :open="ap.open" title="Approve trade" @close="ap.open = false">
      <form v-if="ap.p" id="apf" class="fm" @submit.prevent="doApprove">
        <p>{{ ap.p.side === 'buy' ? 'Buy' : 'Sell' }} <b>{{ q(ap.p.qty) }} {{ ap.p.symbol }}</b> for {{ ap.p.account }} at up to <b>{{ usd(ap.p.limit_price) }}</b> ({{ usd(ap.p.notional) }}) at {{ ap.p.broker_name }}.</p>
        <template v-if="data?.code_method === 'email' && !ap.sent"><p class="mut sm">We email you a 6-digit code to approve.</p><button class="btn secondary" type="button" @click="sendCode">Email me a code</button></template>
        <label v-else class="label">{{ data?.code_method === 'app' ? 'Code from your authenticator app' : 'Code from your email' }}<input v-model="ap.code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="6-digit code" required></label>
        <p class="mut sm">The checks run again on approval. An approved trade becomes a ticket to place at the broker.</p>
        <p v-if="ap.msg" class="error">{{ ap.msg }}</p>
      </form>
      <template #foot><button type="button" class="btn secondary" @click="ap.open = false">Cancel</button><button class="btn" type="submit" form="apf" :disabled="ap.busy || !ap.code">{{ ap.busy ? 'Approving…' : 'Approve' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.tr { display: flex; flex-direction: column; gap: 14px; } .head h1 { margin: 2px 0 4px; } .lead { margin: 0; color: var(--c-muted); font-size: 14px; max-width: 760px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--c-rule); } .tabs button { font: inherit; font-size: 14px; background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 12px; color: var(--c-muted); cursor: pointer; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-ink); } .tabs em { font-style: normal; font-size: 11.5px; margin-left: 6px; background: var(--c-blue-deep); color: #fff; padding: 1px 6px; }
.list { display: flex; flex-direction: column; gap: 12px; } .card { padding: 16px 18px; }
.pt { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; } .pa { display: flex; gap: 8px; }
.sd { font-size: 12px; font-weight: 500; padding: 3px 8px; } .sd.buy { background: var(--c-blue-deep); color: #fff; } .sd.sell { border: 1px solid var(--c-warn); color: var(--c-warn); }
.why { margin: 10px 0 8px; font-size: 14px; line-height: 1.5; }
.chk { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 16px; font-size: 13px; margin-bottom: 8px; } .chk span::before { font-weight: 600; margin-right: 5px; } .chk .ok::before { content: '✓'; color: var(--c-blue-deep); } .chk .no { color: var(--c-danger); } .chk .no::before { content: '✕'; } .chk em { font-style: normal; color: var(--c-muted); margin-left: 6px; }
.tk { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; } .fld { display: grid; grid-template-columns: 110px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-top: 1px solid var(--c-line-soft); font-size: 14px; }
.btn.sm { height: 28px; font-size: 12px; padding: 0 10px; } .lk { background: none; border: 0; color: var(--c-blue-deep); font: inherit; font-size: 13px; cursor: pointer; padding: 0; }
.fill { display: flex; flex-direction: column; gap: 10px; background: var(--c-paper-3); padding: 14px; align-self: start; } .fill .btn { align-self: flex-end; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); } input, select { font: inherit; font-size: 14px; height: 34px; border: 1px solid var(--c-rule-strong); padding: 0 8px; background: #fff; width: 100%; box-sizing: border-box; }
.fx { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; } .fx > div { background: var(--c-paper-3); padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; font-size: 14px; } .fx em { font-style: normal; font-size: 12px; }
.jt { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 6px; } .jt th, .jt td { padding: 6px 10px; border-top: 1px solid var(--c-line-soft); text-align: left; } .jt th { color: var(--c-muted); font-weight: 500; } .n { text-align: right; white-space: nowrap; }
.tbl { padding: 0; overflow-x: auto; } .tbl table { width: 100%; border-collapse: collapse; font-size: 13.5px; } .tbl th, .tbl td { padding: 10px 14px; text-align: left; border-top: 1px solid var(--c-line-soft); } .nw { white-space: nowrap; }
.fm { display: flex; flex-direction: column; gap: 12px; } .fm p { margin: 0; }
.up { color: var(--c-blue-deep); } .dn { color: var(--c-danger); } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 900px) { .tk, .fx, .chk { grid-template-columns: 1fr; } }
</style>
