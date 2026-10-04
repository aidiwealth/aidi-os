<script setup lang="ts">
// The LP portal: the investor's own position, calls and distributions. Printable as a statement.
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
interface M { dpi: number | null; rvpi: number | null; tvpi: number | null; irr: number | null }
interface D { lp: { name: string }; workspace: { firm: string }
  positions: { fund: string; currency: string; vintage: number | null; navDate: string | null; admin: string | null; adminUrl: string | null; commitment: number; called: number; paidIn: number; unfunded: number; distributed: number; navShare: number; m: M; fundM: M }[]
  history: { fund: string; currency: string; kind: string; number: number; purpose: string | null; due_date: string; amount: string; paid_amount: string; paid_on: string | null }[]
  financials?: { fund: string; period_end: string; period_type: string; currency: string; investments: number | null; cash: number | null; total_assets: number | null; net_income: number | null; opex_total: number | null }[] }
const { data, error } = await useFetch<D>('/api/public/lp/' + token, { key: 'pub-lp-' + token })
useHead({ titleTemplate: '%s', title: () => (data.value ? 'Investor statement · ' + data.value.lp.name + ' — ' + data.value.workspace.firm : 'Investor portal'), meta: [{ name: 'robots', content: 'noindex' }] })
const { money, x, pct, day } = useMoney()
const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const doPrint = () => window.print()
</script>

<template>
  <section class="wrap">
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1><p class="muted">Ask the fund team to send you a new link.</p></div>
    <template v-else-if="data">
      <div class="top"><div><p class="label">Investor statement · {{ today }}</p><h1>{{ data.lp.name }}</h1></div><button class="btn secondary noprint" type="button" @click="doPrint">Print or save as PDF</button></div>
      <div v-for="p in data.positions" :key="p.fund" class="card pos">
        <div class="ph"><h2>{{ p.fund }}</h2><span>{{ p.vintage ? 'Vintage ' + p.vintage : '' }}{{ p.navDate ? ' · valued at ' + day(p.navDate) : '' }}</span></div>
        <dl>
          <div><dt>Your commitment</dt><dd>{{ money(p.commitment, p.currency, true) }}</dd></div><div><dt>Called to date</dt><dd>{{ money(p.called, p.currency, true) }}</dd></div>
          <div><dt>Paid in</dt><dd>{{ money(p.paidIn, p.currency, true) }}</dd></div><div><dt>Unfunded</dt><dd>{{ money(p.unfunded, p.currency, true) }}</dd></div>
          <div><dt>Distributed to you</dt><dd>{{ money(p.distributed, p.currency, true) }}</dd></div><div><dt>Value of your interest</dt><dd>{{ money(p.navShare, p.currency, true) }}</dd></div>
        </dl>
        <p v-if="p.admin" class="offi">Official capital account statements, tax documents and payments come from <b>{{ p.admin }}</b><a v-if="p.adminUrl" :href="p.adminUrl" target="_blank" rel="noopener"> (open {{ p.admin }})</a>.</p>
        <div class="mult"><span>Your DPI <b>{{ x(p.m.dpi) }}</b></span><span>TVPI <b>{{ x(p.m.tvpi) }}</b></span><span>Net IRR <b>{{ pct(p.m.irr) }}</b></span><span class="fm">Fund TVPI {{ x(p.fundM.tvpi) }} · IRR {{ pct(p.fundM.irr) }}</span></div>
      </div>
      <p v-if="!data.positions.length" class="card muted">You have no commitments recorded yet.</p>
      <div v-if="data.history.length" class="card">
        <h2>Capital calls and distributions</h2>
        <table><thead><tr><th>Notice</th><th>Date</th><th class="n">Amount</th><th class="n">Settled</th></tr></thead>
          <tbody><tr v-for="(h, i) in data.history" :key="i"><td>{{ h.kind === 'call' ? 'Capital call' : 'Distribution' }} {{ h.number }}<span class="sub">{{ h.fund }}{{ h.purpose ? ' · ' + h.purpose : '' }}</span></td><td>{{ day(h.due_date) }}</td>
            <td class="n">{{ money(h.amount, h.currency, true) }}</td><td class="n">{{ money(h.paid_amount, h.currency, true) }}<span v-if="h.paid_on" class="sub">{{ day(h.paid_on) }}</span></td></tr></tbody></table>
      </div>
      <div v-if="data.financials?.length" class="card">
        <h2>Fund financials</h2>
        <table><thead><tr><th>Fund · period</th><th class="n">Investments</th><th class="n">Cash</th><th class="n">Total assets</th><th class="n">Operating costs</th><th class="n">Net income</th></tr></thead>
          <tbody><tr v-for="(f, i) in data.financials" :key="i"><td>{{ f.fund }}<span class="sub">{{ f.period_type === 'year' ? 'Year' : f.period_type === 'quarter' ? 'Quarter' : 'Month' }} to {{ day(f.period_end) }}</span></td>
            <td class="n">{{ f.investments == null ? '—' : money(f.investments, f.currency) }}</td><td class="n">{{ f.cash == null ? '—' : money(f.cash, f.currency) }}</td><td class="n">{{ f.total_assets == null ? '—' : money(f.total_assets, f.currency) }}</td>
            <td class="n">{{ f.opex_total == null ? '—' : money(f.opex_total, f.currency) }}</td><td class="n">{{ f.net_income == null ? '—' : money(f.net_income, f.currency) }}</td></tr></tbody></table>
      </div>
      <p class="fine">Unaudited summary for information only, based on the latest valuation the fund has recorded. It is not an official capital account statement. Prepared by {{ data.workspace.firm }}.</p>
    </template>
  </section>
</template>

<style scoped>
.wrap { max-width: 880px; margin: 0 auto; } .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 18px; }
.pos { margin-bottom: 14px; } .ph { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; } .ph span { font-size: 13px; color: var(--c-muted); }
dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 18px; margin: 14px 0; } dt { font-size: 12.5px; color: var(--c-muted); } dd { margin: 3px 0 0; font-family: var(--font-heading); font-size: 22px; color: var(--c-navy); font-variant-numeric: tabular-nums; }
.mult { display: flex; gap: 22px; flex-wrap: wrap; border-top: 1px solid var(--c-rule); padding-top: 12px; font-size: 13.5px; } .mult b { font-weight: 600; color: var(--c-navy); } .fm { margin-left: auto; color: var(--c-muted); }
table { width: 100%; border-collapse: collapse; margin-top: 10px; } th { text-align: left; font-size: 12px; color: var(--c-muted); font-weight: 500; padding: 8px 0; border-bottom: 1px solid var(--c-rule); }
td { padding: 9px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; vertical-align: top; } .n { text-align: right; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.fine { font-size: 12px; color: var(--c-muted); margin-top: 16px; } .offi { font-size: 13px; background: var(--c-paper-2); padding: 8px 12px; margin: 0 0 12px; } .offi b { font-weight: 600; } .muted { color: var(--c-muted); }
@media (max-width: 640px) { dl { grid-template-columns: 1fr 1fr; } }
@media print { .noprint { display: none; } .card { break-inside: avoid; } }
</style>
