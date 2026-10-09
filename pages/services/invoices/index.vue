<script setup lang="ts">
useHead({ title: 'Invoices' })
interface I { id: string; number: string; client_id: string; client: string; company: string | null; currency: string; amount: string; status: string; issue_date: string; due_date: string; overdue: boolean; job_id: string | null; job: string | null; paid_via: string | null; country: string | null; tax_amount: string }
const { data } = await useFetch<{ invoices: I[]; kpis: { currency: string; outstanding: number; overdue: number; paid30: number }[] }>('/api/services/invoices')
const filter = ref<'all' | 'unpaid' | 'overdue' | 'paid'>('all')
const shown = computed(() => (data.value?.invoices ?? []).filter((i) => filter.value === 'all' || (filter.value === 'unpaid' ? i.status === 'sent' : filter.value === 'overdue' ? i.overdue : i.status === 'paid')))
const money = (v: string | number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(v))
const kpis = computed(() => (data.value?.kpis ?? []).filter((k) => k.currency === 'USD' || k.outstanding || k.paid30))
</script>

<template>
  <section v-if="data">
    <CsNav />
    <CsBillingTabs />
    <div class="head"><h1>Invoices</h1><NuxtLink to="/services/invoices/new" class="btn">New invoice</NuxtLink></div>
    <div class="kpis"><div v-for="k in kpis" :key="k.currency" class="kpi"><span>Outstanding ({{ k.currency }})</span><b>{{ money(k.outstanding, k.currency) }}</b><em :class="{ error: k.overdue }">{{ money(k.overdue, k.currency) }} overdue · {{ money(k.paid30, k.currency) }} paid in 30 days</em></div></div>
    <div v-if="data.invoices.length" class="card donut"><DonutChart title="Invoices by status" total-label="Invoices" :segments="['sent', 'paid', 'draft', 'void'].map((s) => ({ label: s === 'sent' ? 'Unpaid' : s[0]!.toUpperCase() + s.slice(1), value: data!.invoices.filter((i) => i.status === s).length }))" /></div>
    <div class="filters"><button v-for="f in (['all', 'unpaid', 'overdue', 'paid'] as const)" :key="f" :class="{ on: filter === f }" @click="filter = f">{{ f[0]!.toUpperCase() + f.slice(1) }}</button></div>
    <table class="table">
      <thead><tr><th>Invoice</th><th>Client</th><th>Job</th><th>Issued</th><th>Due</th><th class="n">Amount</th><th>Status</th></tr></thead>
      <tbody><tr v-for="i in shown" :key="i.id">
        <td><NuxtLink :to="'/services/invoices/' + i.id" class="co">{{ i.number }}</NuxtLink></td>
        <td><NuxtLink :to="'/services/clients/' + i.client_id">{{ i.client }}</NuxtLink><span v-if="i.company" class="sub">{{ i.company }}</span></td><td><NuxtLink v-if="i.job_id" :to="'/services/' + i.job_id">{{ i.job }}</NuxtLink><span v-else class="sub">—</span></td>
        <td>{{ i.issue_date }}</td><td>{{ i.due_date }}</td><td class="n">{{ money(i.amount, i.currency) }}<span v-if="Number(i.tax_amount)" class="sub">incl. VAT {{ money(i.tax_amount, i.currency) }}</span></td><td><span class="st" :class="i.overdue ? 'overdue' : i.status">{{ i.overdue ? 'overdue' : i.status }}</span><span v-if="i.status === 'paid' && i.paid_via" class="sub">{{ i.paid_via === 'wallet' ? 'from wallet' : i.paid_via === 'manual' ? 'by transfer' : 'online' }}</span></td>
      </tr></tbody>
    </table>
    <p v-if="!shown.length" class="muted">No invoices here.</p>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin-bottom: 16px; align-items: end; } .frm > label { display: flex; flex-direction: column; gap: 6px; } .wide { grid-column: 1 / -1; }
input, select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.chk { display: flex !important; flex-direction: row !important; gap: 8px; align-items: center; font-size: 13px; } .chk input { width: auto; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid var(--c-rule); margin-bottom: 14px; }
th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); font-weight: 500; font-size: 12.5px; color: var(--c-muted); } td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .n { text-align: right; font-variant-numeric: tabular-nums; }
.co { color: var(--c-navy); font-weight: 500; } .sub { display: block; font-size: 12px; color: var(--c-muted); } .link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.st { font-size: 13px; font-weight: 500; text-transform: capitalize; } .st.paid { color: var(--c-ok); } .st.sent { color: var(--c-blue-deep); } .st.overdue { color: var(--c-danger); } .st.draft, .st.void { color: var(--c-muted); }
.muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 900px) { .frm { grid-template-columns: 1fr; } }

.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 14px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; } .kpi span { font-size: 12.5px; color: var(--c-muted); font-weight: 500; }
.kpi b { font-family: var(--font-heading); font-weight: 500; font-size: 30px; color: var(--c-navy); } .kpi em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.donut { margin-bottom: 14px; max-width: 620px; }
.filters { display: flex; gap: 6px; margin-bottom: 10px; } .filters button { font: inherit; font-size: 13px; background: #fff; border: 1px solid var(--c-rule); padding: 5px 12px; cursor: pointer; color: var(--c-ink-soft); } .filters button.on { border-color: var(--c-navy); color: var(--c-navy); }
</style>
