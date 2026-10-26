<script setup lang="ts">
useHead({ title: 'Funds' })
interface F { entity_id: string; name: string; fund_id: string | null; currency?: string; status?: string; vintage?: number | null; target?: number; lps?: number; rolling?: boolean; administrator?: string | null; deals?: { companies: number; invested: number; value: number; realized: number; coInvestors: number } | null
  totals?: { committed: number; called: number; paidIn: number; distributed: number; nav: number; calledPct: number }; m?: { dpi: number | null; tvpi: number | null; irr: number | null } }
// Fetched together, not one after another (each wait is a round trip to the server).
const [__p540_0, __p540_1] = await Promise.all([
  useFetch<F[]>('/api/funds'),
  useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })])
const { data, refresh } = __p540_0
const { data: me } = __p540_1
const isGp = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const { money, x, pct } = useMoney()
const setup = reactive({ structure: 'closed_end', entity_id: '', name: '', currency: 'USD', target_size: '', vintage: String(new Date().getFullYear()), status: 'raising', administrator: 'self' })
const msg = ref('')
async function doSetup() {
  msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/funds/setup', { method: 'POST', body: { ...setup, entity_id: setup.entity_id && setup.entity_id !== 'new' ? setup.entity_id : undefined, name: setup.entity_id === 'new' || !setup.entity_id ? setup.name : undefined } }); await navigateTo('/funds/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not set up the fund.' }
}
const pending = computed(() => (data.value ?? []).filter((f) => !f.fund_id))
const STATUS: Record<string, string> = { raising: 'Raising', investing: 'Investing', harvesting: 'Harvesting', closed: 'Closed' }
void refresh
const setupOpen = ref(false)
// LP fundraising: pipelines for each fund raise, debt facility or co-investment.
interface PL { id: string; name: string; kind: string; currency: string; target: number | null; target_close: string | null; status: string; fund: string | null; deal: string | null; company: string | null; lps: number; committed: number; closed: number; in_play: number }
const { data: pls } = await useFetch<{ pipelines: PL[] }>('/api/funds/pipelines', { default: () => ({ pipelines: [] }) })
const plOpen = ref(false)
const PK: Record<string, string> = { fund: 'Fund raise', debt: 'Debt facility', co_invest: 'Co-investment / SPV' }
const live = computed(() => (data.value ?? []).filter((f) => f.fund_id))
const cur = computed(() => live.value[0]?.currency ?? 'USD')
const sumT = (k: 'committed' | 'distributed' | 'paidIn') => live.value.reduce((a, f) => a + (f.totals?.[k] ?? 0), 0)
const lpCount = computed(() => live.value.reduce((a, f) => a + (f.lps ?? 0), 0))
const coInv = computed(() => live.value.reduce((a, f) => a + (f.deals?.coInvestors ?? 0), 0))
const invested = computed(() => live.value.reduce((a, f) => a + (f.rolling ? f.deals?.invested ?? 0 : f.totals?.paidIn ?? 0), 0))
const realized = computed(() => live.value.reduce((a, f) => a + (f.deals?.realized ?? 0), 0))
const companies = computed(() => live.value.reduce((a, f) => a + (f.deals?.companies ?? 0), 0))
</script>

