<script setup lang="ts">
// Banking's accounts, live and uploaded, as one row of cards. Live accounts (US banks) update on their own; the
// others come from statements, with the latest balance a statement shows. Manage holds the connections (sign in
// again, resync, disconnect) and each uploaded account's statements (add a newer one, delete one, clear the account).
interface Up { id: string; file_name: string | null; file_kind: string; period_start: string | null; period_end: string | null; added: number; read: number; created_at: string }
export interface UpAcc { key: string; label: string; entity_id: string | null; entity: string | null; currency: string; balance: number | null; as_of: string | null; count: number; from: string | null; to: string | null; sheet: boolean; uploads: Up[]
  kind?: 'bank' | 'brokerage'; cash?: number | null; holdings?: number | null; accrued?: number | null; include_holdings?: boolean; valuation_as_of?: string | null; recon?: { months: number; off: { month: string; why: string }[] } | null }
export interface LiveAcc { id: string; item_id: string; name: string; mask: string | null; subtype: string | null; debt?: boolean; currency: string; current: string | null; available: string | null; updated_at: string; institution: string | null; error: string | null }
export interface LiveData { available?: boolean; manage?: boolean; enabled: boolean; env: string; items: { id: string; institution: string | null; error: string | null; history_from?: string | null; short?: boolean }[]; accounts: LiveAcc[] }
const props = defineProps<{ live: LiveData | null; uploaded: { accounts: UpAcc[] } | null; group?: boolean; ng?: boolean }>()
const emit = defineEmits<{ upload: [a: UpAcc | null]; valuation: [a: UpAcc | null]; sheet: []; changed: []; refreshLive: [] }>()
const { sf } = await useCoScope()
const pl = usePlaidLink(() => emit('changed')), { busy: plBusy, msg: plMsg, progress } = pl
const show = ref<'all' | 'live' | 'up'>('all'), manage = ref(false), open = ref(''), busy = ref(''), msg = ref(''), addOpen = ref(false)
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€', KES: 'KSh ', GHS: 'GH₵', ZAR: 'R ' }
const fmt = (v: number | string | null, c: string) => (v === null ? '—' : (Number(v) < 0 ? '−' : '') + (SYM[c] ?? c + ' ') + Math.abs(Number(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const day = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : day(d) }
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
// "GTBank current ··1234" → bank, account, last digits.
const parts = (l: string) => { const mk = l.match(/(?:··|\*{2,}|x{2,}|#)\s*(\d{3,})\s*$/i)?.[1] ?? null, rest = l.replace(/(?:··|\*{2,}|x{2,}|#)\s*\d{3,}\s*$/i, '').trim(), [bank, ...more] = rest.split(/\s+/); return { bank: bank ?? l, name: more.join(' '), mask: mk } }
const live = computed(() => [...(props.live?.accounts ?? [])].sort((a, b) => Number(!!a.debt) - Number(!!b.debt)))
const ups = computed(() => props.uploaded?.accounts ?? [])
const both = computed(() => live.value.length > 0 && ups.value.length > 0)
const count = computed(() => live.value.filter((a) => !a.debt).length + ups.value.length)
const newest = computed(() => live.value.reduce((m, a) => (a.updated_at > m ? a.updated_at : m), ''))
const canConnect = computed(() => !props.ng && !!props.live?.enabled && !!props.live?.manage)
const attention = computed(() => (props.live?.items ?? []).filter((i) => i.error))
const shortItems = computed(() => (props.live?.items ?? []).filter((i) => i.short && !i.error))
async function del(a: UpAcc, u: Up) {
  if (!await askConfirm('Its ' + u.added + ' payment' + (u.added === 1 ? '' : 's') + ' are removed from ' + a.label + '.', { title: 'Delete this statement?', ok: 'Delete', danger: true })) return
  busy.value = u.id; msg.value = ''
  try { await sf('/api/treasury/uploads/' + u.id, { method: 'DELETE' }); emit('changed') } catch (e) { msg.value = err(e) } finally { busy.value = '' }
}
async function clear(a: UpAcc) {
  if (!await askConfirm('All ' + a.count.toLocaleString('en-US') + ' payments and statements are removed.', { title: 'Clear ' + a.label + '?', ok: 'Clear account', danger: true })) return
  busy.value = a.key; msg.value = ''
  try { await sf('/api/treasury/accounts/clear', { method: 'POST', body: { label: a.label, entity_id: a.entity_id } }); emit('changed') } catch (e) { msg.value = err(e) } finally { busy.value = '' }
}
// History length is fixed when a bank is first connected: connecting it again brings in two years.
async function twoYears(it: { id: string; institution: string | null }) {
  if (!await askConfirm('Sign in to ' + (it.institution ?? 'the bank') + ' again and Finvry brings in two years of payments in place of the current ones. Categories you set are kept.', { title: 'Get 2 years of history?', ok: 'Continue' })) return
  void pl.connect(it.id)
}
// Brokerage accounts: whether holdings count in the total.
async function setHoldings(a: UpAcc, on: boolean) {
  try { await sf('/api/treasury/account-settings', { method: 'POST', body: { label: a.label, entity_id: a.entity_id, include_holdings: on } }); emit('changed') } catch (e) { msg.value = err(e) }
}
const brief = (v: number, c: string) => briefMoney(v, c)
const mon = (ym: string) => new Date(ym + '-15T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
function add(k: 'bank' | 'statement' | 'sheet') { addOpen.value = false; if (k === 'bank') void pl.connect(); else if (k === 'sheet') emit('sheet'); else emit('upload', null) }
</script>
<template>
  <section class="ba">
    <header class="top">
      <div class="tl"><h2>Accounts</h2><span v-if="count" class="ct">{{ count }}</span>
        <div v-if="both" class="seg" role="tablist"><button v-for="[k, l] in ([['all', 'All'], ['live', 'Live'], ['up', 'Statements']] as const)" :key="k" type="button" role="tab" :aria-selected="show === k" :class="{ on: show === k }" @click="show = k">{{ l }}</button></div></div>
      <div class="tr">
        <span v-if="newest" class="mut"><i class="dot" />Live · {{ ago(newest) }}</span>
        <button v-if="live.length" class="ic" type="button" title="Refresh balances" aria-label="Refresh balances" @click="emit('refreshLive')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg></button>
        <button v-if="count" class="lk" type="button" @click="manage = !manage">{{ manage ? 'Done' : 'Manage' }}</button>
        <div class="add"><button class="btn sm secondary" type="button" :aria-expanded="addOpen" :disabled="plBusy" @click="addOpen = !addOpen">{{ plBusy ? 'Opening…' : '+ Add' }}</button>
          <div v-if="addOpen" class="menu" @mouseleave="addOpen = false">
            <button v-if="canConnect" type="button" @click="add('bank')"><b>Connect a US bank</b><span>Live balances and payments</span></button>
            <button type="button" @click="add('statement')"><b>Upload a statement</b><span>Any bank, any format</span></button>
            <button type="button" @click="addOpen = false; emit('valuation', null)"><b>Add a brokerage account</b><span>Cash plus holdings, from month-end valuations</span></button>
            <button type="button" @click="add('sheet')"><b>Link a sheet</b><span>Updates when the sheet changes</span></button>
          </div></div>
      </div>
    </header>

    <div v-if="progress" class="prog" :class="{ done: progress.done && !progress.slow }" role="status" aria-live="polite">
      <div class="pt"><span v-if="!progress.done" class="spin" aria-hidden="true" /><svg v-else-if="!progress.slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        <span><b>{{ progress.done ? (progress.slow ? progress.banks + ' is still sending payments' : progress.banks + ' is up to date') : 'Updating ' + progress.banks }}</b>
          {{ progress.done ? (progress.slow ? 'They will appear here as they arrive; you can carry on.' : progress.payments.toLocaleString('en-US') + ' payments brought in.') : (progress.payments ? progress.payments.toLocaleString('en-US') + ' payments so far. ' : 'Bringing in balances and payments. ') + 'This can take a few minutes; you can keep working.' }}</span></div>
      <div v-if="!progress.done" class="track"><i /></div>
    </div>
    <div v-if="count || live.length" class="cards">
      <template v-if="show !== 'up'">
        <div v-for="a in live" :key="a.id" class="bc" :class="{ debt: a.debt }">
          <div class="r1"><span class="inst">{{ a.institution ?? 'Bank' }}</span><span class="mask">{{ a.mask ? '•• ' + a.mask : '' }}</span></div>
          <div class="nm" :title="a.name">{{ a.name }}<em v-if="a.subtype">{{ a.subtype }}</em></div>
          <div class="bal">{{ a.debt && a.current !== null ? fmt(Math.abs(Number(a.current)), a.currency) : fmt(a.current, a.currency) }}<small v-if="a.debt"> owed</small></div>
          <div class="ft"><span>{{ a.error ? 'Needs attention' : a.available !== null && a.available !== a.current ? (a.debt ? 'Available ' : 'Available ') + fmt(a.available, a.currency) : '' }}</span><span class="tag"><i class="dot" />Live</span></div>
        </div>
      </template>
      <template v-if="show !== 'live'">
        <button v-for="a in ups" :key="a.key" type="button" class="bc st" :title="'Add a newer statement to ' + a.label" @click="emit('upload', a)">
          <div class="r1"><span class="inst">{{ parts(a.label).bank }}</span><span class="mask">{{ parts(a.label).mask ? '•• ' + parts(a.label).mask : a.currency }}</span></div>
          <div class="nm" :title="a.label">{{ parts(a.label).name || 'Account' }}<em v-if="group && a.entity">{{ a.entity }}</em></div>
          <div class="bal">{{ fmt(a.balance, a.currency) }}</div>
          <div class="ft"><span>{{ a.kind === 'brokerage' && a.holdings !== null && a.holdings !== undefined ? brief(a.cash ?? 0, a.currency) + ' cash · ' + brief(a.holdings, a.currency) + ' held' : a.as_of ? day(a.as_of) : day(a.to) }}</span><span class="tag">{{ a.kind === 'brokerage' ? 'Brokerage' : 'Statement' }}</span><span class="plus">+ Statement</span></div>
        </button>
      </template>
    </div>
    <div v-else class="none"><b>No accounts yet</b><span>{{ canConnect ? 'Connect a US bank for live balances, or upload a statement from any bank.' : 'Upload a statement from any bank, or link a sheet.' }}</span>
      <div class="na"><button v-if="canConnect" class="btn" type="button" :disabled="plBusy" @click="pl.connect()">Connect a bank</button><button class="btn" :class="{ secondary: canConnect }" type="button" @click="emit('upload', null)">Upload a statement</button></div></div>

    <p v-if="shortItems.length && !manage" class="hint">{{ shortItems.map((i) => i.institution ?? 'A bank').join(' and ') }} {{ shortItems.length === 1 ? 'shows' : 'show' }} only recent payments. <button class="lk" type="button" @click="manage = true">Get 2 years of history</button></p>
    <p v-if="attention.length && !manage" class="warn">{{ attention.map((i) => (i.institution ?? 'A bank') + ' needs you to sign in again').join(' · ') }}. <button class="lk" type="button" @click="pl.reconnect(attention[0]!.id)">Reconnect</button></p>

    <div v-if="manage" class="mg">
      <template v-if="live.length">
        <h3>Live connections</h3>
        <div v-for="it in props.live?.items ?? []" :key="it.id" class="row"><b>{{ it.institution ?? 'Bank' }}</b><span class="mut">{{ it.error ? 'Needs attention' : live.filter((a) => a.item_id === it.id).length + (live.filter((a) => a.item_id === it.id).length === 1 ? ' account' : ' accounts') }}{{ it.history_from ? ' · since ' + day(it.history_from) : '' }}</span><button v-if="it.short && !it.error" class="lk" type="button" @click="twoYears(it)">Get 2 years of history</button>
          <span class="sp" /><button v-if="it.error" class="lk" type="button" @click="pl.reconnect(it.id)">Reconnect</button><button v-else class="lk" type="button" @click="pl.resync(it.id, it.institution)">Start over</button><button class="lk" type="button" @click="pl.disconnect(it.id, it.institution)">Disconnect</button><button class="lk red" type="button" @click="pl.disconnect(it.id, it.institution, true)">Disconnect and delete</button></div>
        <div v-if="(props.live?.items ?? []).length > 1" class="row all"><span class="mut">Clear every live bank's payments and bring them in again</span><span class="sp" /><button class="lk" type="button" @click="pl.resetAll()">Start over with all</button></div>
      </template>
      <template v-if="ups.length">
        <h3>From statements</h3>
        <div v-for="a in ups" :key="a.key" class="acc">
          <button class="row ah" type="button" :aria-expanded="open === a.key" @click="open = open === a.key ? '' : a.key"><b>{{ a.label }}</b><span class="mut">{{ group && a.entity ? a.entity + ' · ' : '' }}{{ a.count.toLocaleString('en-US') }} payments{{ a.uploads.length ? ' · ' + a.uploads.length + ' statement' + (a.uploads.length === 1 ? '' : 's') : '' }}</span><span class="sp" />
            <svg :class="{ up: open === a.key }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg></button>
          <div v-if="open === a.key" class="ab">
            <div v-for="u in a.uploads" :key="u.id" class="ur"><span class="fn">{{ u.file_name ?? 'Statement' }}</span><span class="mut">{{ day(u.period_start) }} – {{ day(u.period_end) }}</span><span class="sp" />
              <button class="lk red" type="button" :disabled="busy === u.id" @click="del(a, u)">{{ busy === u.id ? 'Deleting…' : 'Delete' }}</button></div>
            <p v-if="!a.uploads.length && a.count" class="mut ur">Older upload or linked sheet</p>
            <template v-if="a.kind === 'brokerage'">
              <div class="ur"><span class="fn">Month-end valuations</span><span class="mut">{{ a.recon?.months ?? 0 }} month{{ a.recon?.months === 1 ? '' : 's' }}{{ a.valuation_as_of ? ' to ' + day(a.valuation_as_of) : '' }}</span><span class="sp" />
                <span :class="a.recon?.off.length ? 'bad' : 'good'">{{ !a.recon?.months ? 'None yet' : a.recon.off.length ? new Set(a.recon.off.map((o) => o.month)).size + ' month(s) do not reconcile' : 'Reconciles every month' }}</span></div>
              <p v-for="o in (a.recon?.off ?? []).slice(0, 4)" :key="o.month + o.why" class="mut ur">{{ mon(o.month) }}: {{ o.why }}</p>
              <label class="ur chk"><input type="checkbox" :checked="a.include_holdings !== false" @change="setHoldings(a, ($event.target as HTMLInputElement).checked)"> Count holdings in the total{{ a.accrued ? ' (accrued interest of ' + fmt(a.accrued, a.currency) + ' is not counted)' : '' }}</label>
            </template>
            <div class="aa"><button class="lk" type="button" @click="emit('valuation', a)">{{ a.kind === 'brokerage' ? '+ Upload valuations' : 'This is a brokerage account' }}</button><button class="lk" type="button" @click="emit('upload', a)">+ Upload statement</button><button class="lk red" type="button" :disabled="busy === a.key" @click="clear(a)">{{ busy === a.key ? 'Clearing…' : 'Clear account' }}</button></div>
          </div>
        </div>
      </template>
    </div>
    <p v-if="msg || plMsg" class="msg">{{ msg || plMsg }}</p>
  </section>
</template>
<style scoped>
.ba { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; background: #fff; border: 1px solid var(--c-rule); }
.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.tl { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } .tl h2 { margin: 0; font-size: 16px; font-weight: 600; } .ct { font-size: 12px; color: var(--c-muted); background: var(--c-paper-2); padding: 1px 7px; }
.seg { display: inline-flex; border: 1px solid var(--c-rule); margin-left: 6px; } .seg button { background: none; border: 0; font: inherit; font-size: 12.5px; padding: 4px 11px; color: var(--c-muted); cursor: pointer; } .seg button.on { background: var(--c-navy); color: #fff; }
.tr { display: flex; align-items: center; gap: 12px; } .mut { color: var(--c-muted); font-size: 12.5px; }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #5fa8d3; margin-right: 5px; vertical-align: 1px; }
.ic { width: 30px; height: 30px; display: grid; place-items: center; background: none; border: 1px solid var(--c-rule-strong); color: var(--c-ink-soft); cursor: pointer; } .ic:hover { color: var(--c-navy); } .ic svg { width: 15px; height: 15px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; white-space: nowrap; } .lk.red { color: var(--c-danger); } .lk:disabled { opacity: .5; cursor: default; }
.btn.sm { height: 30px; padding: 0 12px; font-size: 13px; }
.add { position: relative; } .menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; width: 250px; background: #fff; border: 1px solid var(--c-rule-strong); box-shadow: 0 12px 32px rgba(12, 26, 46, .14); display: flex; flex-direction: column; }
.menu button { display: flex; flex-direction: column; gap: 1px; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--c-rule); padding: 11px 14px; font: inherit; cursor: pointer; } .menu button:last-child { border-bottom: 0; } .menu button:hover { background: var(--c-paper-2); }
.menu b { font-size: 13.5px; font-weight: 500; color: var(--c-ink); } .menu span { font-size: 12px; color: var(--c-muted); }
.cards { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; scroll-snap-type: x proximity; }
.bc { position: relative; flex: 0 0 232px; height: 140px; padding: 12px 15px; display: flex; flex-direction: column; color: #fff; overflow: hidden; border: 0; font: inherit; text-align: left; scroll-snap-align: start;
  background: linear-gradient(135deg, #0c1a2e 0%, #183456 100%); }
.bc::after { content: ''; position: absolute; right: -36px; top: -46px; width: 120px; height: 120px; border-radius: 50%; background: rgba(120,170,230,.16); pointer-events: none; }
.bc.debt { background: linear-gradient(135deg, #2b3340 0%, #444e5e 100%); } .bc.st { cursor: pointer; } .bc.st:hover, .bc.st:focus-visible { background: linear-gradient(135deg, #10223b 0%, #1f4470 100%); }
.r1 { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; opacity: .85; } .inst { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .mask { font-variant-numeric: tabular-nums; white-space: nowrap; }
.nm { margin-top: 4px; font-size: 12.5px; opacity: .78; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .nm em { font-style: normal; margin-left: 6px; opacity: .75; }
.bal { margin-top: auto; font-size: 20px; font-weight: 600; letter-spacing: -.01em; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .bal small { font-size: 11px; font-weight: 500; opacity: .75; }
.ft { display: flex; justify-content: space-between; gap: 8px; margin-top: 3px; font-size: 11px; opacity: .72; white-space: nowrap; } .tag { text-transform: uppercase; letter-spacing: .06em; font-size: 10px; } .ft .dot { width: 5px; height: 5px; }
.plus { display: none; } .bc.st:hover .tag, .bc.st:focus-visible .tag { display: none; } .bc.st:hover .plus, .bc.st:focus-visible .plus { display: inline; }
.none { display: flex; flex-direction: column; gap: 4px; padding: 26px; background: var(--c-paper-2); } .none b { font-size: 15px; font-weight: 600; } .none span { font-size: 13.5px; color: var(--c-muted); } .na { display: flex; gap: 8px; margin-top: 10px; }
.prog { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; background: var(--c-paper-2); border: 1px solid var(--c-rule); }
.prog .pt { display: flex; align-items: center; gap: 12px; font-size: 13.5px; color: var(--c-ink-soft); } .prog b { color: var(--c-ink); font-weight: 600; margin-right: 4px; }
.prog svg { width: 18px; height: 18px; color: var(--c-blue-deep); flex: none; }
.spin { width: 16px; height: 16px; flex: none; border: 2px solid var(--c-rule-strong); border-top-color: var(--c-navy); border-radius: 50%; animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
.track { position: relative; height: 3px; overflow: hidden; background: var(--c-rule); } .track i { position: absolute; top: 0; bottom: 0; width: 30%; background: var(--c-navy); animation: slide 1.3s ease-in-out infinite; } @keyframes slide { from { left: -30%; } to { left: 100%; } }
@media (prefers-reduced-motion: reduce) { .spin, .track i { animation: none; } .track i { left: 0; width: 100%; opacity: .4; } }
.warn { margin: 0; font-size: 13px; color: var(--c-danger); } .hint { margin: 0; font-size: 13px; color: var(--c-ink-soft); }
.mg { display: flex; flex-direction: column; border-top: 1px solid var(--c-rule); padding-top: 6px; } .mg h3 { margin: 12px 0 2px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--c-muted); }
.row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 0; border: 0; border-bottom: 1px solid var(--c-rule); background: none; font: inherit; text-align: left; } .row b { font-size: 13.5px; font-weight: 600; color: var(--c-ink); } .sp { flex: 1; }
.ah { cursor: pointer; } .ah svg { width: 16px; height: 16px; color: var(--c-muted); transition: transform .15s; } .ah svg.up { transform: rotate(180deg); }
.ab { display: flex; flex-direction: column; gap: 2px; padding: 6px 0 10px; border-bottom: 1px solid var(--c-rule); } .aa { display: flex; gap: 16px; justify-content: flex-end; padding-top: 6px; }
.ur { display: flex; align-items: center; gap: 10px; padding: 4px 0 4px 14px; font-size: 13px; margin: 0; } .ur .fn { color: var(--c-ink); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.good { font-size: 12.5px; color: var(--c-blue-deep); } .bad { font-size: 12.5px; color: var(--c-danger); } .chk { gap: 8px; color: var(--c-ink-soft); cursor: pointer; } .chk input { margin: 0; }
.msg { margin: 0; font-size: 13px; color: var(--c-ink-soft); }
@media (max-width: 640px) { .tr .mut { display: none; } .bc { flex-basis: 210px; } }
</style>
