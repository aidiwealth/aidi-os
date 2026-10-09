<script setup lang="ts">
// Service jobs with what each one costs and whether it is paid — linked to the invoice and to the job's updates.
useHead({ title: 'Service jobs' })
interface Inv { id: string; number: string; currency: string; amount: number; status: string; paid_via: string | null; overdue: boolean; link: string }
interface J { id: string; title: string; status: string; company: string | null; created_at: string; invoices: Inv[] }
const { data } = await usePortalFetch<J[]>('/api/portal/jobs')
const ST: Record<string, string> = { new: 'Received', in_progress: 'In progress', waiting_client: 'Waiting on you', completed: 'Completed' }
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const VIA: Record<string, string> = { wallet: 'from wallet', stripe: 'by card', paystack: 'online', manual: 'by transfer' }
</script>
<template>
  <section v-if="data">
    <ClientTabs />
    <BillingTabs />
    <h1>Service jobs</h1>
    <div class="box"><table v-if="data.length"><thead><tr><th>Job</th><th>Status</th><th>Billing</th></tr></thead><tbody>
      <tr v-for="j in data" :key="j.id"><td><NuxtLink :to="'/client/jobs/' + j.id" class="t">{{ j.title }}</NuxtLink><span class="s">{{ j.company ?? 'General' }} · {{ day(j.created_at) }}</span></td><td><span class="pill" :class="j.status">{{ ST[j.status] ?? j.status }}</span></td>
        <td><div v-for="i in j.invoices" :key="i.id" class="iv"><a :href="i.link">{{ i.number }}</a> · <Money :value="i.amount" :currency="i.currency" /> · <span :class="i.overdue ? 'over' : i.status">{{ i.status === 'paid' ? 'Paid ' + (VIA[i.paid_via ?? ''] ?? '') : i.overdue ? 'Overdue' : 'To pay' }}</span><NuxtLink v-if="i.status === 'sent'" to="/client/invoices" class="pay">Pay</NuxtLink></div><span v-if="!j.invoices.length" class="s">No invoice yet</span></td></tr>
    </tbody></table><EmptyState v-else icon="company_services" title="No service jobs yet" text="Order a service and it shows here with its invoice."><NuxtLink to="/client/order" class="btn">Order a service</NuxtLink></EmptyState></div>
  </section>
</template>
<style scoped>
h1 { margin: 0 0 12px; } .box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 13px; color: var(--c-muted); padding: 12px 16px; border-bottom: 1px solid var(--c-rule); } td { padding: 14px 16px; border-bottom: 1px solid var(--c-rule); font-size: 14px; vertical-align: top; }
.t { color: var(--c-navy); font-weight: 500; text-decoration: none; } .s { display: block; font-size: 12.5px; color: var(--c-muted); } .pill { font-size: 12.5px; background: var(--c-paper-2); padding: 3px 9px; white-space: nowrap; } .pill.waiting_client { color: var(--c-warn); } .pill.completed { color: var(--c-ok); }
.iv { font-size: 13.5px; } .iv a { color: var(--c-blue-deep); } .paid { color: var(--c-ok); } .over { color: var(--c-danger); } .pay { margin-left: 8px; font-weight: 600; color: var(--c-blue-deep); } a.btn { text-decoration: none; }
</style>