<template>
  <section v-if="data">
    <p class="label">Venture Capital</p>
    <div class="head"><h1>Funds &amp; LPs</h1><div class="tools"><NuxtLink to="/funds/prospects" class="btn secondary">LP prospects</NuxtLink><NuxtLink to="/funds/lps" class="btn secondary">LP register</NuxtLink><button v-if="isGp" class="btn secondary" type="button" @click="plOpen = true">New LP pipeline</button><button v-if="isGp" class="btn" type="button" @click="setupOpen = true">{{ pending.length ? 'Set up a fund' : 'Add a fund' }}</button></div></div>
    <div v-if="live.length" class="fx-stats five">
      <StatTile icon="briefcase" tone="n" label="Funds" :value="live.length" full :note="live.filter((f) => f.rolling).length ? live.filter((f) => f.rolling).length + ' deal by deal' : 'Closed-end'" />
      <StatTile icon="users" tone="b" label="LPs" :value="lpCount" full :note="coInv ? coInv + ' co-investors on deals' : 'With a commitment'" />
      <StatTile icon="money" tone="n" label="Committed" :value="money(sumT('committed'), cur)" :note="'Across ' + live.length + ' fund' + (live.length === 1 ? '' : 's')" />
      <StatTile icon="chart" tone="c" label="Invested" :value="money(invested, cur)" :note="companies + ' compan' + (companies === 1 ? 'y' : 'ies')" />
      <StatTile icon="billing" tone="a" label="Distributed" :value="money(sumT('distributed') + realized, cur)" :note="sumT('distributed') + realized ? 'Paid back to LPs' : 'Nothing yet'" />
    </div>
    <div class="grid">
      <NuxtLink v-for="f in live" :key="f.entity_id" :to="'/funds/' + f.fund_id" class="card fund">
        <div class="fh"><div><h2>{{ f.name }}</h2><span class="ty">{{ f.rolling ? 'Deal by deal' : 'Closed-end fund' }}<template v-if="f.vintage"> · {{ f.rolling ? 'since' : 'vintage' }} {{ f.vintage }}</template><template v-if="f.administrator"> · {{ f.administrator }}</template></span></div><span class="pill" :data-s="f.status">{{ STATUS[f.status ?? ''] }}</span></div>
        <template v-if="f.rolling && f.deals">
          <div class="hl"><div><em>Invested</em><b>{{ money(f.deals.invested, f.currency) }}</b></div><div><em>Value now</em><b>{{ money(f.deals.value, f.currency) }}</b></div><div><em>Multiple</em><b>{{ f.deals.invested ? ((f.deals.value + f.deals.realized) / f.deals.invested).toFixed(2) + 'x' : '—' }}</b></div></div>
          <dl><div><dt>Companies</dt><dd>{{ f.deals.companies }}</dd></div><div><dt>Co-investors</dt><dd>{{ f.deals.coInvestors }}</dd></div><div><dt>LPs</dt><dd>{{ f.lps }}</dd></div><div><dt>Committed</dt><dd>{{ money(f.totals!.committed, f.currency) }}</dd></div><div><dt>Realized</dt><dd>{{ money(f.deals.realized, f.currency) }}</dd></div></dl>
        </template>
        <template v-else>
          <div class="hl"><div><em>Committed</em><b>{{ money(f.totals!.committed, f.currency) }}</b></div><div v-if="f.target"><em>Target</em><b class="lt">{{ money(f.target, f.currency) }}</b></div><div><em>Called</em><b>{{ f.totals!.called ? pct(f.totals!.calledPct) : '—' }}</b></div></div>
          <div v-if="f.target" class="prog"><div class="tr"><i :style="{ width: Math.min(100, (f.totals!.committed / f.target) * 100) + '%' }" /></div><span>{{ Math.round((f.totals!.committed / f.target) * 100) }}% of target committed</span></div>
          <dl><div><dt>LPs</dt><dd>{{ f.lps }}</dd></div><div><dt>Paid in</dt><dd>{{ money(f.totals!.paidIn, f.currency) }}</dd></div><div><dt>Distributed</dt><dd>{{ money(f.totals!.distributed, f.currency) }}</dd></div><div><dt>TVPI</dt><dd>{{ x(f.m!.tvpi) }}</dd></div><div><dt>Net IRR</dt><dd>{{ pct(f.m!.irr) }}</dd></div></dl>
        </template>
      </NuxtLink>
      <button v-if="isGp && pending.length" type="button" class="card fund add" @click="setupOpen = true"><b>{{ pending.length }} fund{{ pending.length === 1 ? '' : 's' }} not set up</b><span>{{ pending.map((p) => p.name).join(', ') }}</span><em>Set up →</em></button>
    </div>
    <div class="lph"><h2>LP fundraising</h2><span class="muted">Fund raises, debt facilities and co-investments, with each LP's stage and likelihood. <NuxtLink to="/funds/prospects">LP prospects</NuxtLink></span></div>
    <div v-if="pls?.pipelines.length" class="pls"><NuxtLink v-for="p in pls.pipelines" :key="p.id" :to="'/funds/pipelines/' + p.id" class="card plc"><div class="fh"><div><b>{{ p.name }}</b><span class="ty">{{ PK[p.kind] }}{{ p.fund ? ' · ' + p.fund : '' }}{{ p.deal || p.company ? ' · ' + (p.company ?? p.deal) : '' }}</span></div><span class="pill" :data-s="p.status === 'open' ? 'raising' : ''">{{ p.status === 'open' ? 'Open' : 'Closed' }}</span></div>
      <div class="pln"><div><em>Committed</em><b>{{ money(p.committed, p.currency) }}</b></div><div><em>In play</em><b>{{ money(p.in_play, p.currency) }}</b></div><div><em>LPs</em><b>{{ p.lps }}</b></div></div>
      <div v-if="p.target" class="prog"><div class="tr"><i :style="{ width: Math.min(100, p.committed / p.target * 100) + '%' }" /></div><span>{{ Math.round(p.committed / p.target * 100) }}% of {{ money(p.target, p.currency) }}</span></div></NuxtLink></div>
    <p v-else class="muted lpe">No LP pipelines yet. <button v-if="isGp" class="lnk" type="button" @click="plOpen = true">Start one</button> for a fund raise, a debt facility or a co-investment, then import your LP tracker or find LPs with AI.</p>
    <LpPipelineForm :open="plOpen" @close="plOpen = false" @saved="(id: string) => navigateTo('/funds/pipelines/' + id)" />
    <EmptyState v-if="!live.length" card icon="funds" title="Set up your first fund" text="Track each fund's LPs and commitments, capital calls (with two-GP approval), distributions and NAV, with DPI, TVPI and net IRR per fund and per LP. Every LP gets a private, read-only portal."><button v-if="isGp" class="btn" @click="setupOpen = true">Set up a fund</button></EmptyState>
    <AppModal :open="setupOpen" :title="pending.length ? 'Set up a fund' : 'Add a fund'" wide @close="setupOpen = false"><form v-if="isGp" class="frm mfund" @submit.prevent="doSetup">
      <h2 class="wide">{{ pending.length ? 'Set up a fund' : 'Add a fund' }}</h2>
      <label v-if="pending.length" class="label">Fund<select v-model="setup.entity_id" required><option value="" disabled>Choose</option><option v-for="f in pending" :key="f.entity_id" :value="f.entity_id">{{ f.name }}</option><option value="new">New fund…</option></select></label>
      <label v-if="!pending.length || setup.entity_id === 'new'" class="label">Fund name<input v-model="setup.name" required maxlength="200" placeholder="e.g. Acme Ventures Fund I"></label>
      <label class="label">Currency<select v-model="setup.currency"><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option></select></label>
      <label class="label">Target size<input v-model="setup.target_size" inputmode="decimal"></label>
      <label class="label">Vintage<input v-model="setup.vintage" inputmode="numeric"></label>
      <label class="label">Structure<select v-model="setup.structure"><option value="closed_end">Closed-end (fund terms)</option><option value="rolling">Rolling (terms per deal)</option></select></label><label class="label">Status<select v-model="setup.status"><option value="raising">Raising</option><option value="investing">Investing</option><option value="harvesting">Harvesting</option><option value="closed">Closed</option></select></label>
      <label class="label">Administrator<select v-model="setup.administrator"><option value="self">Self-administered</option><option value="sydecar">Sydecar</option><option value="carta">Carta</option><option value="angellist">AngelList</option><option value="other">Other</option></select></label>
      <p class="hint">Aidi tracks your LPs, calls, distributions and performance. Formation, KYC, money movement, tax and filings stay with your administrator and lawyers.</p>
      <div class="row"><button class="btn" type="submit">Set up fund</button><span v-if="msg" class="error">{{ msg }}</span></div>
    </form></AppModal>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px; } .head h1 { margin: 0; } .tools { display: flex; gap: 8px; } .tools a { text-decoration: none; }
