<script setup lang="ts">
import type { JobRow } from '~/server/api/services/index.get'
useHead({ title: 'Jobs' })
const { data, error } = await useFetch<JobRow[]>('/api/services')
const { data: clients } = await useFetch<{ id: string; name: string; contact_name: string; email: string }[]>('/api/services/clients')
const SERVICES: Record<string, string> = { company_formation: 'Company formation', annual_compliance: 'Annual compliance', tax_filing: 'Tax filing', registered_agent: 'Registered agent', legal_review: 'Legal review', trust_setup: 'Trust set-up', banking_setup: 'Banking set-up', other: 'Other' }
const STATUS: Record<string, string> = { new: 'New', in_progress: 'In progress', waiting_client: 'Waiting on client', completed: 'Completed', cancelled: 'Cancelled' }
const filter = ref<'open' | 'new' | 'waiting' | 'overdue' | 'done' | 'all'>('open')
const q = ref('')
const isOpen = (r: JobRow) => !['completed', 'cancelled'].includes(r.status)
const rows = computed(() => (data.value ?? []).filter((r) => (filter.value === 'all' || (filter.value === 'overdue' ? r.overdue : filter.value === 'new' ? r.status === 'new' : filter.value === 'waiting' ? r.status === 'waiting_client' : filter.value === 'done' ? r.status === 'completed' : isOpen(r)))
  && (!q.value || (r.title + ' ' + r.client + ' ' + (r.owner ?? '')).toLowerCase().includes(q.value.toLowerCase()))))
const counts = computed(() => { const l = data.value ?? []; return { open: l.filter(isOpen).length, new: l.filter((r) => r.status === 'new').length, waiting: l.filter((r) => r.status === 'waiting_client').length, overdue: l.filter((r) => r.overdue).length, done: l.filter((r) => r.status === 'completed').length, all: l.length } })
const STEP = (s: string) => (s === 'completed' ? 3 : s === 'new' ? 1 : 2)
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
const left = (d: string | null) => (d ? Math.round((new Date(d + 'T12:00:00').getTime() - Date.now()) / 864e5) : null)
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 60 ? Math.max(1, m) + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago' }
const adding = ref(false)
const form = reactive({ client_id: '', name: '', contact_name: '', email: '', phone: '', country: '', service: 'company_formation', title: '', description: '', priority: 'normal', due_date: '', fee_usd: '', provider_entity_id: '' })
const msg = ref('')
async function add() {
  msg.value = ''
  const body = {
    client_id: form.client_id || undefined,
    client: form.client_id ? undefined : { name: form.name, contact_name: form.contact_name, email: form.email, phone: form.phone || undefined, country: form.country || undefined },
    service: form.service, title: form.title, description: form.description || undefined, priority: form.priority,
    due_date: form.due_date || undefined, fee_usd: form.fee_usd ? Number(form.fee_usd.replace(/[^0-9.]/g, '')) : undefined
  }
  try { const r = await $fetch<{ id: string }>('/api/services', { method: 'POST', body }); await navigateTo('/services/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not create the job.' }
}
const day = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
</script>

<template>
  <section>
    <CsNav />
    <div class="head">
      <div><p class="eyebrow">Services desk</p><h1>Jobs</h1><p class="lead">Every client order and request, with its status, due date and who is on it.</p></div>
      <div class="hacts"><NuxtLink to="/services/order" class="btn">New order</NuxtLink><button class="btn secondary" type="button" @click="adding = !adding">{{ adding ? 'Close' : 'Custom job' }}</button></div>
    </div>

    <form v-if="adding" class="card add" @submit.prevent="add">
      <label class="label wide">Client<select v-model="form.client_id"><option value="">+ New client</option><option v-for="c in clients ?? []" :key="c.id" :value="c.id">{{ c.name }} — {{ c.contact_name }}</option></select></label>
      <template v-if="!form.client_id">
        <label class="label">Client name<input v-model="form.name" required maxlength="200" placeholder="Company or person"></label>
        <label class="label">Contact name<input v-model="form.contact_name" required maxlength="200"></label>
        <label class="label">Contact email<input v-model="form.email" type="email" required maxlength="254"></label>
        <label class="label">Phone<input v-model="form.phone" maxlength="40"></label>
        <label class="label">Country<CountrySelect v-model="form.country" /></label>
      </template>
      <label class="label">Service<select v-model="form.service"><option v-for="(l, k) in SERVICES" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="label wide">Title<input v-model="form.title" required maxlength="200" placeholder="e.g. Delaware C-Corp formation for Acme"></label>
      <label class="label wide">Details<textarea v-model="form.description" rows="3" maxlength="5000" /></label>
      <label class="label">Priority<select v-model="form.priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
      <label class="label">Due<input v-model="form.due_date" type="date"></label>
      <label class="label">Fee (USD)<input v-model="form.fee_usd" inputmode="decimal"></label>
      <button class="btn" type="submit">Create job</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    </form>

    <div class="fx-stats">
      <StatTile clickable icon="briefcase" tone="n" label="Open jobs" :value="counts.open" :on="filter === 'open'" @click="filter = 'open'" />
      <StatTile clickable icon="inbox" tone="b" label="New" :value="counts.new" :on="filter === 'new'" @click="filter = 'new'" />
      <StatTile clickable icon="clock" :tone="counts.waiting ? 'a' : 'g'" label="Waiting on client" :value="counts.waiting" :on="filter === 'waiting'" @click="filter = 'waiting'" />
      <StatTile clickable icon="alert" :tone="counts.overdue ? 'r' : 'g'" label="Overdue" :value="counts.overdue" :red="!!counts.overdue" :on="filter === 'overdue'" @click="filter = 'overdue'" />
      <StatTile clickable icon="check" tone="g" label="Completed" :value="counts.done" :on="filter === 'done'" @click="filter = 'done'" />
    </div>
    <div class="bar"><div class="chips"><button v-for="[k, l] in ([['open', 'Open'], ['new', 'New'], ['waiting', 'Waiting on client'], ['overdue', 'Overdue'], ['done', 'Completed'], ['all', 'All']] as const)" :key="k" type="button" :class="{ on: filter === k }" @click="filter = k">{{ l }} <i>{{ counts[k] }}</i></button></div>
      <input v-model="q" placeholder="Search job, client or owner" aria-label="Search"></div>
    <p v-if="error" class="error" role="alert">Could not load jobs.</p>
    <div v-else-if="!rows.length" class="empty"><b>No jobs here</b><span>Try another filter, or start a new order.</span></div>
    <div v-else class="list">
      <NuxtLink v-for="r in rows" :key="r.id" :to="'/services/' + r.id" class="row" :class="{ late: r.overdue }">
        <span class="fx-mono">{{ initials(r.client) }}</span>
        <div class="jt"><b>{{ r.title.replace(/^Order: /, '') }}</b><span>{{ r.client }} · {{ SERVICES[r.service] ?? 'Order' }}<template v-if="r.provider"> · {{ r.provider }}</template></span>
          <span v-if="r.status !== 'cancelled'" class="stp"><i v-for="n in 3" :key="n" :class="{ on: n <= STEP(r.status), warn: r.status === 'waiting_client' && n === 2 }" /></span></div>
        <span class="pill" :data-s="r.status">{{ STATUS[r.status] }}</span>
        <span v-if="r.priority === 'high'" class="hi">High</span><span v-else />
        <span class="due" :class="{ red: r.overdue }"><em>Due</em>{{ day(r.due_date) }}<i v-if="r.due_date && isOpen(r)">{{ r.overdue ? Math.abs(left(r.due_date) ?? 0) + 'd overdue' : 'in ' + left(r.due_date) + 'd' }}</i></span>
        <span class="own"><span v-if="r.owner" class="av" :title="r.owner">{{ initials(r.owner) }}</span><span v-else class="un">Unassigned</span><em>{{ ago(r.updated_at) }}</em></span>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin: 4px 0 18px; } .eyebrow { margin: 0 0 4px; font-size: 13px; color: var(--c-muted); } .head h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); font-size: 14.5px; }
.bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; } .bar input { min-width: 260px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { font: inherit; font-size: 13px; background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; cursor: pointer; } .chips button.on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); } .chips i { font-style: normal; opacity: .65; margin-left: 4px; }
.stp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; max-width: 220px; margin-top: 5px; } .stp i { height: 4px; background: var(--c-paper-2); } .stp i.on { background: var(--c-blue-deep); } .stp i.warn { background: var(--c-warn); }
.list { background: #fff; border: 1px solid var(--c-rule); } .row { display: grid; grid-template-columns: 42px minmax(0, 1fr) 150px 50px 150px 150px; gap: 14px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--c-rule); text-decoration: none; color: inherit; transition: background .12s; } .row:last-child { border-bottom: 0; } .row:hover { background: #fbfaf7; } .row.late .due em { color: var(--c-danger); }
.mono { width: 40px; height: 40px; background: var(--c-navy); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 13px; }
.jt { display: flex; flex-direction: column; gap: 3px; min-width: 0; } .jt b { font-weight: 600; color: var(--c-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .jt span { font-size: 13px; color: var(--c-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill { justify-self: start; font-size: 12px; font-weight: 600; padding: 4px 10px; background: var(--c-paper-2); color: var(--c-ink-soft); white-space: nowrap; } .pill[data-s="new"] { background: #eef4ff; color: #2c5cc5; } .pill[data-s="in_progress"] { background: #fff6e6; color: #a5650b; } .pill[data-s="waiting_client"] { background: #fdecef; color: #b4234a; } .pill[data-s="completed"] { background: #e8f0f8; color: #23784a; }
.hi { font-size: 11px; font-weight: 700; color: var(--c-danger); text-transform: uppercase; letter-spacing: .04em; }
.due { display: flex; flex-direction: column; gap: 1px; font-size: 13.5px; } .due em { font-style: normal; font-size: 11.5px; color: var(--c-muted); } .due i { font-style: normal; font-size: 12px; color: var(--c-blue-deep); font-weight: 500; } .due.red, .due.red i { color: var(--c-danger); }
.own { display: flex; align-items: center; gap: 8px; justify-content: flex-end; } .own em { font-style: normal; font-size: 12px; color: var(--c-muted); } .av { width: 28px; height: 28px; border-radius: 50%; background: var(--c-signal-soft); color: var(--c-blue-deep); display: grid; place-items: center; font-size: 11px; font-weight: 600; } .un { font-size: 12px; color: var(--c-muted); }
.empty { display: flex; flex-direction: column; gap: 4px; align-items: center; padding: 40px; background: #fff; border: 1px solid var(--c-rule); color: var(--c-muted); } .empty b { color: var(--c-ink); }
@media (max-width: 1000px) { .row { grid-template-columns: 42px 1fr auto; } .row > .hi, .row > .due, .row > .own, .row > span:empty { display: none; } }
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
.hacts { display: flex; gap: 8px; } .hacts a.btn { text-decoration: none; }
</style>
