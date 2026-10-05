<script setup lang="ts">
// A Finvry subscription invoice, laid out like the Telroi invoice. For Aidi platform staff and admins of the invoiced workspace.
definePageMeta({ layout: false })
const id = useRoute().params.id as string
interface I { number: string; customer: string; issue_date: string; due_date: string; period_start: string | null; period_end: string | null; currency: string; lines: { description: string; quantity: number; unit_amount: number; amount: number }[]; amount: string; status: string; overdue: boolean; paid_at: string | null; bill_to: { name: string; email: string; address?: string } }
const { data, error } = await useFetch<{ invoice: I; issuer: { issuer_name: string; issuer_address: string; issuer_email: string; payment_instructions: string }; payUrl: string | null }>('/api/billing/invoices/' + id)
useHead({ titleTemplate: '%s', title: () => (data.value ? 'Invoice ' + data.value.invoice.number : 'Invoice') })
const money = (v: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value?.invoice.currency ?? 'USD' }).format(Number(v))
const day = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '')
const short = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '')
const doPrint = () => window.print()
const back = () => (history.length > 1 ? history.back() : navigateTo('/settings'))
</script>

<template>
  <div class="page">
    <p v-if="error" class="err">This invoice is not available.</p>
    <template v-else-if="data">
      <div class="bar noprint"><button type="button" class="btn secondary" @click="back">← Back</button><span /><button type="button" class="btn secondary" @click="doPrint">Download PDF</button><a v-if="data.payUrl && data.invoice.status !== 'paid'" :href="data.payUrl" class="btn">Pay now</a></div>
      <article class="ti">
        <header class="hd">
          <div><h1>{{ data.issuer.issuer_name }}</h1><p class="pre">{{ data.issuer.issuer_address }}</p><p>{{ data.issuer.issuer_email }}</p></div>
          <div class="rt"><span class="lb">Invoice</span><b class="no">{{ data.invoice.number }}</b>
            <span class="chip" :class="data.invoice.overdue ? 'over' : data.invoice.status">{{ data.invoice.status === 'paid' ? 'Paid ' + short(data.invoice.paid_at) : data.invoice.status === 'void' ? 'Void' : (data.invoice.overdue ? 'Overdue · ' : 'Due ') + short(data.invoice.due_date) }}</span></div>
        </header>
        <div class="info">
          <div><span class="lb">Billed to</span><b>{{ data.invoice.customer }}</b><span>{{ data.invoice.bill_to.name }}</span><span class="mut">{{ data.invoice.bill_to.email }}</span><span v-if="data.invoice.bill_to.address" class="pre">{{ data.invoice.bill_to.address }}</span></div>
          <div><span class="lb">Period</span><b>{{ data.invoice.period_start ? day(data.invoice.period_start) + ' – ' + day(data.invoice.period_end) : '—' }}</b></div>
          <div><span class="lb">Issued</span><b>{{ day(data.invoice.issue_date) }}</b></div>
        </div>
        <table class="ln"><thead><tr><th>Description</th><th class="q">Qty</th><th class="n">Amount</th></tr></thead>
          <tbody><tr v-for="(l, i) in data.invoice.lines" :key="i"><td>{{ l.description }}</td><td class="q">{{ l.quantity }}</td><td class="n m">{{ money(l.amount) }}</td></tr></tbody></table>
        <div class="tot"><div><span>Subtotal</span><span class="m">{{ money(data.invoice.amount) }}</span></div>
          <div v-if="data.invoice.status === 'paid'"><span>Paid</span><span class="m ok">−{{ money(data.invoice.amount) }}</span></div>
          <div class="due"><span>Amount due</span><span class="m">{{ data.invoice.status === 'paid' ? money(0) : money(data.invoice.amount) }}</span></div></div>
        <div v-if="data.invoice.status !== 'paid' && data.issuer.payment_instructions" class="bank"><span class="lb">Pay by transfer</span><p class="pre">{{ data.issuer.payment_instructions }}</p><p class="mut">Please quote {{ data.invoice.number }} with your payment.</p></div>
      </article>
    </template>
  </div>
</template>

<style scoped>
.page { background: var(--c-paper-2); min-height: var(--vh100); padding: 32px 16px; font-family: var(--font-body); color: var(--c-ink); }
.bar { max-width: 900px; margin: 0 auto 16px; display: flex; gap: 10px; align-items: center; } .bar span { flex: 1; } .bar a.btn { text-decoration: none; }
.ti { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid var(--c-rule); padding: 48px 56px; }
.hd { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 28px; border-bottom: 1px solid var(--c-rule); }
.hd h1 { font-family: var(--font-heading); font-weight: 500; font-size: 30px; color: var(--c-navy); margin: 0 0 10px; } .hd p { margin: 0 0 4px; color: var(--c-ink-soft); font-size: 15px; } .pre { white-space: pre-line; }
.rt { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; } .lb { display: block; font-size: 13.5px; color: var(--c-muted); }
.no { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 24px; font-weight: 500; } .m { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.chip { font-size: 13.5px; background: var(--c-paper-2); padding: 5px 12px; color: var(--c-ink-soft); } .chip.paid { background: rgba(31,122,77,.1); color: var(--c-ok); } .chip.over { background: rgba(180,35,24,.08); color: var(--c-danger); }
.info { display: grid; grid-template-columns: 1.4fr 1.2fr 1fr; gap: 24px; padding: 26px 0; border-bottom: 1px solid var(--c-rule); } .info > div { display: flex; flex-direction: column; gap: 4px; font-size: 15px; } .info b { font-weight: 500; } .mut { color: var(--c-muted); }
.ln { width: 100%; border-collapse: collapse; margin-top: 26px; } .ln th { text-align: left; font-weight: 400; font-size: 13.5px; color: var(--c-muted); padding: 10px 0; border-bottom: 1px solid var(--c-rule); }
.ln td { padding: 16px 0; border-bottom: 1px solid var(--c-rule); font-size: 15px; } .n { text-align: right; } .q { text-align: center; width: 70px; color: var(--c-ink-soft); } .ln th.n { text-align: right; } .ln th.q { text-align: center; } .ln td.n { padding-left: 16px; }
.tot { margin: 26px 0 0 auto; width: 46%; min-width: 280px; } .tot > div { display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; color: var(--c-ink-soft); } .tot .ok { color: var(--c-ok); }
.tot .due { border-top: 1px solid var(--c-ink); margin-top: 8px; padding-top: 14px; font-size: 20px; color: var(--c-ink); font-weight: 500; }
.bank { margin-top: 34px; padding-top: 24px; border-top: 1px solid var(--c-rule); font-size: 15px; } .bank p { margin: 8px 0 0; }
.err { text-align: center; color: var(--c-muted); }
@media (max-width: 760px) { .ti { padding: 26px 20px; } .hd { flex-direction: column; } .rt { align-items: flex-start; text-align: left; } .info { grid-template-columns: 1fr; } .tot { width: 100%; } }
@media print { .page { background: #fff; padding: 0; } .ti { border: 0; padding: 0; } .noprint { display: none; } }
</style>
