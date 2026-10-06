<script setup lang="ts">
import { mdRender } from '~/shared/markdown'
// SAFE term sheet and signature page (post-money SAFE structure). Printable; not legal advice.
const id = useRoute().params.id as string
const { data } = await useFetch<{ company_name: string; company_state: string; investor_name: string; investor_email: string | null; amount: number; currency: string; valuation_cap: number | null; discount: number | null; mfn: boolean; pro_rata: boolean; signatory_name: string; signatory_title: string; safe_date: string }>('/api/fundraising/safes/' + id)
useHead({ title: () => (data.value ? 'SAFE: ' + data.value.investor_name : 'SAFE') })
const SYM: Record<string, string> = { USD: '$', NGN: '₦' }
const m = (v: number | null) => (v == null ? '' : (SYM[data.value?.currency ?? 'USD'] ?? '') + v.toLocaleString('en-US'))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const own = computed(() => (data.value?.valuation_cap ? Math.round((data.value.amount / data.value.valuation_cap) * 10000) / 100 : null))
const { data: docsData } = await useFetch<{ docs: { key: string; title: string; md: string }[] }>('/api/fundraising/safes/' + id + '/docs', { key: 'safe-docs-' + id })
const tab = ref('terms')
const TAB_NAME: Record<string, string> = { safe: 'SAFE', mfn: 'MFN side letter', pro_rata: 'Pro rata side letter' }
const cur = computed(() => docsData.value?.docs.find((d) => d.key === tab.value) ?? null)
const saved = ref(''); const saving = ref(false)
async function saveDocs() { saving.value = true; saved.value = ''; try { await $fetch('/api/fundraising/safes/' + id + '/save', { method: 'POST' }); saved.value = 'Saved to Documents.' } catch (e) { saved.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { saving.value = false } }
</script>
<template>
  <section v-if="data" class="wrap">
    <div class="bar noprint"><NuxtLink to="/fundraising?t=safe" class="back">← Fundraising</NuxtLink><span /><DeleteButton type="safe" :id="id" :name="'the SAFE for ' + data.investor_name" to="/fundraising?t=safe" /><a class="btn secondary" :href="'/api/fundraising/safes/' + id + '/pdf?doc=' + (tab === 'terms' ? 'all' : tab)">{{ tab === 'terms' ? 'Download all (PDF)' : 'Download PDF' }}</a><a v-if="tab !== 'terms'" class="btn secondary" :href="'/api/fundraising/safes/' + id + '/pdf?doc=all'">Download all</a><AddToRoom kind="safe" :id="id" /><button class="btn" :disabled="saving" @click="saveDocs">{{ saving ? 'Saving…' : 'Save to Documents' }}</button></div>
    <p v-if="saved" class="okm noprint">{{ saved }}</p>
    <nav class="dtabs noprint"><button :class="{ on: tab === 'terms' }" @click="tab = 'terms'">Term sheet</button><button v-for="d in docsData?.docs ?? []" :key="d.key" :class="{ on: tab === d.key }" @click="tab = d.key">{{ TAB_NAME[d.key] }}</button></nav>
    <article v-if="tab !== 'terms' && cur" class="doc legal" v-html="mdRender(cur.md)" />
    <p class="note noprint">This is a term sheet and signature page based on the structure of the post-money SAFE (Simple Agreement for Future Equity). It is not legal advice. The SAFE and side letters below are drafted from these terms in Finvry's own wording, following the standard post-money SAFE structure. Have a lawyer review them before signing. You can also use the official forms, which Y Combinator publishes for free at ycombinator.com/documents.</p>
    <article v-if="tab === 'terms'" class="doc">
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
.dtabs { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; margin: 0 0 12px; width: fit-content; max-width: 100%; overflow-x: auto; } .dtabs button { background: none; border: 0; padding: 8px 14px; font: inherit; font-size: 14px; cursor: pointer; white-space: nowrap; } .dtabs .on { background: #fff; font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); }
.okm { color: var(--c-ok); font-size: 13px; margin: 0 0 8px; } a.btn { text-decoration: none; }
.legal { font-family: 'EB Garamond', Garamond, 'Times New Roman', serif; font-size: 15.5px; line-height: 1.65; text-align: justify; } .legal :deep(h2) { font-size: 22px; text-align: center; margin: 0 0 10px; } .legal :deep(h3) { font-size: 16px; margin: 22px 0 6px; text-transform: none; }
.legal :deep(blockquote) { border-left: 3px solid var(--c-blue-deep); margin: 10px 0 16px; padding: 4px 12px; font-size: 13px; font-style: italic; color: var(--c-ink-soft); background: var(--c-signal-soft); } .legal :deep(p) { margin: 0 0 10px; }
</style>
