<script setup lang="ts">
// The founder's home: how the company is doing, what needs attention, and the next steps.
type R = Record<string, number | null> & { period: string; currency: string }
interface D { company: string; first: string; currency: string; plan: string; status: string; last: R | null; growth: number | null; series: R[]; mix: { label: string; value: number }[]
  due: { id: string; title: string; next_due: string; overdue: boolean }[]; page: { slug: string; published: boolean; views: number } | null; shares: { n: number; views: number }
  services: { open: number; waiting: number; unpaid: number }; wallet: { currency: string; balance_minor: number }; setup: { key?: string; label: string; desc?: string; cta?: string; mins?: number; done: boolean; to: string }[] }
const { data } = await useFetch<D>('/api/company/dashboard')
useHead({ title: 'Dashboard' })
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const lbl = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pts = (k: string) => (data.value?.series ?? []).filter((r) => r[k] != null).map((r) => ({ label: lbl(r.period), value: r[k] as number }))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const hour = new Date().getHours()
const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
const done = computed(() => (data.value?.setup ?? []).filter((s) => s.done).length)
const folded = ref(false)
onMounted(() => { folded.value = localStorage.getItem('finvry-setup-folded') === '1' })
function fold() { folded.value = !folded.value; try { localStorage.setItem('finvry-setup-folded', folded.value ? '1' : '0') } catch { /* private mode */ } }
</script>

