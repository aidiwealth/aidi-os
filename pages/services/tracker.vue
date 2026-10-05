<script setup lang="ts">
// Services tracker: every client request by status, and every client's compliance calendar, with actions.
useHead({ title: 'Tracker' })
interface J { id: string; title: string; service: string; status: string; priority: string; due_date: string | null; created_at: string; updated_at: string; completed_at: string | null; client_id: string; client: string; owner: string | null }
interface O { id: string; title: string; category: string; jurisdiction: string | null; recurrence: string; next_due: string; days_left: number; client_id: string; client: string; company: string; last_done: string | null; last_note: string | null }
const { data, refresh } = await useFetch<{ jobs: J[]; compliance: O[]; done: { id: string; title: string; completed_on: string; note: string | null; company: string }[] }>('/api/services/tracker')
const tab = ref<'overview' | 'requests' | 'compliance'>('overview'); const q = ref(''); const st = ref(''); const cf = ref<'all' | 'overdue' | 'soon' | 'later'>('all')
const ST: Record<string, string> = { new: 'New', in_progress: 'In progress', waiting_client: 'Waiting on client', completed: 'Done', cancelled: 'Cancelled' }
const jobs = computed(() => data.value?.jobs ?? []); const comp = computed(() => data.value?.compliance ?? [])
const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
const k = computed(() => ({ open: jobs.value.filter((j) => ['new', 'in_progress', 'waiting_client'].includes(j.status)).length, fresh: jobs.value.filter((j) => j.status === 'new').length, waiting: jobs.value.filter((j) => j.status === 'waiting_client').length,
  doneMonth: jobs.value.filter((j) => j.status === 'completed' && j.completed_at && j.completed_at >= month).length, overdue: comp.value.filter((o) => o.days_left < 0).length, soon: comp.value.filter((o) => o.days_left >= 0 && o.days_left <= 30).length }))
