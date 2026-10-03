<script setup lang="ts">
// A client invoice laid out like the invoices clients already receive: issuer, bill to, amount due, lines, bank transfer.
interface Inv { number: string; currency: string; amount: string; issue_date: string; due_date: string; status: string; paid_at: string | null; company?: string | null
  lines: { description: string; quantity: number; unit_amount: number; amount: number }[]; bill_to: { name: string; email: string; address?: string }
  issuer: { issuer: string; address: string; phone: string; email: string; bank?: Record<string, string>; note_top?: string; note_bottom?: string }; note: string | null }
const props = defineProps<{ inv: Inv; payable?: boolean }>()
defineEmits<{ pay: [] }>()
const money = (v: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: props.inv.currency }).format(Number(v))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const bank = computed(() => Object.entries(props.inv.issuer.bank ?? {}).filter(([, v]) => v))
</script>

<template>
  <article class="ci">
    <div class="bar" />
    <header class="top"><div><h1>Invoice</h1>
      <dl class="meta"><dt>Invoice number</dt><dd>{{ inv.number }}</dd><dt>Date of issue</dt><dd>{{ day(inv.issue_date) }}</dd><dt>Date due</dt><dd>{{ day(inv.due_date) }}</dd></dl></div>
      <span v-if="inv.status === 'paid'" class="stamp paid">Paid{{ inv.paid_at ? ' ' + day(inv.paid_at) : '' }}</span><span v-else-if="inv.status === 'void'" class="stamp void">Void</span></header>
    <div class="parties">
      <div><b>{{ inv.issuer.issuer }}</b><p class="pre">{{ inv.issuer.address }}</p><p v-if="inv.issuer.phone">{{ inv.issuer.phone }}</p><p v-if="inv.issuer.email">{{ inv.issuer.email }}</p></div>
      <div><b>Bill to</b><p>{{ inv.bill_to.name }}</p><p v-if="inv.company && inv.company !== inv.bill_to.name">{{ inv.company }}</p><p v-if="inv.bill_to.address" class="pre">{{ inv.bill_to.address }}</p><p>{{ inv.bill_to.email }}</p></div>
    </div>
    <h2 class="due">{{ money(inv.amount) }} {{ inv.currency }} {{ inv.status === 'paid' ? 'paid' : 'due ' + day(inv.due_date) }}</h2>
    <button v-if="payable" type="button" class="paylink" @click="$emit('pay')">Pay online</button>
    <p v-if="inv.issuer.note_top" class="note">{{ inv.issuer.note_top }}</p>
    <table class="lines"><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead>
      <tbody><tr v-for="(l, i) in inv.lines" :key="i"><td>{{ l.description }}</td><td class="n">{{ l.quantity }}</td><td class="n">{{ money(l.unit_amount) }}</td><td class="n">{{ money(l.amount) }}</td></tr></tbody></table>
    <table class="tot"><tbody><tr><td>Subtotal</td><td class="n">{{ money(inv.amount) }}</td></tr><tr><td>Total</td><td class="n">{{ money(inv.amount) }}</td></tr><tr class="ad"><td>Amount due</td><td class="n">{{ inv.status === 'paid' ? money(0) : money(inv.amount) }} {{ inv.currency }}</td></tr></tbody></table>
    <p v-if="inv.note" class="note">{{ inv.note }}</p>
    <p v-if="inv.issuer.note_bottom" class="note">{{ inv.issuer.note_bottom }}</p>
    <div v-if="bank.length && inv.status !== 'paid'" class="bank"><b>Pay {{ money(inv.amount) }} with a bank transfer</b><p>Bank transfers can take up to two business days. Use the details below and the invoice number as the reference.</p>
      <dl><template v-for="[k, v] in bank" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template><dt>Reference</dt><dd>{{ inv.number }}</dd></dl></div>
  </article>
</template>

<style scoped>
.ci { background: #fff; border: 1px solid var(--c-rule); padding: 0 44px 40px; position: relative; color: #1f1f1f; font-family: var(--font-body); }
.bar { height: 6px; background: var(--c-navy); margin: 0 -44px 28px; }
.top { display: flex; justify-content: space-between; align-items: flex-start; } h1 { font-family: var(--font-body); font-weight: 700; font-size: 30px; color: #111; margin: 0 0 12px; }
.meta { display: grid; grid-template-columns: auto auto; gap: 2px 18px; margin: 0; font-size: 13.5px; } .meta dt { font-weight: 600; } .meta dd { margin: 0; font-weight: 600; }
.stamp { font-size: 13px; font-weight: 600; padding: 4px 10px; } .stamp.paid { background: rgba(31,122,77,.1); color: var(--c-ok); } .stamp.void { background: var(--c-paper-2); color: var(--c-muted); }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 26px 0 28px; font-size: 13.5px; } .parties b { display: block; margin-bottom: 6px; } .parties p { margin: 0; line-height: 1.55; } .pre { white-space: pre-line; }
.due { font-family: var(--font-body); font-weight: 700; font-size: 21px; color: #111; margin: 0 0 8px; }
.paylink { background: none; border: 0; padding: 0; font: inherit; font-size: 14px; font-weight: 600; color: var(--c-blue-deep); text-decoration: underline; cursor: pointer; }
.note { font-size: 13.5px; margin: 14px 0; line-height: 1.55; }
.lines { width: 100%; border-collapse: collapse; margin: 22px 0 8px; font-size: 13.5px; } .lines th { text-align: left; font-weight: 500; font-size: 12px; padding: 6px 0; border-bottom: 2px solid #111; }
.lines td { padding: 13px 0; border-bottom: 1px solid var(--c-rule); } .n { text-align: right; font-variant-numeric: tabular-nums; } .lines th.n { text-align: right; } .lines td.n { padding-left: 16px; }
.tot { margin-left: auto; width: 46%; border-collapse: collapse; font-size: 13.5px; } .tot td { padding: 5px 0; border-bottom: 1px solid var(--c-rule); } .tot .ad td { font-weight: 700; border-bottom: 0; }
.bank { margin-top: 26px; font-size: 13.5px; } .bank p { margin: 4px 0 8px; max-width: 420px; line-height: 1.5; } .bank dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 18px; margin: 0; } .bank dd { margin: 0; }
@media (max-width: 700px) { .ci { padding: 0 20px 28px; } .bar { margin: 0 -20px 22px; } .parties { grid-template-columns: 1fr; } .tot { width: 100%; } }
@media print { .ci { border: 0; } .paylink { display: none; } }
</style>
