<script setup lang="ts">
// SAFE term sheet and signature page (post-money SAFE structure). Printable; not legal advice.
const id = useRoute().params.id as string
const { data } = await useFetch<{ company_name: string; company_state: string; investor_name: string; investor_email: string | null; amount: number; currency: string; valuation_cap: number | null; discount: number | null; mfn: boolean; pro_rata: boolean; signatory_name: string; signatory_title: string; safe_date: string }>('/api/fundraising/safes/' + id)
useHead({ title: () => (data.value ? 'SAFE: ' + data.value.investor_name : 'SAFE') })
const SYM: Record<string, string> = { USD: '$', NGN: '₦' }
const m = (v: number | null) => (v == null ? '' : (SYM[data.value?.currency ?? 'USD'] ?? '') + v.toLocaleString('en-US'))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const own = computed(() => (data.value?.valuation_cap ? Math.round((data.value.amount / data.value.valuation_cap) * 10000) / 100 : null))
const doPrint = () => window.print()
</script>
<template>
  <section v-if="data" class="wrap">
    <div class="bar noprint"><NuxtLink to="/fundraising?t=safe" class="back">← Fundraising</NuxtLink><span /><button class="btn" @click="doPrint">Download PDF</button></div>
    <p class="note noprint">This is a term sheet and signature page based on the structure of the post-money SAFE (Simple Agreement for Future Equity). It is not legal advice. Have a lawyer review it, and sign the full official SAFE form, which Y Combinator publishes for free at ycombinator.com/documents.</p>
    <article class="doc">
      <p class="lb">Term sheet</p><h1>Simple Agreement for Future Equity</h1><p class="sub">{{ data.company_name }}, a {{ data.company_state }} {{ data.company_state === 'Delaware' || data.company_state === 'Other' ? 'corporation' : 'corporation' }} · {{ day(data.safe_date) }}</p>
      <table><tbody>
        <tr><th>Company</th><td>{{ data.company_name }}</td></tr><tr><th>Investor</th><td>{{ data.investor_name }}{{ data.investor_email ? ' (' + data.investor_email + ')' : '' }}</td></tr>
        <tr><th>Purchase amount</th><td>{{ m(data.amount) }}</td></tr>
        <tr><th>Post-money valuation cap</th><td>{{ data.valuation_cap ? m(data.valuation_cap) : 'None' }}</td></tr>
        <tr><th>Discount</th><td>{{ data.discount ? data.discount + '% (the investor pays ' + (100 - data.discount) + '% of the price paid by new investors)' : 'None' }}</td></tr>
        <tr><th>Most favoured nation</th><td>{{ data.mfn ? 'Yes: if the company later issues SAFEs on better terms before conversion, the investor may take those terms.' : 'No' }}</td></tr>
        <tr><th>Pro rata rights</th><td>{{ data.pro_rata ? 'Yes, under a separate side letter, to invest in the next priced round to keep their percentage.' : 'No' }}</td></tr>
        <tr v-if="own"><th>Indicative ownership</th><td>About {{ own }}% of the company at conversion (purchase amount ÷ post-money valuation cap), before dilution from the new money in the priced round.</td></tr>
      </tbody></table>
      <h2>How it works</h2>
      <p><b>Equity financing.</b> When the company raises a priced round, the investor's purchase amount converts into preferred shares at the lower of (a) the price set by the valuation cap and (b) the discounted price, where those terms apply.</p>
      <p><b>Liquidity event.</b> If the company is sold or lists before a priced round, the investor receives the greater of their purchase amount back or the amount they would get by converting at the valuation cap.</p>
      <p><b>Dissolution.</b> If the company winds down before conversion, the investor is repaid their purchase amount ahead of common shareholders, to the extent funds allow.</p>
      <p><b>No interest or maturity.</b> A SAFE is not debt: it carries no interest and has no maturity date.</p>
      <h2>Signatures</h2>
      <div class="sig"><div><p class="lb">Company</p><p>{{ data.company_name }}</p><span class="ln" /><p>{{ data.signatory_name }}, {{ data.signatory_title }}</p><p class="lb">Date</p><span class="ln" /></div>
        <div><p class="lb">Investor</p><p>{{ data.investor_name }}</p><span class="ln" /><p>Name and title</p><p class="lb">Date</p><span class="ln" /></div></div>
      <p class="fine">Prepared with Finvry. Not legal advice. Execute the full post-money SAFE form; this document summarises the agreed terms.</p>
    </article>
  </section>
</template>
<style scoped>
.wrap { max-width: 860px; } .bar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; } .bar span { flex: 1; } .back { color: var(--c-muted); } .note { background: rgba(183,121,31,.1); border-left: 3px solid var(--c-warn); padding: 10px 14px; font-size: 13.5px; }
.doc { background: #fff; border: 1px solid var(--c-rule); padding: 44px 52px; font-family: var(--font-body); } .lb { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); margin: 0; } .doc h1 { margin: 6px 0 4px; font-size: 32px; } .sub { color: var(--c-ink-soft); margin: 0 0 22px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 22px; } th { text-align: left; width: 34%; font-weight: 500; color: var(--c-ink-soft); padding: 10px 0; border-bottom: 1px solid var(--c-rule); vertical-align: top; } td { padding: 10px 0; border-bottom: 1px solid var(--c-rule); }
.doc h2 { font-size: 20px; margin: 22px 0 8px; } .doc p { line-height: 1.6; } .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 14px; } .sig p { margin: 4px 0; } .ln { display: block; border-bottom: 1px solid var(--c-ink); height: 34px; margin-bottom: 6px; }
.fine { font-size: 11.5px; color: var(--c-muted); margin-top: 30px; } @media print { .noprint { display: none !important; } .doc { border: 0; padding: 0; } }
</style>
