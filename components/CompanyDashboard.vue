<script setup lang="ts">
// The founder's home: how the company is doing, what needs attention, and the next steps.
type R = Record<string, number | null> & { period: string; currency: string }
interface D { company: string; first: string; currency: string; plan: string; status: string; last: R | null; growth: number | null; series: R[]; mix: { label: string; value: number }[]
  due: { id: string; title: string; next_due: string; overdue: boolean }[]; page: { slug: string; published: boolean; views: number } | null; shares: { n: number; views: number }
  services: { open: number; waiting: number; unpaid: number }; wallet: { currency: string; balance_minor: number }; setup: { label: string; done: boolean; to: string }[] }
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

    <div v-if="done < data.setup.length" class="card setup"><button type="button" class="sh" :aria-expanded="!folded" @click="fold"><b>Get set up</b><span>{{ done }} of {{ data.setup.length }} done</span><svg class="chev" :class="{ up: !folded }" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l5 5 5-5" /></svg></button><div class="bar"><i :style="{ width: (done / data.setup.length) * 100 + '%' }" /></div>
      <template v-if="!folded"><NuxtLink v-for="s in data.setup" :key="s.label" :to="s.to" class="step" :class="{ ok: s.done }"><span class="tick">{{ s.done ? '✓' : '' }}</span>{{ s.label }}</NuxtLink></template></div>

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
    <EmptyState v-else card icon="financials" title="Your numbers will show here" text="Upload your monthly P&amp;L or management accounts in Financials (we read the spreadsheet for you), and this dashboard fills with revenue, growth, burn, runway and charts."><NuxtLink to="/financials" class="btn">Add your first month</NuxtLink></EmptyState>

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
</style>
