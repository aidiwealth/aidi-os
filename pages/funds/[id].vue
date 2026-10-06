<script setup lang="ts">
const id = useRoute().params.id as string
interface M { paidIn: number; distributed: number; nav: number; dpi: number | null; rvpi: number | null; tvpi: number | null; irr: number | null }
interface Lp { lp_id: string; name: string; email: string | null; commitment: number; called: number; paidIn: number; unfunded: number; distributed: number; navShare: number; m: M }
interface D {
  rolling?: boolean; deals?: { id: string; name: string; status: string; cost: number; value: number; realized: number; instrument: string | null; cap: number | null; aidi: number | null; legal: string | null; co: { name: string; email: string; amount: number }[] }[]
  fund: { id: string; entity_id: string; name: string; currency: string; target_size: string | null; vintage: number | null; first_close: string | null; final_close: string | null; term_years: number | null; mgmt_fee_pct: string | null; carry_pct: string | null; hurdle_pct: string | null; status: string; administrator: string; administrator_name: string | null; admin_portal_url: string | null; notify_lps: boolean }
  commitments: { id: string; lp_id: string; name: string; amount: string; committed_on: string }[]; lps: Lp[]; navDate: string | null
  totals: { committed: number; called: number; paidIn: number; unfunded: number; distributed: number; nav: number; deployed: number; calledPct: number }; m: M
  calls: { id: string; kind: string; number: number; purpose: string | null; total_amount: string; due_date: string; status: string; paid: string }[]
  navs: { id: string; as_of: string; nav: string; note: string | null }[]; investments: { id: string; company: string; check_usd: string | null; closed_at: string | null }[]; allLps: { id: string; name: string }[]; required: number
}
const { data, refresh } = await useFetch<D>('/api/funds/' + id)
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const isGp = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
useHead({ title: () => data.value?.fund.name ?? 'Fund' })
const { money, x, pct, day } = useMoney()
const cur = computed(() => data.value?.fund.currency ?? 'USD')
const tab = ref<'lps' | 'calls' | 'nav' | 'terms'>('lps')
const msg = ref(''); const ok = ref(''); const busy = ref(false)
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' }
async function run(fn: () => Promise<unknown>, done: string) { busy.value = true; msg.value = ''; ok.value = ''; try { await fn(); ok.value = done; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const cm = reactive({ lp_id: '', amount: '', committed_on: '' })
const addCommit = () => run(async () => { await $fetch('/api/funds/' + id + '/commitments', { method: 'POST', body: cm }); Object.assign(cm, { lp_id: '', amount: '', committed_on: '' }) }, 'Commitment saved.')
const cl = reactive({ kind: 'call', total_amount: '', due_date: '', purpose: '' })
async function addCall() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/funds/' + id + '/calls', { method: 'POST', body: cl }); await navigateTo('/funds/calls/' + r.id) } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const nv = reactive({ as_of: '', nav: '', note: '' })
const addNav = () => run(async () => { await $fetch('/api/funds/' + id + '/navs', { method: 'POST', body: nv }); Object.assign(nv, { as_of: '', nav: '', note: '' }) }, 'NAV saved.')
const tm = reactive({ currency: 'USD', target_size: '' as string | number, vintage: '' as string | number, first_close: '', final_close: '', term_years: '' as string | number, mgmt_fee_pct: '' as string | number, carry_pct: '' as string | number, hurdle_pct: '' as string | number, status: 'raising', administrator: 'self', administrator_name: '', admin_portal_url: '', notify_lps: true })
watchEffect(() => { const f = data.value?.fund; if (f) Object.assign(tm, { currency: f.currency, target_size: f.target_size ?? '', vintage: f.vintage ?? '', first_close: f.first_close ?? '', final_close: f.final_close ?? '', term_years: f.term_years ?? '', mgmt_fee_pct: f.mgmt_fee_pct ?? '', carry_pct: f.carry_pct ?? '', hurdle_pct: f.hurdle_pct ?? '', status: f.status, administrator: f.administrator, administrator_name: f.administrator_name ?? '', admin_portal_url: f.admin_portal_url ?? '', notify_lps: f.notify_lps }) })
const ADMIN: Record<string, string> = { sydecar: 'Sydecar', carta: 'Carta', angellist: 'AngelList', other: 'Other administrator', self: 'Self-administered' }
const adminLabel = computed(() => { const f = data.value?.fund; if (!f) return ''; return f.administrator === 'other' ? (f.administrator_name || 'your administrator') : ADMIN[f.administrator] })
const saveTerms = () => run(() => $fetch('/api/funds/setup', { method: 'POST', body: { entity_id: data.value!.fund.entity_id, ...tm } }), 'Terms saved.')
const ST: Record<string, string> = { draft: 'Draft', pending_approval: 'Awaiting approval', approved: 'Approved', sent: 'Sent', completed: 'Completed', cancelled: 'Cancelled' }
const commitmentOf = (lpId: string) => data.value?.commitments.find((c) => c.lp_id === lpId)
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/funds" class="back">← Funds</NuxtLink>
    <h1>{{ data.fund.name }}</h1>
    <p class="meta">{{ data.fund.status }}<template v-if="data.fund.vintage"> · vintage {{ data.fund.vintage }}</template><template v-if="data.fund.target_size"> · target {{ money(data.fund.target_size, cur) }}</template><template v-if="data.navDate"> · NAV at {{ day(data.navDate) }}</template></p>
    <p class="adm" :class="{ self: data.fund.administrator === 'self' }"><template v-if="data.fund.administrator !== 'self'">Administered by <b>{{ adminLabel }}</b><a v-if="data.fund.admin_portal_url" :href="data.fund.admin_portal_url" target="_blank" rel="noopener">Open {{ adminLabel }} →</a><span>Formation, KYC, money movement, official statements and tax sit with them. Finvry tracks and reports.</span></template><template v-else>Self-administered.</template></p>
    <template v-if="data.rolling">
    <p class="rollnote">Rolling fund: investors join deal by deal, and the terms (instrument, valuation cap, amounts) are set for each startup. There is no fund-level target, fee or term.</p>
    <div class="kpis">
      <div class="kpi"><span>Deals</span><b>{{ data.deals?.length ?? 0 }}</b><em>{{ data.deals?.filter((d) => ['active', 'at_cost'].includes(d.status)).length }} active · {{ data.deals?.filter((d) => d.status === 'written_off').length }} written off</em></div>
      <div class="kpi"><span>Invested</span><b>{{ money(data.deals?.reduce((a, d) => a + d.cost, 0) ?? 0, cur) }}</b><em>Aidi {{ money(data.deals?.reduce((a, d) => a + (d.aidi ?? 0), 0) ?? 0, cur) }} on deals with terms on file</em></div>
      <div class="kpi"><span>Current value</span><b>{{ money(data.deals?.reduce((a, d) => a + d.value, 0) ?? 0, cur) }}</b><em>Realized {{ money(data.deals?.reduce((a, d) => a + d.realized, 0) ?? 0, cur) }}</em></div>
      <div class="kpi"><span>Multiple</span><b>{{ x(((data.deals?.reduce((a, d) => a + d.value + d.realized, 0) ?? 0) / Math.max(1, data.deals?.reduce((a, d) => a + d.cost, 0) ?? 1))) }}</b><em>value plus realized over invested</em></div>
      <div class="kpi"><span>Co-investors</span><b>{{ data.lps.length }}</b><em>{{ money(data.deals?.reduce((a, d) => a + d.co.reduce((s, c) => s + c.amount, 0), 0) ?? 0, cur) }} invested alongside</em></div>
    </div>
    <div class="card rdeals"><h2>Investments (deal by deal)</h2><table class="mini"><thead><tr><th>Company</th><th>Terms</th><th class="n">Aidi Angel Fund</th><th>Co-investors</th><th class="n">Value</th><th>Status</th></tr></thead><tbody>
      <tr v-for="d in data.deals" :key="d.id"><td><b>{{ d.name }}</b><span v-if="d.legal" class="sub">{{ d.legal }}</span></td><td>{{ d.instrument ?? '—' }}<span v-if="d.cap" class="sub">{{ d.instrument === 'SPV' ? 'valuation' : 'cap' }} {{ money(d.cap, cur) }}</span></td><td class="n">{{ d.aidi !== null ? money(d.aidi, cur) : '—' }}</td>
        <td><template v-if="d.co.length">{{ d.co.map((c) => c.name + ' ' + money(c.amount, cur)).join(', ') }}</template><span v-else class="sub">—</span></td><td class="n">{{ money(d.value, cur) }}<span v-if="d.realized" class="sub">+ {{ money(d.realized, cur) }} realized</span></td><td>{{ { active: 'Active', at_cost: 'At cost', realized: 'Exited', written_off: 'Written off', sold: 'Sold', nil: 'Nil' }[d.status] ?? d.status }}</td></tr></tbody></table>
      <p class="sub">Positions and terms are kept in Investments &amp; AUM; edit them there.</p></div>
    </template>
    <div v-else class="kpis">
      <div class="kpi"><span>Committed</span><b>{{ money(data.totals.committed, cur) }}</b><em>{{ data.lps.length }} LPs</em></div>
      <div class="kpi"><span>Called</span><b>{{ money(data.totals.called, cur) }}</b><em>{{ pct(data.totals.calledPct) }} · {{ money(data.totals.unfunded, cur) }} unfunded</em></div>
      <div class="kpi"><span>Paid in</span><b>{{ money(data.totals.paidIn, cur) }}</b><em>{{ money(data.totals.deployed) }} invested in {{ data.investments.length }} deals</em></div>
      <div class="kpi"><span>Distributed</span><b>{{ money(data.totals.distributed, cur) }}</b><em>NAV {{ money(data.totals.nav, cur) }}</em></div>
      <div class="kpi"><span>DPI</span><b>{{ x(data.m.dpi) }}</b><em>RVPI {{ x(data.m.rvpi) }}</em></div>
      <div class="kpi"><span>TVPI</span><b>{{ x(data.m.tvpi) }}</b><em>Net IRR {{ pct(data.m.irr) }}</em></div>
    </div>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div class="tabs"><button :class="{ on: tab === 'lps' }" @click="tab = 'lps'">LPs &amp; commitments</button><button :class="{ on: tab === 'calls' }" @click="tab = 'calls'">Calls &amp; distributions</button><button :class="{ on: tab === 'nav' }" @click="tab = 'nav'">NAV</button><button :class="{ on: tab === 'terms' }" @click="tab = 'terms'">Terms</button></div>

    <template v-if="tab === 'lps'">
      <div v-if="data.lps.length" class="card donut"><DonutChart title="Commitments by LP" total-label="Committed" :currency="cur" :segments="data.lps.map((l) => ({ label: l.name, value: l.commitment }))" /></div>
      <table class="table">
        <thead><tr><th>LP</th><th class="n">Commitment</th><th class="n">Called</th><th class="n">Paid in</th><th class="n">Unfunded</th><th class="n">Distributed</th><th class="n">TVPI</th><th /></tr></thead>
        <tbody><tr v-for="l in data.lps" :key="l.lp_id">
          <td><NuxtLink :to="'/funds/lps/' + l.lp_id" class="co">{{ l.name }}</NuxtLink><span class="sub">{{ l.email ?? 'no email' }}</span></td>
          <td class="n">{{ money(l.commitment, cur, true) }}</td><td class="n">{{ money(l.called, cur, true) }}</td><td class="n">{{ money(l.paidIn, cur, true) }}</td>
          <td class="n">{{ money(l.unfunded, cur, true) }}</td><td class="n">{{ money(l.distributed, cur, true) }}</td><td class="n">{{ x(l.m.tvpi) }}</td>
          <td><DeleteButton v-if="isGp && commitmentOf(l.lp_id)" type="commitment" :id="commitmentOf(l.lp_id)!.id" :name="'the commitment from ' + l.name" link @deleted="refresh()" /></td>
        </tr></tbody>
      </table>
      <EmptyState v-if="!data.lps.length" compact icon="funds" title="No commitments yet" />
      <form v-if="isGp" class="card frm" @submit.prevent="addCommit">
        <h2 class="wide">Add or change a commitment</h2>
        <label class="label">LP<select v-model="cm.lp_id" required><option value="" disabled>Choose</option><option v-for="l in data.allLps" :key="l.id" :value="l.id">{{ l.name }}</option></select></label>
        <label class="label">Amount ({{ cur }})<input v-model="cm.amount" inputmode="decimal" required></label>
        <label class="label">Committed on<input v-model="cm.committed_on" type="date"></label>
        <div class="row"><button class="btn" type="submit" :disabled="busy">Save commitment</button><NuxtLink to="/funds/lps" class="small">Add an LP to the register →</NuxtLink></div>
      </form>
    </template>

    <template v-else-if="tab === 'calls'">
      <table class="table">
        <thead><tr><th>Notice</th><th>Purpose</th><th>Date</th><th class="n">Amount</th><th class="n">Settled</th><th>Status</th></tr></thead>
        <tbody><tr v-for="c in data.calls" :key="c.id" :class="{ off: c.status === 'cancelled' }">
          <td><NuxtLink :to="'/funds/calls/' + c.id" class="co">{{ c.kind === 'call' ? 'Capital call' : 'Distribution' }} {{ c.number }}</NuxtLink></td>
          <td class="muted">{{ c.purpose ?? '—' }}</td><td>{{ day(c.due_date) }}</td><td class="n">{{ money(c.total_amount, cur, true) }}</td><td class="n">{{ money(c.paid, cur, true) }}</td>
          <td><span class="st" :data-s="c.status">{{ ST[c.status] }}</span></td>
        </tr></tbody>
      </table>
      <EmptyState v-if="!data.calls.length" compact icon="funds" title="No capital calls or distributions yet" />
      <form v-if="isGp" class="card frm" @submit.prevent="addCall">
        <h2 class="wide">New capital call or distribution</h2>
        <label class="label">Type<select v-model="cl.kind"><option value="call">Capital call (split by commitment)</option><option value="distribution">Distribution (split by paid-in)</option></select></label>
        <label class="label">Total ({{ cur }})<input v-model="cl.total_amount" inputmode="decimal" required></label>
        <label class="label">{{ cl.kind === 'call' ? 'Due date' : 'Payment date' }}<input v-model="cl.due_date" type="date" required></label>
        <label class="label wide">Purpose<input v-model="cl.purpose" maxlength="1000" :placeholder="cl.kind === 'call' ? 'e.g. Investment in Acme, management fee Q4' : 'e.g. Proceeds from the sale of Acme'"></label>
        <p class="hint wide">It is drafted for review, then needs {{ data.required }} GP approval{{ data.required === 1 ? '' : 's' }}. Finvry tracks each LP's share and settlement; the money moves through {{ data.fund.administrator === 'self' ? 'your fund bank account' : adminLabel }}.</p>
        <div class="row"><button class="btn" type="submit" :disabled="busy">Draft it</button></div>
      </form>
    </template>

    <template v-else-if="tab === 'nav'">
      <table class="table"><thead><tr><th>As of</th><th class="n">Net asset value</th><th>Note</th><th /></tr></thead>
        <tbody><tr v-for="n in data.navs" :key="n.id"><td>{{ day(n.as_of) }}</td><td class="n">{{ money(n.nav, cur, true) }}</td><td class="muted">{{ n.note ?? '' }}</td><td><DeleteButton v-if="isGp" type="nav" :id="n.id" :name="'the NAV at ' + day(n.as_of)" link @deleted="refresh()" /></td></tr></tbody></table>
      <EmptyState v-if="!data.navs.length" compact icon="funds" title="No NAV recorded yet. RVPI, TVPI and IRR use the latest NAV" />
      <form v-if="isGp" class="card frm" @submit.prevent="addNav">
        <h2 class="wide">Record NAV</h2>
        <label class="label">As of<input v-model="nv.as_of" type="date" required></label>
        <label class="label">NAV ({{ cur }})<input v-model="nv.nav" inputmode="decimal" required></label>
        <label class="label">Note<input v-model="nv.note" maxlength="500" placeholder="e.g. Q3 valuation, marked to last round"></label>
        <div class="row"><button class="btn" type="submit" :disabled="busy">Save NAV</button></div>
      </form>
    </template>

    <p v-else-if="data.rolling" class="card rollnote">This is a rolling fund, so it has no fund-level terms. Each investment's terms are recorded on the deal (see above, and Investments &amp; AUM).</p>
    <form v-else class="card frm" @submit.prevent="saveTerms">
      <label class="label">Currency<select v-model="tm.currency" :disabled="!isGp"><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option></select></label>
      <label class="label">Target size<input v-model="tm.target_size" inputmode="decimal" :disabled="!isGp"></label>
      <label class="label">Vintage<input v-model="tm.vintage" inputmode="numeric" :disabled="!isGp"></label>
      <label class="label">First close<input v-model="tm.first_close" type="date" :disabled="!isGp"></label>
      <label class="label">Final close<input v-model="tm.final_close" type="date" :disabled="!isGp"></label>
      <label class="label">Term (years)<input v-model="tm.term_years" inputmode="numeric" :disabled="!isGp"></label>
      <label class="label">Management fee (%)<input v-model="tm.mgmt_fee_pct" inputmode="decimal" :disabled="!isGp"></label>
      <label class="label">Carry (%)<input v-model="tm.carry_pct" inputmode="decimal" :disabled="!isGp"></label>
      <label class="label">Hurdle (%)<input v-model="tm.hurdle_pct" inputmode="decimal" :disabled="!isGp"></label>
      <label class="label">Status<select v-model="tm.status" :disabled="!isGp"><option value="raising">Raising</option><option value="investing">Investing</option><option value="harvesting">Harvesting</option><option value="closed">Closed</option></select></label>
      <label class="label">Administrator<select v-model="tm.administrator" :disabled="!isGp"><option v-for="(l, k) in ADMIN" :key="k" :value="k">{{ l }}</option></select></label>
      <label v-if="tm.administrator === 'other'" class="label">Administrator's name<input v-model="tm.administrator_name" maxlength="200" :disabled="!isGp"></label>
      <label v-if="tm.administrator !== 'self'" class="label">Administrator portal link<input v-model="tm.admin_portal_url" maxlength="500" placeholder="https://" :disabled="!isGp"></label>
      <label class="chk wide"><input v-model="tm.notify_lps" type="checkbox" :disabled="!isGp"> Email LPs a Finvry update when a call or distribution is sent{{ tm.administrator !== 'self' ? ' (the administrator sends the official notice)' : '' }}</label>
      <div v-if="isGp" class="row"><button class="btn" type="submit" :disabled="busy">Save terms</button></div>
    </form>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 12px; color: var(--c-muted); } .meta { color: var(--c-muted); margin: 4px 0 18px; text-transform: capitalize; }
.kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 16px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; } .kpi span { font-size: 12.5px; color: var(--c-muted); font-weight: 500; }
.kpi b { font-family: var(--font-heading); font-weight: 500; font-size: 26px; color: var(--c-navy); } .kpi em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.tabs { margin: 8px 0 12px; } .tabs button { font: inherit; background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 2px; margin-right: 20px; cursor: pointer; color: var(--c-muted); } .tabs button.on { color: var(--c-navy); border-bottom-color: var(--c-navy); }
.table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid var(--c-rule); margin-bottom: 14px; }
th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); } td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .n { text-align: right; } tr.off td { opacity: .5; }
.co { color: var(--c-navy); font-weight: 500; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.st { font-size: 13px; font-weight: 500; } .st[data-s="completed"] { color: var(--c-ok); } .st[data-s="sent"], .st[data-s="approved"] { color: var(--c-blue-deep); } .st[data-s="pending_approval"] { color: var(--c-warn); } .st[data-s="draft"], .st[data-s="cancelled"] { color: var(--c-muted); }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; align-items: end; } .frm label { display: flex; flex-direction: column; gap: 6px; } .wide, .row { grid-column: 1 / -1; } .row { display: flex; gap: 14px; align-items: center; } .frm h2 { margin: 0; }
input, select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.hint { font-size: 12.5px; color: var(--c-muted); margin: 0; } .small { font-size: 13px; } .donut { margin-bottom: 14px; max-width: 620px; }
.adm { background: var(--c-signal-soft); padding: 10px 14px; margin: 0 0 16px; font-size: 13px; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; } .adm b { font-weight: 600; color: var(--c-navy); } .adm span { color: var(--c-muted); width: 100%; } .adm.self { background: var(--c-paper-2); }
.chk { display: flex !important; flex-direction: row !important; gap: 8px; align-items: center; font-size: 13px; } .chk input { width: auto; }
.muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(3, 1fr); } .frm { grid-template-columns: 1fr; } }
.rollnote { font-size: 13.5px; color: var(--c-ink-soft); background: var(--c-signal-soft); padding: 10px 14px; margin: 8px 0 14px; } .rdeals { margin: 14px 0; overflow-x: auto; } .rdeals h2 { margin: 0 0 8px; } .rdeals td { vertical-align: top; font-size: 13.5px; } .rdeals .sub { display: block; font-size: 12px; color: var(--c-muted); } .rdeals .n { text-align: right; white-space: nowrap; }
</style>
