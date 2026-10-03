<script setup lang="ts">
import type { JobRow } from '~/server/api/services/index.get'
useHead({ title: 'Jobs' })
const { data, error } = await useFetch<JobRow[]>('/api/services')
const { data: clients } = await useFetch<{ id: string; name: string; contact_name: string; email: string }[]>('/api/services/clients')
const { data: entities } = await useFetch<{ id: string; name: string; kind: string }[]>('/api/entities')
const SERVICES: Record<string, string> = { company_formation: 'Company formation', annual_compliance: 'Annual compliance', tax_filing: 'Tax filing', registered_agent: 'Registered agent', legal_review: 'Legal review', trust_setup: 'Trust set-up', banking_setup: 'Banking set-up', other: 'Other' }
const STATUS: Record<string, string> = { new: 'New', in_progress: 'In progress', waiting_client: 'Waiting on client', completed: 'Completed', cancelled: 'Cancelled' }
const filter = ref<'open' | 'overdue' | 'all'>('open')
const rows = computed(() => (data.value ?? []).filter((r) => filter.value === 'all' || (filter.value === 'overdue' ? r.overdue : !['completed', 'cancelled'].includes(r.status))))
const counts = computed(() => ({ open: (data.value ?? []).filter((r) => !['completed', 'cancelled'].includes(r.status)).length, overdue: (data.value ?? []).filter((r) => r.overdue).length }))
const adding = ref(false)
const form = reactive({ client_id: '', name: '', contact_name: '', email: '', phone: '', country: '', service: 'company_formation', title: '', description: '', priority: 'normal', due_date: '', fee_usd: '', provider_entity_id: '' })
const msg = ref('')
async function add() {
  msg.value = ''
  const body = {
    client_id: form.client_id || undefined,
    client: form.client_id ? undefined : { name: form.name, contact_name: form.contact_name, email: form.email, phone: form.phone || undefined, country: form.country || undefined },
    service: form.service, title: form.title, description: form.description || undefined, priority: form.priority,
    due_date: form.due_date || undefined, fee_usd: form.fee_usd ? Number(form.fee_usd.replace(/[^0-9.]/g, '')) : undefined, provider_entity_id: form.provider_entity_id || undefined
  }
  try { const r = await $fetch<{ id: string }>('/api/services', { method: 'POST', body }); await navigateTo('/services/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not create the job.' }
}
const day = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
</script>

<template>
  <section>
    <p class="label">Client Services</p>
    <div class="head">
      <h1>Jobs</h1>
      <button class="btn" type="button" @click="adding = !adding">{{ adding ? 'Close' : 'New job' }}</button>
    </div>

    <form v-if="adding" class="card add" @submit.prevent="add">
      <label class="label wide">Client<select v-model="form.client_id"><option value="">+ New client</option><option v-for="c in clients ?? []" :key="c.id" :value="c.id">{{ c.name }} — {{ c.contact_name }}</option></select></label>
      <template v-if="!form.client_id">
        <label class="label">Client name<input v-model="form.name" required maxlength="200" placeholder="Company or person"></label>
        <label class="label">Contact name<input v-model="form.contact_name" required maxlength="200"></label>
        <label class="label">Contact email<input v-model="form.email" type="email" required maxlength="254"></label>
        <label class="label">Phone<input v-model="form.phone" maxlength="40"></label>
        <label class="label">Country<input v-model="form.country" maxlength="100"></label>
      </template>
      <label class="label">Service<select v-model="form.service"><option v-for="(l, k) in SERVICES" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="label wide">Title<input v-model="form.title" required maxlength="200" placeholder="e.g. Delaware C-Corp formation for Acme"></label>
      <label class="label wide">Details<textarea v-model="form.description" rows="3" maxlength="5000" /></label>
      <label class="label">Priority<select v-model="form.priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
      <label class="label">Due<input v-model="form.due_date" type="date"></label>
      <label class="label">Fee (USD)<input v-model="form.fee_usd" inputmode="decimal"></label>
      <label class="label">Delivered by<select v-model="form.provider_entity_id"><option value="">—</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      <button class="btn" type="submit">Create job</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    </form>

    <div class="tabs">
      <button :class="{ on: filter === 'open' }" @click="filter = 'open'">Open ({{ counts.open }})</button>
      <button :class="{ on: filter === 'overdue' }" @click="filter = 'overdue'">Overdue ({{ counts.overdue }})</button>
      <button :class="{ on: filter === 'all' }" @click="filter = 'all'">All</button>
    </div>
    <p v-if="error" class="error" role="alert">Could not load jobs.</p>
    <p v-else-if="!rows.length" class="muted">No jobs here.</p>
    <table v-else class="table">
      <thead><tr><th>Job</th><th>Client</th><th>Status</th><th>Due</th><th>Owner</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" :class="{ late: r.overdue }">
          <td><NuxtLink :to="'/services/' + r.id" class="co">{{ r.title }}</NuxtLink><span class="sub">{{ SERVICES[r.service] }}<template v-if="r.priority === 'high'"> · <b class="hi">High</b></template><template v-if="r.provider"> · {{ r.provider }}</template></span></td>
          <td>{{ r.client }}</td>
          <td><span class="st" :data-s="r.status">{{ STATUS[r.status] }}</span></td>
          <td :class="{ red: r.overdue }">{{ day(r.due_date) }}<span v-if="r.overdue" class="sub red">Overdue</span></td>
          <td class="muted">{{ r.owner ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; }
.add { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; align-items: end; margin-bottom: 20px; }
.add label { display: flex; flex-direction: column; gap: 6px; } .add .wide { grid-column: 1 / -1; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.tabs { margin-bottom: 12px; } .tabs button { font: inherit; background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 2px; margin-right: 18px; cursor: pointer; color: var(--c-muted); }
.tabs button.on { color: var(--c-navy); border-bottom-color: var(--c-navy); }
.table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); }
th { text-align: left; font-size: var(--type-label); letter-spacing: 0; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 13px 16px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
tr.late td:first-child { box-shadow: inset 3px 0 0 var(--c-danger); }
.co { color: var(--c-navy); font-weight: 500; text-decoration: none; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.hi { color: var(--c-danger); font-weight: 600; }
.st { font-size: 13px; } .st[data-s="waiting_client"] { color: var(--c-warn); } .st[data-s="completed"] { color: var(--c-ok); } .st[data-s="cancelled"] { color: var(--c-muted); }
.red { color: var(--c-danger); } .muted { color: var(--c-muted); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .add { grid-template-columns: 1fr; } }
</style>