<template>
  <section v-if="data" class="cd">
    <div class="hd"><div><p class="label">{{ data.company }}</p><h1>{{ greet }}, {{ data.first }}</h1></div>
      <div class="qa"><NuxtLink to="/financials" class="btn">Add financials</NuxtLink><NuxtLink to="/investor-page" class="btn secondary">Investor page</NuxtLink><NuxtLink to="/client/order" class="btn secondary">Order a service</NuxtLink></div></div>

    <div v-if="done < data.setup.length" class="onb">
      <div class="oh"><div><p class="ol">Getting started</p><h2>Set up Finvry <span>{{ done }} of {{ data.setup.length }} done</span></h2></div><button type="button" class="ofold" :aria-expanded="!folded" @click="fold">{{ folded ? 'Show steps' : 'Hide' }}</button></div>
      <div class="obar"><i :style="{ width: Math.round((done / data.setup.length) * 100) + '%' }" /></div>
      <div v-if="!folded" class="ogrid"><div v-for="(s, i) in data.setup" :key="s.label" class="ostep" :class="{ ok: s.done, next: !s.done && data.setup.findIndex((x) => !x.done) === i }">
        <span class="onum">{{ s.done ? '✓' : i + 1 }}</span><div class="otx"><b>{{ s.label }}</b><p v-if="s.desc">{{ s.desc }}</p><span v-if="!s.done && s.mins" class="omin">About {{ s.mins }} min</span></div>
        <NuxtLink v-if="!s.done" :to="s.to" class="octa" :class="{ pri: data.setup.findIndex((x) => !x.done) === i }">{{ s.cta ?? 'Start' }} →</NuxtLink><span v-else class="odone">Done</span></div></div>
    </div>

    <div class="kpis">
      <div class="kpi"><span class="l">Revenue{{ data.last ? ' · ' + lbl(data.last.period) : '' }}</span><b><Money :value="data.last?.revenue" :currency="data.currency" /></b><span class="s" :class="{ up: (data.growth ?? 0) > 0, dn: (data.growth ?? 0) < 0 }">{{ data.growth == null ? 'Month-on-month growth appears after two months' : (data.growth > 0 ? '+' : '') + data.growth + '% vs last month' }}</span></div>
      <div class="kpi"><span class="l">Net income</span><b><Money :value="data.last?.net_income" :currency="data.currency" /></b><span class="s">Gross margin {{ data.last?.gross_margin == null ? '—' : data.last.gross_margin + '%' }}</span></div>
      <div class="kpi"><span class="l">Cash</span><b><Money :value="data.last?.cash" :currency="data.currency" /></b><span class="s">{{ data.last?.runway ? data.last.runway + ' months runway' : data.last?.burn === 0 ? 'Cash-flow positive' : 'Runway appears with cash and burn' }}</span></div>
      <div class="kpi"><span class="l">Monthly burn</span><b><Money :value="data.last?.burn" :currency="data.currency" /></b><span class="s">Operating costs <Money :value="data.last?.opex_total" :currency="data.currency" /></span></div>
    </div>

    <template v-if="data.series.length">
      <div class="charts">
        <TrendChart title="Revenue" unit="usd" :symbol="SYM[data.currency] ?? data.currency + ' '" :points="pts('revenue')" :foot="data.series.length + ' months'" />
        <TrendChart title="Net income" unit="usd" :symbol="SYM[data.currency] ?? data.currency + ' '" :points="pts('net_income')" foot="After all costs" />
        <TrendChart title="Cash" unit="usd" :symbol="SYM[data.currency] ?? data.currency + ' '" :points="pts('cash')" foot="Month end" />
      </div>
    </template>
    <div v-else class="preview"><div class="pv-art" aria-hidden="true"><div class="pv-k" v-for="k in ['Revenue', 'Gross margin', 'Cash', 'Runway']" :key="k"><span>{{ k }}</span><b /></div><svg viewBox="0 0 600 140" preserveAspectRatio="none"><path d="M0 120 C60 112 100 104 160 96 S260 90 300 74 S400 58 440 46 S540 22 600 14" fill="none" stroke="#0c1a2e" stroke-width="3"/><path d="M0 120 C60 112 100 104 160 96 S260 90 300 74 S400 58 440 46 S540 22 600 14 L600 140 L0 140Z" fill="rgba(95,168,211,.18)"/></svg></div>
      <div class="pv-cta"><p class="ol">Your dashboard</p><h3>Your numbers will fill this in.</h3><p>Add one month of figures and you get revenue, growth, margins, burn, runway and trend charts, ready to share with investors.</p><div class="pv-acts"><NuxtLink to="/financials" class="btn">Add your first month</NuxtLink><NuxtLink to="/integrations/quickbooks/connect" class="btn secondary">Connect QuickBooks</NuxtLink></div></div></div>

    <ClientOnly><BankFeeds compact class="feeds" /></ClientOnly>
    <div class="three">
      <div class="card"><DonutChart v-if="data.mix.some((m) => m.value > 0)" title="Where the money goes" total-label="Costs this month" :currency="data.currency" :segments="data.mix" /><template v-else><h3>Where the money goes</h3><p class="muted">Your cost mix appears once you add costs.</p></template></div>
      <div class="card"><h3>Investors</h3>
        <div class="li"><span>Investor page</span><b>{{ data.page?.published ? 'Live' : 'Not published' }}</b></div>
        <div class="li"><span>Investor page views</span><b>{{ data.page?.views ?? 0 }}</b></div>
        <div class="li"><span>Active share links</span><b>{{ data.shares.n }} · {{ data.shares.views }} views</b></div>
        <NuxtLink to="/investor-page" class="more">{{ data.page?.published ? 'Edit your investor page →' : 'Publish your investor page →' }}</NuxtLink></div>
      <div class="card"><h3>Coming up</h3>
        <div v-for="d in data.due" :key="d.id" class="li"><span>{{ d.title }}</span><b :class="{ red: d.overdue }">{{ d.overdue ? 'Overdue' : day(d.next_due) }}</b></div>
        <p v-if="!data.due.length" class="muted">Nothing due in the next 60 days.</p>
        <div class="li"><span>Open service requests</span><b>{{ data.services.open }}{{ data.services.waiting ? ' · ' + data.services.waiting + ' need you' : '' }}</b></div>
        <div class="li"><span>Unpaid invoices</span><b :class="{ red: data.services.unpaid }">{{ data.services.unpaid }}</b></div>
        <div class="li"><span>Wallet balance</span><b><NuxtLink to="/wallet"><Money :value="data.wallet.balance_minor / 100" :currency="data.wallet.currency" /></NuxtLink></b></div>
        <NuxtLink to="/client" class="more">Services →</NuxtLink></div>
    </div>
  </section>
</template>

