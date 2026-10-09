<script setup lang="ts">
// Billing by job: each job with its invoices (paid, unpaid, from wallet), and jobs that have not been invoiced.
useHead({ title: 'Billing by job' })
interface Inv { id: string; number: string; currency: string; amount: number; status: string; paid_via: string | null; overdue: boolean }
interface J { id: string; title: string; status: string; client_id: string; client: string; company: string | null; created_at: string; invoices: Inv[] }
const { data } = await useFetch<J[]>('/api/services/invoices/by-job')
const view = ref<'all' | 'unbilled' | 'unpaid'>('all')
const shown = computed(() => (data.value ?? []).filter((j) => view.value === 'all' || (view.value === 'unbilled' ? !j.invoices.length : j.invoices.some((i) => i.status === 'sent'))))
const money = (v: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(v))
const ST: Record<string, string> = { new: 'New', in_progress: 'In progress', waiting_client: 'Waiting on client', completed: 'Completed' }
const count = (k: 'unbilled' | 'unpaid') => (data.value ?? []).filter((j) => (k === 'unbilled' ? !j.invoices.length : j.invoices.some((i) => i.status === 'sent'))).length
</script>
<template>
  <section v-if="data">
    <CsNav />
    <CsBillingTabs />
    <div class="head"><h1>Billing by job</h1><NuxtLink to="/services/invoices/new" class="btn">New invoice</NuxtLink></div>
    <div class="filters"><button :class="{ on: view === 'all' }" @click="view = 'all'">All jobs</button><button :class="{ on: view === 'unbilled' }" @click="view = 'unbilled'">Not invoiced ({{ count('unbilled') }})</button><button :class="{ on: view === 'unpaid' }" @click="view = 'unpaid'">Awaiting payment ({{ count('unpaid') }})</button></div>
    <table class="table"><thead><tr><th>Job</th><th>Client</th><th>Status</th><th>Invoices</th><th /></tr></thead><tbody>
      <tr v-for="j in shown" :key="j.id"><td><NuxtLink :to="'/services/' + j.id" class="co">{{ j.title }}</NuxtLink><span class="sub">Opened {{ j.created_at }}</span></td>
        <td><NuxtLink :to="'/services/clients/' + j.client_id">{{ j.client }}</NuxtLink><span v-if="j.company" class="sub">{{ j.company }}</span></td><td>{{ ST[j.status] ?? j.status }}</td>
        <td><div v-for="i in j.invoices" :key="i.id" class="iv"><NuxtLink :to="'/services/invoices/' + i.id">{{ i.number }}</NuxtLink> · {{ money(i.amount, i.currency) }} · <span :class="i.overdue ? 'overdue' : i.status">{{ i.overdue ? 'overdue' : i.status === 'sent' ? 'unpaid' : i.status === 'paid' ? 'paid' + (i.paid_via === 'wallet' ? ' from wallet' : '') : i.status }}</span></div><span v-if="!j.invoices.length" class="sub warn">Not invoiced</span></td>
        <td class="n"><NuxtLink :to="{ path: '/services/invoices/new', query: { client: j.client_id, job: j.id } }" class="lk">{{ j.invoices.length ? 'Add invoice' : 'Invoice it' }}</NuxtLink></td></tr>
    </tbody></table>
    <p v-if="!shown.length" class="muted">Nothing here.</p>
  </section>
</template>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 14px; } .head h1 { margin: 0; }
.filters { display: flex; gap: 6px; margin-bottom: 10px; } .filters button { font: inherit; font-size: 13px; background: #fff; border: 1px solid var(--c-rule); padding: 5px 12px; cursor: pointer; color: var(--c-ink-soft); } .filters button.on { border-color: var(--c-navy); color: var(--c-navy); }
.table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid var(--c-rule); } th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); font-weight: 500; font-size: 12.5px; color: var(--c-muted); } td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; font-size: 14px; }
.co { color: var(--c-navy); font-weight: 500; } .sub { display: block; font-size: 12px; color: var(--c-muted); } .warn { color: var(--c-warn); } .iv { font-size: 13px; } .iv a, td a { color: var(--c-blue-deep); } .paid { color: var(--c-ok); } .overdue { color: var(--c-danger); } .n { text-align: right; white-space: nowrap; } .lk { font-size: 13px; } .muted { color: var(--c-muted); }
</style>
