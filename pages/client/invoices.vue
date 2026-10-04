<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useHead({ title: 'Invoices & payments' })
interface I { id: string; number: string; currency: string; amount: string; status: string; issue_date: string; due_date: string; paid_at: string | null; paid_via: string | null; company: string | null; overdue: boolean; summary: string; link: string }
const { data } = await usePortalFetch<I[]>('/api/portal/invoices')
const unpaid = computed(() => (data.value ?? []).filter((i) => i.status === 'sent'))
const paid = computed(() => (data.value ?? []).filter((i) => i.status === 'paid'))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const VIA: Record<string, string> = { stripe: 'Card', paystack: 'Paystack', manual: 'Bank transfer' }
</script>
<template>
  <section v-if="data">
    <h1>Invoices &amp; payments</h1>
    <h2>To pay</h2>
    <div class="box"><table v-if="unpaid.length"><tbody><tr v-for="i in unpaid" :key="i.id"><td><b class="m">{{ i.number }}</b><span class="s">{{ i.summary }}{{ i.company ? ' · ' + i.company : '' }}</span></td>
      <td><span class="chip" :class="{ over: i.overdue }">{{ i.overdue ? 'Overdue · ' : 'Due ' }}{{ day(i.due_date) }}</span></td><td class="n"><b><Money :value="i.amount" :currency="i.currency" /></b></td><td class="n"><a :href="i.link" class="btn">View &amp; pay</a></td></tr></tbody></table>
      <p v-else class="none">Nothing to pay. Thank you.</p></div>
    <h2>Payments made</h2>
    <div class="box"><table v-if="paid.length"><thead><tr><th>Date</th><th>Invoice</th><th>Paid by</th><th class="n">Amount</th><th /></tr></thead>
      <tbody><tr v-for="i in paid" :key="i.id"><td class="dt">{{ i.paid_at ? day(i.paid_at) : '—' }}</td><td><b class="m">{{ i.number }}</b><span class="s">{{ i.summary }}</span></td><td>{{ VIA[i.paid_via ?? ''] ?? '—' }}</td>
        <td class="n pos"><Money :value="i.amount" :currency="i.currency" /></td><td class="n"><a :href="i.link" class="link">Receipt</a></td></tr></tbody></table>
      <p v-else class="none">No payments yet.</p></div>
  </section>
</template>
<style scoped>
h1 { margin: 0 0 8px; } h2 { font-size: 19px; margin: 22px 0 10px; } .box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 400; font-size: 13px; color: var(--c-muted); padding: 12px 16px; border-bottom: 1px solid var(--c-rule); } td { padding: 14px 16px; border-bottom: 1px solid var(--c-rule); font-size: 14.5px; vertical-align: middle; }
.m { font-family: ui-monospace, Menlo, monospace; font-weight: 500; } .s { display: block; font-size: 12.5px; color: var(--c-muted); } .n { text-align: right; white-space: nowrap; } .pos { color: var(--c-ok); } .dt { white-space: nowrap; color: var(--c-ink-soft); }
.chip { font-size: 13px; background: var(--c-paper-2); padding: 4px 10px; white-space: nowrap; } .chip.over { color: var(--c-danger); background: rgba(180,35,24,.08); }
a.btn { text-decoration: none; } .link { color: var(--c-blue-deep); } .none { padding: 18px; color: var(--c-muted); margin: 0; }
</style>
