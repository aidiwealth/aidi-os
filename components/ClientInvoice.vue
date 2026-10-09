<script setup lang="ts">
// A client invoice in the Telroi invoice layout: issuer and number, billed to / period / issued, lines, totals, bank transfer.
interface Inv { number: string; currency: string; amount: string; issue_date: string; due_date: string; status: string; paid_at: string | null; company?: string | null
  lines: { description: string; quantity: number; unit_amount: number; amount: number; kind?: string }[]; bill_to: { name: string; email: string; address?: string }
  issuer: { issuer: string; address: string; phone: string; email: string; bank?: Record<string, string>; note_top?: string; note_bottom?: string }; note: string | null }
const props = defineProps<{ inv: Inv; payable?: boolean }>()
defineEmits<{ pay: [] }>()
const money = (v: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: props.inv.currency }).format(Number(v))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const short = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const bank = computed(() => Object.entries(props.inv.issuer.bank ?? {}).filter(([, v]) => v))
const chip = computed(() => props.inv.status === 'paid' ? 'Paid' + (props.inv.paid_at ? ' ' + short(props.inv.paid_at) : '') : props.inv.status === 'void' ? 'Void' : 'Due ' + short(props.inv.due_date))
</script>

<template>
  <article class="ti">
    <header class="hd">
      <div><h1>{{ inv.issuer.issuer }}</h1><p class="pre">{{ inv.issuer.address }}</p><p v-if="inv.issuer.phone">{{ inv.issuer.phone }}</p><p v-if="inv.issuer.email">{{ inv.issuer.email }}</p></div>
      <div class="rt"><span class="lb">Invoice</span><b class="no">{{ inv.number }}</b><span class="chip" :class="inv.status">{{ chip }}</span></div>
    </header>
    <div class="info">
      <div><span class="lb">Billed to</span><b>{{ inv.bill_to.name }}</b><span v-if="inv.company && inv.company !== inv.bill_to.name">{{ inv.company }}</span><span v-if="inv.bill_to.address" class="pre">{{ inv.bill_to.address }}</span><span class="mut">{{ inv.bill_to.email }}</span></div>
      <div><span class="lb">Due</span><b>{{ day(inv.due_date) }}</b></div>
      <div><span class="lb">Issued</span><b>{{ day(inv.issue_date) }}</b></div>
    </div>
    <p v-if="inv.issuer.note_top" class="note">{{ inv.issuer.note_top }}</p>
    <table class="ln"><thead><tr><th>Description</th><th class="q">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead>
      <tbody><tr v-for="(l, i) in inv.lines.filter((x) => x.kind !== 'tax')" :key="i"><td>{{ l.description }}</td><td class="q">{{ l.quantity }}</td><td class="n m">{{ money(l.unit_amount) }}</td><td class="n m">{{ money(l.amount) }}</td></tr></tbody></table>
    <div class="tot">
      <div><span>Subtotal</span><span class="m">{{ money(inv.lines.filter((x) => x.kind !== 'tax').reduce((t, x) => t + Number(x.amount), 0)) }}</span></div>
      <div v-for="(l, i) in inv.lines.filter((x) => x.kind === 'tax')" :key="'t' + i"><span>{{ l.description }}</span><span class="m">{{ money(l.amount) }}</span></div>
      <div v-if="inv.lines.some((x) => x.kind === 'tax')"><span><b>Total</b></span><span class="m"><b>{{ money(inv.amount) }}</b></span></div>
      <div v-if="inv.status === 'paid'"><span>Paid</span><span class="m ok">−{{ money(inv.amount) }}</span></div>
      <div class="due"><span>Amount due</span><span class="m">{{ inv.status === 'paid' ? money(0) : money(inv.amount) }}</span></div>
      <button v-if="payable" type="button" class="btn paynow" @click="$emit('pay')">Pay now</button>
    </div>
    <p v-if="inv.note" class="note">{{ inv.note }}</p>
    <div v-if="bank.length && inv.status !== 'paid'" class="bank"><span class="lb">Pay by transfer</span>
      <div class="bg"><div v-for="[k, v] in bank" :key="k"><span class="lb sm">{{ k }}</span><b :class="{ m: /number|routing|swift|sort/i.test(k) }">{{ v }}</b></div><div><span class="lb sm">Reference</span><b class="m">{{ inv.number }}</b></div></div>
      <p class="mut">Use the invoice number as the reference. Bank transfers can take up to two business days.</p></div>
    <p v-if="inv.issuer.note_bottom" class="foot">{{ inv.issuer.note_bottom }}</p>
  </article>
</template>

<style scoped>
.ti { background: #fff; border: 1px solid var(--c-rule); padding: 48px 56px; color: var(--c-ink); font-family: var(--font-body); }
.hd { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 28px; border-bottom: 1px solid var(--c-rule); }
.hd h1 { font-family: var(--font-heading); font-weight: 500; font-size: 30px; color: var(--c-navy); margin: 0 0 10px; } .hd p { margin: 0 0 4px; color: var(--c-ink-soft); font-size: 15px; } .pre { white-space: pre-line; }
.rt { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; } .lb { display: block; font-size: 13.5px; color: var(--c-muted); } .lb.sm { font-size: 12.5px; margin-bottom: 3px; }
.no { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 24px; font-weight: 500; letter-spacing: .02em; } .m { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.chip { font-size: 13.5px; background: var(--c-paper-2); padding: 5px 12px; color: var(--c-ink-soft); } .chip.paid { background: rgba(31,122,77,.1); color: var(--c-ok); } .chip.void { color: var(--c-muted); }
.info { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 24px; padding: 26px 0; border-bottom: 1px solid var(--c-rule); } .info > div { display: flex; flex-direction: column; gap: 4px; font-size: 15px; } .info b { font-weight: 500; } .mut { color: var(--c-muted); }
.note { font-size: 14px; color: var(--c-ink-soft); margin: 18px 0 0; line-height: 1.55; }
.ln { width: 100%; border-collapse: collapse; margin-top: 26px; } .ln th { text-align: left; font-weight: 400; font-size: 13.5px; color: var(--c-muted); padding: 10px 0; border-bottom: 1px solid var(--c-rule); }
.ln td { padding: 16px 0; border-bottom: 1px solid var(--c-rule); font-size: 15px; } .n { text-align: right; } .q { text-align: center; width: 70px; color: var(--c-ink-soft); } .ln th.n { text-align: right; } .ln th.q { text-align: center; } .ln td.n { padding-left: 16px; }
.tot { margin: 26px 0 0 auto; width: 46%; min-width: 280px; display: flex; flex-direction: column; } .tot > div { display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; color: var(--c-ink-soft); }
.tot .ok { color: var(--c-ok); } .tot .due { border-top: 1px solid var(--c-ink); margin-top: 8px; padding-top: 14px; font-size: 20px; color: var(--c-ink); font-weight: 500; } .paynow { margin-top: 12px; align-self: flex-end; }
.bank { margin-top: 34px; padding-top: 24px; border-top: 1px solid var(--c-rule); } .bg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 24px; margin: 12px 0; } .bg b { font-weight: 500; font-size: 15px; }
.foot { margin: 26px 0 0; font-size: 13px; color: var(--c-muted); }
@media (max-width: 760px) { .ti { padding: 26px 20px; } .hd { flex-direction: column; } .rt { align-items: flex-start; text-align: left; } .info, .bg { grid-template-columns: 1fr; } .tot { width: 100%; } }
@media print { .ti { border: 0; padding: 0; } .paynow { display: none; } }
</style>
