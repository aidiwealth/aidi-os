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
  downloadPdf({ kind: 'doc', lp_token: token, title: 'Investor statement - ' + d.lp.name, company: d.workspace.firm, md: md.join('\n') }, true)
}
const STAGE: Record<string, string> = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', later: 'Later stage' }
const sent = ref<string[]>([]); const iErr = ref('')
const parts = computed(() => data.value?.participations ?? [])
const pos = computed(() => data.value?.positions ?? [])
const cur = computed(() => parts.value[0]?.currency ?? pos.value[0]?.currency ?? 'USD')
const tot = computed(() => {
  const inv = parts.value.reduce((s, p) => s + p.deals.reduce((a, d) => a + d.amount, 0), 0) + pos.value.reduce((s, p) => s + p.paidIn, 0)
  const val = parts.value.reduce((s, p) => s + p.deals.reduce((a, d) => a + (d.value ?? d.amount), 0), 0) + pos.value.reduce((s, p) => s + p.navShare, 0)
  const dist = parts.value.reduce((s, p) => s + p.deals.reduce((a, d) => a + (d.realized ?? 0), 0), 0) + pos.value.reduce((s, p) => s + p.distributed, 0)
  return { inv, val, dist, mult: inv ? (val + dist) / inv : null, deals: parts.value.reduce((s, p) => s + p.deals.length, 0) }
})
const DS: Record<string, string> = { active: 'Active', at_cost: 'At cost', realized: 'Exited', written_off: 'Written off' }
async function interested(d: Deal) { iErr.value = ''; const note = prompt('Anything to add for the fund team? (optional)') ?? ''; try { await $fetch('/api/public/lp/' + token + '/interest', { method: 'POST', body: { pitch_id: d.id, note } }); sent.value.push(d.id) } catch (e) { iErr.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send.' } }
</script>

<template>
  <section class="wrap">
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1><p class="muted">Ask the fund team to send you a new link.</p></div>
    <template v-else-if="data">
      <div v-if="data.preview" class="pvbar noprint"><b>Preview</b> This is exactly what {{ data.lp.name }} sees. Read-only; this preview link expires in 30 minutes.</div>
      <div class="top"><div><p class="eb">Investor statement · {{ today }}</p><h1>{{ data.lp.name }}</h1><p class="by">Prepared by {{ data.workspace.firm }}</p></div><button class="btn secondary noprint" type="button" @click="doPrint">Download PDF</button></div>

      <div v-if="tot.inv || tot.val" class="sum">
        <div><em>Invested</em><b>{{ money(tot.inv, cur) }}</b><i>{{ tot.deals ? tot.deals + ' compan' + (tot.deals === 1 ? 'y' : 'ies') : 'Paid in' }}</i></div>
        <div><em>Estimated value</em><b>{{ money(tot.val, cur) }}</b><i>At the latest marks</i></div>
        <div><em>Distributed to you</em><b>{{ money(tot.dist, cur) }}</b><i>{{ tot.dist ? 'Paid out so far' : 'Nothing yet' }}</i></div>
        <div><em>Multiple</em><b>{{ tot.mult ? tot.mult.toFixed(2) + 'x' : '—' }}</b><i>Value and distributions over invested</i></div>
      </div>

      <div v-for="pt in parts" :key="pt.fund" class="card blk">
        <div class="bh"><h2>{{ pt.fund }}</h2><span>Deal by deal · {{ pt.deals.length }} compan{{ pt.deals.length === 1 ? 'y' : 'ies' }}</span></div>
        <table class="t"><thead><tr><th>Company</th><th>Terms</th><th class="r">Invested</th><th class="r">Estimated value</th><th>Status</th></tr></thead>
          <tbody><tr v-for="d in pt.deals" :key="d.company"><td><b>{{ d.company }}</b></td><td>{{ d.instrument ?? '—' }}<span v-if="d.cap" class="sub">Cap {{ money(d.cap, pt.currency) }}</span></td><td class="r">{{ money(d.amount, pt.currency, true) }}</td><td class="r">{{ d.value !== null ? money(d.value, pt.currency, true) : '—' }}<span v-if="d.realized" class="sub">+ {{ money(d.realized, pt.currency) }} realized</span></td><td><span class="st" :data-s="d.status">{{ DS[d.status] ?? d.status }}</span></td></tr></tbody>
          <tfoot v-if="pt.deals.length > 1"><tr><td colspan="2">Total</td><td class="r">{{ money(pt.deals.reduce((a, d) => a + d.amount, 0), pt.currency, true) }}</td><td class="r">{{ money(pt.deals.reduce((a, d) => a + (d.value ?? d.amount), 0), pt.currency, true) }}</td><td /></tr></tfoot></table>
        <p class="fine">Estimated value is your share of each company's current mark, as reported by the fund team.</p>
      </div>

      <div v-for="p in pos" :key="p.fund" class="card blk">
        <div class="bh"><h2>{{ p.fund }}</h2><span>{{ p.vintage ? 'Vintage ' + p.vintage : '' }}{{ p.navDate ? ' · valued at ' + day(p.navDate) : '' }}</span></div>
        <div class="kv">
          <div><em>Your commitment</em><b>{{ money(p.commitment, p.currency) }}</b></div><div><em>Called to date</em><b>{{ money(p.called, p.currency) }}</b></div><div><em>Paid in</em><b>{{ money(p.paidIn, p.currency) }}</b></div>
          <div><em>Unfunded</em><b>{{ money(p.unfunded, p.currency) }}</b></div><div><em>Distributed to you</em><b>{{ money(p.distributed, p.currency) }}</b></div><div><em>Value of your interest</em><b>{{ money(p.navShare, p.currency) }}</b></div>
        </div>
        <div class="mult"><span>Your DPI <b>{{ x(p.m.dpi) }}</b></span><span>TVPI <b>{{ x(p.m.tvpi) }}</b></span><span>Net IRR <b>{{ pct(p.m.irr) }}</b></span><span class="fm">Fund TVPI {{ x(p.fundM.tvpi) }} · IRR {{ pct(p.fundM.irr) }}</span></div>
        <p v-if="p.admin" class="fine">Official capital account statements, tax documents and payments come from {{ p.admin }}<a v-if="p.adminUrl" :href="p.adminUrl" target="_blank" rel="noopener"> (open {{ p.admin }})</a>.</p>
      </div>
      <p v-if="!pos.length && !parts.length" class="card muted">You have no commitments recorded yet.</p>

      <div v-if="data.history.length" class="card blk">
        <div class="bh"><h2>Capital calls and distributions</h2></div>
        <table class="t"><thead><tr><th>Notice</th><th>Date</th><th class="r">Amount</th><th class="r">Settled</th></tr></thead>
          <tbody><tr v-for="(h, i) in data.history" :key="i"><td><b>{{ h.kind === 'call' ? 'Capital call' : 'Distribution' }} {{ h.number }}</b><span class="sub">{{ h.fund }}{{ h.purpose ? ' · ' + h.purpose : '' }}</span></td><td>{{ day(h.due_date) }}</td>
            <td class="r">{{ money(h.amount, h.currency, true) }}</td><td class="r">{{ money(h.paid_amount, h.currency, true) }}<span v-if="h.paid_on" class="sub">{{ day(h.paid_on) }}</span></td></tr></tbody></table>
      </div>
      <div v-if="data.financials?.length" class="card blk">
        <div class="bh"><h2>Fund financials</h2></div>
        <table class="t"><thead><tr><th>Fund · period</th><th class="r">Investments</th><th class="r">Cash</th><th class="r">Total assets</th><th class="r">Operating costs</th><th class="r">Net income</th></tr></thead>
          <tbody><tr v-for="(f, i) in data.financials" :key="i"><td><b>{{ f.fund }}</b><span class="sub">{{ f.period_type === 'year' ? 'Year' : f.period_type === 'quarter' ? 'Quarter' : 'Month' }} to {{ day(f.period_end) }}</span></td>
            <td class="r">{{ f.investments == null ? '—' : money(f.investments, f.currency) }}</td><td class="r">{{ f.cash == null ? '—' : money(f.cash, f.currency) }}</td><td class="r">{{ f.total_assets == null ? '—' : money(f.total_assets, f.currency) }}</td>
            <td class="r">{{ f.opex_total == null ? '—' : money(f.opex_total, f.currency) }}</td><td class="r">{{ f.net_income == null ? '—' : money(f.net_income, f.currency) }}</td></tr></tbody></table>
      </div>
      <div v-if="(data as any).taxDocs?.length" class="card blk"><div class="bh"><h2>Tax documents</h2></div><div v-for="t in (data as any).taxDocs" :key="t.id" class="taxr"><span><b>{{ t.tax_year }} · {{ t.form_type }}</b>{{ t.issuer ? ' · ' + t.issuer : '' }}</span><a :href="'/api/public/lp/' + token + '/tax/' + t.id" target="_blank">Open</a></div></div>

      <div v-if="data.deals?.length" class="card blk noprint">
        <div class="bh"><div><h2>Deal flow</h2><p class="muted">New companies the fund team has screened. Tell them if you would like to co-invest or hear more.</p></div></div>
        <div v-for="d in data.deals" :key="d.id" class="dl">
          <div class="dli"><b>{{ d.company }}</b><span>{{ d.one_liner }}</span><em>{{ [STAGE[d.stage] ?? d.stage, d.sector, d.country, d.raising_usd ? 'raising $' + Math.round(d.raising_usd).toLocaleString('en-US') : ''].filter(Boolean).join(' · ') }}</em>
            <div v-if="d.funding_type === 'loan'" class="crl"><span class="pl">Venture debt<template v-if="d.credit"> · {{ new Intl.NumberFormat('en-US', { style: 'currency', currency: d.credit.currency, maximumFractionDigits: 0 }).format(d.credit.amount) }}{{ d.credit.tenor ? ' over ' + d.credit.tenor + ' months' : '' }}</template></span>
              <span v-if="d.credit?.business" class="pl">Business credit {{ d.credit.business.score }} · {{ d.credit.business.band }}</span><span v-for="f in d.credit?.founders ?? []" :key="f.name" class="pl">{{ f.name }} {{ f.score }} · {{ f.band }}</span><span v-if="!d.credit?.business && !d.credit?.founders?.length" class="pl mu">Credit check pending</span></div></div>
          <button v-if="!d.interested && !sent.includes(d.id)" class="btn sm" type="button" :disabled="data.preview" :title="data.preview ? 'Disabled in preview' : ''" @click="interested(d)">I'm interested</button><span v-else class="done">Interest sent</span></div>
        <p v-if="iErr" class="error">{{ iErr }}</p>
      </div>
      <p class="fine end">Unaudited summary for information only, based on the latest valuation the fund has recorded. It is not an official capital account statement. Prepared by {{ data.workspace.firm }}.</p>
    </template>
  </section>
</template>

<style scoped>
.wrap { max-width: 960px; margin: 0 auto; }
.pvbar { display: flex; gap: 10px; align-items: baseline; background: var(--c-paper-2); border: 1px solid var(--c-rule); color: var(--c-ink-soft); font-size: 13px; padding: 9px 14px; margin-bottom: 18px; } .pvbar b { color: var(--c-navy); }
.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 20px; } .top h1 { margin: 0; font-size: clamp(30px, 4vw, 40px); letter-spacing: -.03em; }
.eb { margin: 0 0 6px; font-size: 12.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); } .by { margin: 4px 0 0; font-size: 13.5px; color: var(--c-muted); }
.sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--c-rule); background: #fff; margin-bottom: 16px; } .sum > div { display: flex; flex-direction: column; gap: 3px; padding: 16px 18px; } .sum > div + div { border-left: 1px solid var(--c-rule); }
.sum em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .sum b { font-family: var(--font-heading); font-size: 26px; font-weight: 500; color: var(--c-navy); letter-spacing: -.02em; font-variant-numeric: tabular-nums; } .sum i { font-style: normal; font-size: 12px; color: var(--c-muted); }
.blk { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; } .bh { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; } .bh h2 { margin: 0; font-size: 18px; } .bh span { font-size: 12.5px; color: var(--c-muted); } .bh .muted { margin: 4px 0 0; }
.t { width: 100%; border-collapse: collapse; font-size: 14px; border: 1px solid var(--c-rule); } .t th { text-align: left; font-size: 12px; color: var(--c-muted); font-weight: 500; padding: 9px 14px; background: #fbfaf7; border-bottom: 1px solid var(--c-rule); white-space: nowrap; }
.t td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .t .r { text-align: right; font-variant-numeric: tabular-nums; } .t b { font-weight: 600; color: var(--c-ink); } .t tfoot td { font-weight: 600; color: var(--c-ink); background: #fbfaf7; border-bottom: 0; }
.sub { display: block; font-size: 12px; color: var(--c-muted); font-weight: 400; }
.st { font-size: 12px; font-weight: 600; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); white-space: nowrap; } .st[data-s="active"] { background: var(--c-signal-soft); color: var(--c-blue-deep); } .st[data-s="realized"] { background: var(--c-navy); color: #fff; }
.kv { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--c-rule); } .kv > div { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px 12px 0; border-bottom: 1px solid var(--c-rule); } .kv em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .kv b { font-family: var(--font-heading); font-size: 21px; font-weight: 500; color: var(--c-navy); font-variant-numeric: tabular-nums; }
.mult { display: flex; gap: 22px; flex-wrap: wrap; font-size: 13.5px; } .mult b { font-weight: 600; color: var(--c-navy); } .fm { margin-left: auto; color: var(--c-muted); }
.fine { font-size: 12px; color: var(--c-muted); margin: 0; } .fine.end { margin: 4px 0 24px; } .fine a { color: var(--c-blue-deep); }
.taxr { display: flex; justify-content: space-between; padding: 9px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .taxr a { color: var(--c-blue-deep); }
.dl { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 0; border-top: 1px solid var(--c-rule); } .dli { display: flex; flex-direction: column; gap: 3px; min-width: 0; } .dli b { font-size: 15px; color: var(--c-ink); } .dli span { font-size: 13.5px; color: var(--c-ink-soft); } .dli em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.crl { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; } .pl { font-size: 12px; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); } .pl.mu { color: var(--c-muted); }
.btn.sm { height: 34px; padding: 0 14px; font-size: 13px; white-space: nowrap; } .done { font-size: 13px; color: var(--c-muted); white-space: nowrap; }
.muted { color: var(--c-muted); font-size: 13.5px; } .error { color: var(--c-danger); }
@media (max-width: 700px) { .sum { grid-template-columns: 1fr 1fr; } .sum > div:nth-child(3) { border-left: 0; } .kv { grid-template-columns: 1fr 1fr; } .t { display: block; overflow-x: auto; } .dl { flex-direction: column; align-items: flex-start; } }
@media print { .noprint { display: none; } .card { break-inside: avoid; } }
</style>