const counts = computed(() => Object.fromEntries(Object.keys(ST).map((s) => [s, jobs.value.filter((j) => j.status === s).length])))
const reqs = computed(() => jobs.value.filter((j) => (!st.value || j.status === st.value) && (!q.value || (j.title + ' ' + j.client).toLowerCase().includes(q.value.toLowerCase()))))
const comps = computed(() => comp.value.filter((o) => (cf.value === 'all' || (cf.value === 'overdue' ? o.days_left < 0 : cf.value === 'soon' ? o.days_left >= 0 && o.days_left <= 30 : o.days_left > 30)) && (!q.value || (o.title + ' ' + o.company + ' ' + o.client).toLowerCase().includes(q.value.toLowerCase()))))
const tone = (n: number) => (n < 0 ? 'red' : n <= 7 ? 'amber' : n <= 30 ? 'blue' : 'grey')
const when = (n: number) => (n < 0 ? Math.abs(n) + 'd overdue' : n === 0 ? 'Today' : 'In ' + n + 'd')
const day = (d: string | null) => (d ? new Date(d.length === 10 ? d + 'T00:00:00Z' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const msg = ref(''); const ok = ref(''); const busy = ref('')
async function act(o: O, action: 'remind' | 'job' | 'done') { if (action === 'done' && !confirm('Mark "' + o.title + '" for ' + o.company + ' as filed?')) return; busy.value = o.id + action; msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ sent?: number; job_id?: string }>('/api/services/tracker/action', { method: 'POST', body: { obligation_id: o.id, action } }); ok.value = action === 'remind' ? 'Reminder sent to ' + (r.sent ?? 0) + ' people at ' + o.company + '.' : action === 'job' ? 'Job opened.' : 'Marked filed; the next deadline is set.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' } finally { busy.value = '' } }
</script>
<template>
  <section v-if="data">
    <p class="label">Services desk</p><div class="hd"><h1>Tracker</h1><input v-model="q" placeholder="Search client, company or filing" aria-label="Search"></div>
    <div class="kp"><button class="k" @click="tab = 'requests'; st = 'new'"><em>New requests</em><b>{{ k.fresh }}</b></button><button class="k" @click="tab = 'requests'; st = ''"><em>Open requests</em><b>{{ k.open }}</b></button><button class="k" @click="tab = 'requests'; st = 'waiting_client'"><em>Waiting on client</em><b>{{ k.waiting }}</b></button>
      <div class="k"><em>Done this month</em><b class="g">{{ k.doneMonth }}</b></div><button class="k" @click="tab = 'compliance'; cf = 'overdue'"><em>Filings overdue</em><b :class="{ r: k.overdue }">{{ k.overdue }}</b></button><button class="k" @click="tab = 'compliance'; cf = 'soon'"><em>Filings due in 30 days</em><b>{{ k.soon }}</b></button></div>
    <nav class="tabs"><button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">Overview</button><button :class="{ on: tab === 'requests' }" @click="tab = 'requests'">Requests <em>{{ jobs.length }}</em></button><button :class="{ on: tab === 'compliance' }" @click="tab = 'compliance'">Client compliance <em>{{ comp.length }}</em></button></nav>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>

    <div v-if="tab === 'overview'" class="ov">
      <div class="card"><h3>Needs attention</h3>
        <div v-for="o in comp.filter((x) => x.days_left < 0).slice(0, 6)" :key="o.id" class="li"><span><b>{{ o.title }}</b><em>{{ o.company }}</em></span><span class="pill red">{{ when(o.days_left) }}</span></div>
        <div v-for="j in jobs.filter((x) => x.status === 'waiting_client').slice(0, 6)" :key="j.id" class="li"><span><NuxtLink :to="'/services/' + j.id"><b>{{ j.title }}</b></NuxtLink><em>{{ j.client }}</em></span><span class="pill amber">Waiting on client</span></div>
        <EmptyState v-if="!k.overdue && !k.waiting" compact icon="compliance" title="Nothing needs attention" /></div>
      <div class="card"><h3>Due in the next 30 days</h3>
        <div v-for="o in comp.filter((x) => x.days_left >= 0 && x.days_left <= 30).slice(0, 10)" :key="o.id" class="li"><span><b>{{ o.title }}</b><em>{{ o.company }} · {{ day(o.next_due) }}</em></span><span class="pill" :class="tone(o.days_left)">{{ when(o.days_left) }}</span></div>
        <EmptyState v-if="!k.soon" compact icon="compliance" title="No filings due soon" /></div>
      <div class="card"><h3>Recently filed</h3>
        <div v-for="d in data.done.slice(0, 10)" :key="d.id" class="li"><span><b>{{ d.title }}</b><em>{{ d.company }}{{ d.note ? ' · ' + d.note : '' }}</em></span><span class="pill g">{{ day(d.completed_on) }}</span></div>
        <EmptyState v-if="!data.done.length" compact icon="compliance" title="Nothing filed in the last 90 days" /></div>
      <div class="card"><h3>New requests</h3>
        <div v-for="j in jobs.filter((x) => x.status === 'new').slice(0, 8)" :key="j.id" class="li"><span><NuxtLink :to="'/services/' + j.id"><b>{{ j.title }}</b></NuxtLink><em>{{ j.client }} · {{ day(j.created_at) }}</em></span><span class="pill blue">New</span></div>
        <EmptyState v-if="!k.fresh" compact icon="services" title="No new requests" /></div>
    </div>

    <template v-else-if="tab === 'requests'">
      <div class="chips"><button :class="{ on: !st }" @click="st = ''">All {{ jobs.length }}</button><button v-for="(l, s) in ST" :key="s" :class="{ on: st === s }" @click="st = s">{{ l }} {{ counts[s] }}</button></div>
      <div class="box"><table v-if="reqs.length"><thead><tr><th>Request</th><th>Client</th><th>Status</th><th>Owner</th><th>Due</th><th>Updated</th></tr></thead>
        <tbody><tr v-for="j in reqs" :key="j.id"><td><NuxtLink :to="'/services/' + j.id" class="t">{{ j.title }}</NuxtLink><span class="sub">{{ j.service.replace(/_/g, ' ') }}{{ j.priority === 'high' ? ' · high priority' : '' }}</span></td><td>{{ j.client }}</td>
          <td><span class="pill" :class="{ blue: j.status === 'new', amber: j.status === 'waiting_client', g: j.status === 'completed', grey: j.status === 'cancelled' }">{{ ST[j.status] }}</span></td><td class="mut">{{ j.owner ?? 'Unassigned' }}</td><td class="mut">{{ day(j.due_date) }}</td><td class="mut">{{ day(j.updated_at) }}</td></tr></tbody></table>
        <EmptyState v-else icon="services" title="No requests match" /></div>
    </template>

    <template v-else>
      <div class="chips"><button v-for="[f, l] in [['all', 'All'], ['overdue', 'Overdue'], ['soon', 'Next 30 days'], ['later', 'Later']]" :key="f" :class="{ on: cf === f }" @click="cf = f as 'all'">{{ l }}</button></div>
      <div class="box"><table v-if="comps.length"><thead><tr><th>Filing</th><th>Company</th><th>Due</th><th>Last filed</th><th /></tr></thead>
        <tbody><tr v-for="o in comps" :key="o.id"><td><b>{{ o.title }}</b><span class="sub">{{ o.jurisdiction ?? '' }} · {{ o.recurrence }}</span></td><td>{{ o.company }}<span class="sub">{{ o.client }}</span></td>
          <td><span class="pill" :class="tone(o.days_left)">{{ when(o.days_left) }}</span><span class="sub">{{ day(o.next_due) }}</span></td><td class="mut">{{ day(o.last_done) }}</td>
          <td class="acts"><button class="btn secondary sm" :disabled="!!busy" @click="act(o, 'remind')">{{ busy === o.id + 'remind' ? 'Sending…' : 'Remind' }}</button><button class="btn secondary sm" :disabled="!!busy" @click="act(o, 'job')">Create job</button><button class="btn sm" :disabled="!!busy" @click="act(o, 'done')">Mark filed</button></td></tr></tbody></table>
        <EmptyState v-else icon="compliance" title="No filings match" text="Clients' compliance calendars appear here once their Finvry workspace is linked." /></div>
    </template>
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 0; } .hd input { font: inherit; font-size: 13.5px; padding: 8px 11px; border: 1px solid var(--c-rule-strong); min-width: 280px; }
.kp { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin: 16px 0; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; text-align: left; font: inherit; display: flex; flex-direction: column; gap: 3px; cursor: pointer; } button.k:hover { border-color: var(--c-navy); }
.k em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 26px; font-weight: 600; letter-spacing: -.02em; } .k b.r { color: var(--c-danger); } .k b.g { color: var(--c-ok); }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin-bottom: 14px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .tabs em { font-style: normal; font-size: 12px; background: var(--c-paper-2); padding: 1px 7px; margin-left: 4px; }
.ov { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .ov h3 { margin: 0 0 8px; font-size: 15.5px; } .li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--c-rule); } .li span:first-child { display: flex; flex-direction: column; min-width: 0; } .li b { font-size: 14px; font-weight: 600; color: var(--c-ink); } .li em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .li a { text-decoration: none; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: middle; }
.t { font-weight: 600; color: var(--c-ink); text-decoration: none; } .sub { display: block; font-size: 12px; color: var(--c-muted); text-transform: none; } .mut { color: var(--c-muted); } .acts { white-space: nowrap; text-align: right; } .acts .btn { margin-left: 6px; } .btn.sm { height: 30px; padding: 0 10px; font-size: 12.5px; }
.pill { font-size: 12px; font-weight: 500; padding: 3px 10px; white-space: nowrap; background: var(--c-paper-2); color: var(--c-ink-soft); } .pill.red { background: rgba(180,35,24,.08); color: var(--c-danger); } .pill.amber { background: rgba(181,71,8,.09); color: var(--c-warn); } .pill.blue { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pill.g { background: rgba(31,122,77,.1); color: var(--c-ok); }
.ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 1100px) { .kp { grid-template-columns: repeat(3, 1fr); } .ov { grid-template-columns: 1fr; } }
</style>
