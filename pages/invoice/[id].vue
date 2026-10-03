<script setup lang="ts">
// A printable invoice (Print, then Save as PDF). For Aidi platform staff and admins of the invoiced workspace.
definePageMeta({ layout: false })
const id = useRoute().params.id as string
interface I { number: string; customer: string; issue_date: string; due_date: string; period_start: string | null; period_end: string | null; currency: string; lines: { description: string; quantity: number; unit_amount: number; amount: number }[]; amount: string; bill_to: { name: string; email: string; address?: string }; status: string; paid_at: string | null; overdue: boolean }
const { data, error } = await useFetch<{ invoice: I; issuer: { issuer_name: string; issuer_address: string; issuer_email: string; payment_instructions: string }; payUrl: string | null }>('/api/billing/invoices/' + id)
useHead({ titleTemplate: '%s', title: () => (data.value ? 'Invoice ' + data.value.invoice.number : 'Invoice') })
const money = (v: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value?.invoice.currency ?? 'USD' }).format(Number(v))
const day = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '')
const doPrint = () => window.print()
</script>

<template>
  <div class="page">
    <p v-if="error" class="err">This invoice is not available.</p>
    <article v-else-if="data" class="inv">
      <div class="noprint bar"><a v-if="data.payUrl" :href="data.payUrl" class="btn">Pay online</a><button type="button" class="btn" :class="{ secondary: data.payUrl }" @click="doPrint">Print or save as PDF</button></div>
      <header><div><h1>{{ data.issuer.issuer_name }}</h1><p class="muted pre">{{ data.issuer.issuer_address }}</p><p class="muted">{{ data.issuer.issuer_email }}</p></div>
        <div class="meta"><p class="tag" :data-s="data.invoice.overdue ? 'overdue' : data.invoice.status">{{ data.invoice.overdue ? 'Overdue' : data.invoice.status === 'paid' ? 'Paid' : data.invoice.status === 'void' ? 'Void' : 'Invoice' }}</p><h2>{{ data.invoice.number }}</h2><p>Issued {{ day(data.invoice.issue_date) }}</p><p><b>Due {{ day(data.invoice.due_date) }}</b></p></div></header>
      <section class="bill"><p class="lbl">Bill to</p><p><b>{{ data.invoice.customer }}</b></p><p>{{ data.invoice.bill_to.name }} · {{ data.invoice.bill_to.email }}</p><p v-if="data.invoice.bill_to.address" class="pre">{{ data.invoice.bill_to.address }}</p>
        <p v-if="data.invoice.period_start" class="muted">Service period {{ day(data.invoice.period_start) }} – {{ day(data.invoice.period_end) }}</p></section>
      <table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit</th><th class="n">Amount</th></tr></thead>
        <tbody><tr v-for="(l, i) in data.invoice.lines" :key="i"><td>{{ l.description }}</td><td class="n">{{ l.quantity }}</td><td class="n">{{ money(l.unit_amount) }}</td><td class="n">{{ money(l.amount) }}</td></tr></tbody>
        <tfoot><tr><td colspan="3">Total ({{ data.invoice.currency }})</td><td class="n">{{ money(data.invoice.amount) }}</td></tr></tfoot></table>
      <p v-if="data.invoice.status === 'paid'" class="paid">Paid {{ day(data.invoice.paid_at) }}. Thank you.</p>
      <section v-else class="pay"><p class="lbl">How to pay</p><p class="pre">{{ data.issuer.payment_instructions }}</p><p class="muted">Please quote {{ data.invoice.number }} with your payment.</p></section>
    </article>
  </div>
</template>

<style scoped>
.page { background: #f5f5f3; min-height: 100vh; padding: 32px 16px; font-family: var(--font-body); color: var(--c-ink); }
.inv { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 48px; }
.bar { display: flex; justify-content: flex-end; gap: 10px; margin: -24px -24px 16px 0; } .bar a.btn { text-decoration: none; }
header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid var(--c-navy); padding-bottom: 20px; margin-bottom: 24px; }
h1 { font-family: var(--font-heading); font-weight: 500; font-size: 30px; color: var(--c-navy); margin: 0 0 6px; } h2 { font-family: var(--font-heading); font-weight: 500; font-size: 24px; margin: 4px 0; color: var(--c-navy); }
.meta { text-align: right; } .meta p { margin: 2px 0; font-size: 14px; }
.tag { display: inline-block; font-size: 11px; letter-spacing: 0; color: var(--c-blue-deep); } .tag[data-s="paid"] { color: var(--c-ok); } .tag[data-s="overdue"] { color: var(--c-danger); } .tag[data-s="void"] { color: var(--c-muted); }
.lbl { font-size: 11px; letter-spacing: 0; color: var(--c-muted); margin: 0 0 6px; }
.bill p, .pay p { margin: 2px 0; font-size: 14px; } .bill { margin-bottom: 24px; }
table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; margin-bottom: 24px; } th { text-align: left; font-size: 11px; letter-spacing: 0; color: var(--c-muted); font-weight: 500; padding: 10px 0; border-bottom: 1px solid var(--c-rule); }
td { padding: 10px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .n { text-align: right; } tfoot td { font-weight: 600; font-size: 16px; border-bottom: 0; color: var(--c-navy); }
.paid { color: var(--c-ok); font-weight: 500; } .pre { white-space: pre-wrap; } .muted { color: var(--c-muted); font-size: 13px; } .err { text-align: center; color: var(--c-muted); }
@media print { .page { background: #fff; padding: 0; } .inv { border: 0; padding: 0; } .noprint { display: none; } }
</style>