<style scoped>
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; } .hd h1 { margin: 0; } .qa { display: flex; gap: 8px; flex-wrap: wrap; } .qa a { text-decoration: none; }
.setup { margin-bottom: 14px; display: flex; flex-direction: column; gap: 8px; } .sh { display: flex; justify-content: space-between; align-items: center; gap: 10px; background: none; border: 0; padding: 0; font: inherit; cursor: pointer; width: 100%; text-align: left; color: inherit; } .sh span { margin-left: auto; } .chev { width: 18px; height: 18px; color: var(--c-muted); transition: transform .15s; } .chev.up { transform: rotate(180deg); } .sh span { font-size: 13px; color: var(--c-muted); }
.bar { height: 5px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-blue-deep); }
.step { display: flex; align-items: center; gap: 10px; color: var(--c-ink); text-decoration: none; font-size: 14px; padding: 4px 0; } .step.ok { color: var(--c-muted); text-decoration: line-through; }
.tick { width: 18px; height: 18px; border: 1px solid var(--c-rule-strong); display: grid; place-items: center; font-size: 12px; color: var(--c-ok); } .step.ok .tick { border-color: var(--c-ok); }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; } .kpi { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
.kpi .l { font-size: 13px; color: var(--c-muted); } .kpi b { font-size: 28px; font-weight: 600; } .kpi .s { font-size: 12.5px; color: var(--c-muted); } .s.up { color: var(--c-ok); } .s.dn { color: var(--c-danger); }
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; } .empty { margin-bottom: 12px; } .empty p { color: var(--c-ink-soft); max-width: 680px; } .empty a { text-decoration: none; }
.three { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 12px; margin-top: 16px; } .three h3 { margin: 0 0 10px; } .li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .li span { color: var(--c-ink-soft); } .li b { font-weight: 500; } .red { color: var(--c-danger); }
.more { display: inline-block; margin-top: 10px; font-size: 13.5px; } .muted { color: var(--c-muted); font-size: 13.5px; }
@media (max-width: 1000px) { .kpis { grid-template-columns: 1fr 1fr; } .charts, .three { grid-template-columns: 1fr; } }
.feeds { margin-top: 16px; }
.onb { background: #fff; border: 1px solid var(--c-rule); padding: 24px 26px; margin-bottom: 16px; } .oh { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.ol { margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--c-blue-deep); } .oh h2 { margin: 0; font-size: 22px; letter-spacing: -.02em; } .oh h2 span { font-size: 14px; font-weight: 400; color: var(--c-muted); margin-left: 8px; }
.ofold { background: none; border: 0; color: var(--c-muted); font: inherit; font-size: 13px; cursor: pointer; } .obar { height: 4px; background: var(--c-paper-2); margin: 16px 0 6px; } .obar i { display: block; height: 100%; background: var(--c-navy); transition: width .4s; }
.ogrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 0; border-top: 1px solid var(--c-rule); margin-top: 14px; } .ostep { display: grid; grid-template-columns: 30px 1fr auto; gap: 12px; align-items: start; padding: 16px 14px 16px 0; border-bottom: 1px solid var(--c-rule); }
.onum { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--c-rule-strong); font-size: 13px; font-weight: 600; color: var(--c-muted); } .ostep.next .onum { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } .ostep.ok .onum { background: rgba(31,122,77,.1); border-color: transparent; color: var(--c-ok); }
.otx b { display: block; font-size: 15px; color: var(--c-ink); } .ostep.ok .otx b { color: var(--c-muted); text-decoration: line-through; text-decoration-color: rgba(0,0,0,.2); } .otx p { margin: 3px 0 0; font-size: 13px; color: var(--c-muted); line-height: 1.45; } .omin { display: inline-block; margin-top: 6px; font-size: 11.5px; color: var(--c-muted); background: var(--c-paper-2); padding: 1px 7px; } .ostep.ok .otx p { display: none; }
.octa { font-size: 13px; font-weight: 600; text-decoration: none; color: var(--c-blue-deep); white-space: nowrap; padding-top: 4px; } .octa.pri { background: var(--c-navy); color: #fff; padding: 7px 12px; } .odone { font-size: 12.5px; color: var(--c-ok); padding-top: 4px; }
.preview { display: grid; grid-template-columns: 1.2fr 1fr; border: 1px solid var(--c-rule); background: #fff; margin: 14px 0; overflow: hidden; } .pv-art { position: relative; padding: 22px; background: linear-gradient(180deg, #f7f9fb, #fff); filter: saturate(.9); }
.pv-art:after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(255,255,255,0) 55%, #fff); } .pv-k { display: inline-flex; flex-direction: column; gap: 8px; width: calc(25% - 8px); margin-right: 8px; padding: 12px; border: 1px solid var(--c-rule); background: #fff; font-size: 11.5px; color: var(--c-muted); } .pv-k b { display: block; height: 14px; width: 70%; background: #e6ebf1; }
.pv-art svg { width: 100%; height: 140px; margin-top: 16px; display: block; } .pv-cta { padding: 30px 30px 30px 10px; display: flex; flex-direction: column; justify-content: center; } .pv-cta h3 { margin: 0 0 8px; font-size: 22px; letter-spacing: -.02em; } .pv-cta p { margin: 0; color: var(--c-muted); font-size: 14.5px; } .pv-acts { display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
@media (max-width: 900px) { .preview { grid-template-columns: 1fr; } .pv-cta { padding: 22px; } }
</style>
