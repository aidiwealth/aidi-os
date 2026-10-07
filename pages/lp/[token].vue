<script setup lang="ts">
// The LP portal: the investor's own position, calls and distributions. Printable as a statement.
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
interface M { dpi: number | null; rvpi: number | null; tvpi: number | null; irr: number | null }
interface Deal { id: string; company: string; one_liner: string; sector: string | null; stage: string; country: string | null; raising_usd: number | null; received_at: string; website: string | null; score: number | null; recommendation: string | null; interested: boolean; funding_type?: string; credit?: { amount: number; currency: string; tenor: number | null; status: string; business: { score: number; band: string; source: string } | null; founders: { name: string; score: number; band: string }[] | null } | null }
interface D { participations?: { fund: string; currency: string; deals: { company: string; instrument: string | null; cap: number | null; amount: number; status: string; value: number | null; realized: number | null }[] }[]; preview?: boolean; deals?: Deal[]; lp: { name: string }; workspace: { firm: string }
  positions: { fund: string; currency: string; vintage: number | null; navDate: string | null; admin: string | null; adminUrl: string | null; commitment: number; called: number; paidIn: number; unfunded: number; distributed: number; navShare: number; m: M; fundM: M }[]
  history: { fund: string; currency: string; kind: string; number: number; purpose: string | null; due_date: string; amount: string; paid_amount: string; paid_on: string | null }[]
  financials?: { fund: string; period_end: string; period_type: string; currency: string; investments: number | null; cash: number | null; total_assets: number | null; net_income: number | null; opex_total: number | null }[] }