.five { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; margin-bottom: 18px; }
.fund { text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 14px; padding: 20px 22px; transition: border-color .12s; } .fund:hover { border-color: var(--c-navy); text-decoration: none; }
.fh { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; } .fh h2 { margin: 0 0 2px; font-size: 19px; } .ty { font-size: 12.5px; color: var(--c-muted); }
.pill { font-size: 11.5px; font-weight: 600; padding: 3px 9px; background: var(--c-paper-2); color: var(--c-ink-soft); white-space: nowrap; } .pill[data-s="raising"] { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pill[data-s="investing"] { background: var(--c-navy); color: #fff; }
.hl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; } .hl > div { display: flex; flex-direction: column; gap: 2px; } .hl > div + div { padding-left: 16px; border-left: 1px solid var(--c-rule); }
.hl em { font-style: normal; font-size: 12px; color: var(--c-muted); } .hl b { font-family: var(--font-heading); font-size: 24px; font-weight: 500; color: var(--c-navy); letter-spacing: -.02em; font-variant-numeric: tabular-nums; } .hl b.lt { color: var(--c-muted); }
.prog { display: flex; flex-direction: column; gap: 6px; } .tr { height: 4px; background: var(--c-paper-2); } .tr i { display: block; height: 100%; background: var(--c-navy); } .prog span { font-size: 12px; color: var(--c-muted); }
dl { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 0; border-top: 1px solid var(--c-rule); padding-top: 12px; } dt { font-size: 11.5px; color: var(--c-muted); } dd { margin: 2px 0 0; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--c-ink); }
.add { border-style: dashed; background: none; font: inherit; text-align: left; cursor: pointer; justify-content: center; gap: 6px; } .add b { color: var(--c-navy); } .add span { font-size: 13px; color: var(--c-muted); } .add em { font-style: normal; font-size: 13px; color: var(--c-blue-deep); }
.frm { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; align-items: end; } .hint { grid-column: 1 / -1; font-size: 12.5px; color: var(--c-muted); margin: 0; } .frm label { display: flex; flex-direction: column; gap: 6px; } .wide, .row { grid-column: 1 / -1; } .row { display: flex; gap: 12px; align-items: center; }
input, select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.muted { color: var(--c-muted); }
.lph { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin: 22px 0 10px; } .lph h2 { margin: 0; font-size: 18px; } .lph .muted { font-size: 13px; } .lph a { color: var(--c-blue-deep); }
.pls { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; margin-bottom: 18px; } .plc { text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; } .plc:hover { border-color: var(--c-navy); text-decoration: none; } .plc b { display: block; font-size: 16px; }
.pln { display: grid; grid-template-columns: repeat(3, 1fr); } .pln em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .pln b { font-size: 17px; font-weight: 500; color: var(--c-navy); } .lpe { font-size: 13.5px; margin: 0 0 18px; } .lnk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .error { color: var(--c-danger); }
@media (max-width: 1100px) { .five { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; } }
@media (max-width: 900px) { .frm { grid-template-columns: 1fr 1fr; } dl { grid-template-columns: repeat(3, 1fr); } .grid { grid-template-columns: 1fr; } .five { grid-template-columns: 1fr 1fr !important; } }
.frm.mfund { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 14px 16px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: none !important; } .frm.mfund > h2 { display: none !important; } .frm.mfund label { display: flex !important; flex-direction: column; gap: 6px; grid-column: auto !important; } .frm.mfund input, .frm.mfund select { width: 100%; box-sizing: border-box; } .frm.mfund .hint, .frm.mfund .row { grid-column: 1 / -1 !important; } .frm.mfund .hint { font-size: 12.5px; color: var(--c-muted); margin: 0; }
</style>