const { data, error } = await useFetch<D>('/api/public/lp/' + token, { key: 'pub-lp-' + token })
useHead({ titleTemplate: '%s', title: () => (data.value ? 'Investor statement · ' + data.value.lp.name + ' — ' + data.value.workspace.firm : 'Investor portal'), meta: [{ name: 'robots', content: 'noindex' }] })
const { money, x, pct, day } = useMoney()
const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const doPrint = () => {
  const d = data.value; if (!d) return
  const mm = (v: number | null | undefined, c: string) => (v == null ? '-' : money(v, c))
  const md: string[] = ['## Investor statement', '', '**' + d.lp.name + '**', '', today, '']
  for (const p of d.positions) md.push('## ' + p.fund, '', '| Committed | Called | Paid in | Unfunded | Distributed | Share of NAV |', '|---|---|---|---|---|---|', '| ' + [p.commitment, p.called, p.paidIn, p.unfunded, p.distributed, p.navShare].map((v) => mm(v, p.currency)).join(' | ') + ' |', '')
  for (const pt of d.participations ?? []) { md.push('## ' + pt.fund + ' (deal by deal)', '', '| Company | Terms | Invested | Estimated value | Status |', '|---|---|---|---|---|'); for (const x of pt.deals) md.push('| ' + [x.company, (x.instrument ?? '-') + (x.cap ? ' cap ' + mm(x.cap, pt.currency) : ''), mm(x.amount, pt.currency), mm(x.value, pt.currency) + (x.realized ? ' + ' + mm(x.realized, pt.currency) + ' realized' : ''), x.status].join(' | ') + ' |'); md.push('') }
  if (d.history.length) { md.push('## Capital calls and distributions', '', '| Fund | Type | Due | Amount | Paid |', '|---|---|---|---|---|'); for (const h of d.history) md.push('| ' + [h.fund, h.kind + ' #' + h.number, h.due_date, mm(Number(h.amount), h.currency), h.paid_on ? mm(Number(h.paid_amount), h.currency) + ' on ' + h.paid_on : '-'].join(' | ') + ' |'); md.push('') }
  md.push('', 'Figures as reported by ' + d.workspace.firm + '. This statement is for information only.')
  downloadPdf({ kind: 'doc', title: 'Investor statement - ' + d.lp.name, company: d.workspace.firm, md: md.join('\n') }, true)
}
const STAGE: Record<string, string> = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', later: 'Later stage' }
const sent = ref<string[]>([]); const iErr = ref('')
async function interested(d: Deal) { iErr.value = ''; const note = prompt('Anything to add for the fund team? (optional)') ?? ''; try { await $fetch('/api/public/lp/' + token + '/interest', { method: 'POST', body: { pitch_id: d.id, note } }); sent.value.push(d.id) } catch (e) { iErr.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send.' } }
</script>

<template>
  <section class="wrap">
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1><p class="muted">Ask the fund team to send you a new link.</p></div>
    <template v-else-if="data">
      <div v-if="data.preview" class="pvbar noprint">Preview: this is exactly what {{ data.lp.name }} sees. Read-only; the link expires in 30 minutes.</div>
      <div class="top"><div><p class="label">Investor statement · {{ today }}</p><h1>{{ data.lp.name }}</h1></div><button class="btn secondary noprint" type="button" @click="doPrint">Download PDF</button></div>
      <div v-for="pt in data.participations ?? []" :key="pt.fund" class="card pos"><div class="ph"><h2>{{ pt.fund }}</h2><span>Deal by deal</span></div>
        <table><thead><tr><th>Company</th><th>Terms</th><th>Invested</th><th>Estimated value</th><th>Status</th></tr></thead><tbody><tr v-for="d in pt.deals" :key="d.company"><td>{{ d.company }}</td><td>{{ d.instrument ?? '—' }}{{ d.cap ? ' · cap ' + money(d.cap, pt.currency) : '' }}</td><td>{{ money(d.amount, pt.currency) }}</td><td>{{ d.value !== null ? money(d.value, pt.currency) : '—' }}{{ d.realized ? ' + ' + money(d.realized, pt.currency) + ' realized' : '' }}</td><td>{{ { active: 'Active', at_cost: 'At cost', realized: 'Exited', written_off: 'Written off' }[d.status] ?? d.status }}</td></tr></tbody></table>
        <p class="muted">Total invested {{ money(pt.deals.reduce((a, d) => a + d.amount, 0), pt.currency) }}. Estimated value is your share of each company's current mark, as reported by the fund team.</p></div>
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
      <p v-if="!data.positions.length && !data.participations?.length" class="card muted">You have no commitments recorded yet.</p>
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
      <div v-if="(data as any).taxDocs?.length" class="card"><h2>Tax documents</h2><div v-for="t in (data as any).taxDocs" :key="t.id" class="taxr"><span><b>{{ t.tax_year }} · {{ t.form_type }}</b>{{ t.issuer ? ' · ' + t.issuer : '' }}</span><a :href="'/api/public/lp/' + token + '/tax/' + t.id" target="_blank">Open</a></div></div>
      <div v-if="data.deals?.length" class="card dflow noprint"><h2>Deal flow</h2><p class="muted">New companies the fund team has screened. Tell them if you would like to co-invest or hear more.</p>
        <div v-for="d in data.deals" :key="d.id" class="dl"><div class="dli"><b>{{ d.company }}</b><span>{{ d.one_liner }}</span><em>{{ [STAGE[d.stage] ?? d.stage, d.sector, d.country, d.raising_usd ? 'raising $' + Math.round(d.raising_usd).toLocaleString('en-US') : ''].filter(Boolean).join(' · ') }}</em></div>
          <div v-if="d.funding_type === 'loan'" class="crl"><span class="tag">Venture debt</span><span v-if="d.credit">{{ new Intl.NumberFormat('en-US', { style: 'currency', currency: d.credit.currency, maximumFractionDigits: 0 }).format(d.credit.amount) }}{{ d.credit.tenor ? ' over ' + d.credit.tenor + ' months' : '' }}</span>
            <span v-if="d.credit?.business" class="cs" :class="d.credit.business.band">Business {{ d.credit.business.score }} · {{ d.credit.business.band }}</span><span v-for="f in d.credit?.founders ?? []" :key="f.name" class="cs" :class="f.band">{{ f.name }} {{ f.score }} · {{ f.band }}</span><span v-if="!d.credit?.business && !d.credit?.founders?.length" class="cs">Credit check pending</span></div>
          <button v-if="!d.interested && !sent.includes(d.id)" class="btn sm" type="button" :disabled="data.preview" @click="interested(d)">I'm interested</button><span v-else class="ok">Interest sent</span></div>
        <p v-if="iErr" class="error">{{ iErr }}</p></div>
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
.pvbar { background: #b5470b; color: #fff; font-size: 13px; padding: 8px 12px; margin-bottom: 12px; } .dflow { margin-top: 14px; } .dflow h2 { margin: 0 0 4px; } .dl { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--c-rule); } .dli { display: flex; flex-direction: column; gap: 2px; } .dli span { font-size: 13.5px; color: var(--c-ink-soft); } .dli em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; white-space: nowrap; } .ok { color: var(--c-ok); font-size: 13px; white-space: nowrap; }
.crl { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; margin: 6px 0; } .crl .tag { background: #fff7ea; color: #8a4b00; padding: 2px 8px; font-weight: 600; } .cs { background: var(--c-paper-2); padding: 2px 8px; } .cs.Excellent, .cs.Good { background: rgba(31,122,77,.1); color: var(--c-ok); } .cs.Fair { background: rgba(181,71,8,.09); color: var(--c-warn); } .cs.Poor { background: rgba(180,35,24,.07); color: var(--c-danger); }
.taxr { display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .taxr a { color: var(--c-blue-deep); }
</style>
