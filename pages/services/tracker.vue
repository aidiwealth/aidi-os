<script setup lang="ts">
// Services tracker: every client request by status, and every client's compliance calendar, with actions.
useHead({ title: 'Tracker' })
interface J { id: string; title: string; service: string; status: string; priority: string; due_date: string | null; created_at: string; updated_at: string; completed_at: string | null; client_id: string; client: string; owner: string | null }
interface O { id: string; service_code: string | null; reminder_days: number; notes: string | null; title: string; category: string; jurisdiction: string | null; recurrence: string; next_due: string; days_left: number; client_id: string; client: string; company: string; last_done: string | null; last_note: string | null }
const { data, refresh } = await useFetch<{ jobs: J[]; compliance: O[]; done: { id: string; title: string; completed_on: string; note: string | null; company: string }[]; clients: { id: string; name: string; has_workspace: boolean }[]; services: { code: string; name: string; billing: string }[] }>('/api/services/tracker')
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
const span = (n: number) => (n >= 365 ? (n / 365).toFixed(n >= 730 ? 0 : 1) + ' yr' : n >= 60 ? Math.round(n / 30) + ' mo' : n + ' d')
const when = (n: number) => (n < 0 ? span(Math.abs(n)) + ' overdue' : n === 0 ? 'Today' : 'In ' + span(n))
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
const mon = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short' }); const dd = (d: string) => new Date(d + 'T12:00:00').getDate()
const day = (d: string | null) => (d ? new Date(d.length === 10 ? d + 'T00:00:00Z' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const msg = ref(''); const ok = ref(''); const busy = ref('')
async function act(o: O, action: 'remind' | 'job' | 'done') { if (action === 'done' && !confirm('Mark "' + o.title + '" for ' + o.company + ' as filed?')) return; busy.value = o.id + action; msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ sent?: number; job_id?: string }>('/api/services/tracker/action', { method: 'POST', body: { obligation_id: o.id, action } }); ok.value = action === 'remind' ? 'Reminder sent to ' + (r.sent ?? 0) + ' people at ' + o.company + '.' : action === 'job' ? 'Job opened.' : 'Marked filed; the next deadline is set.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' } finally { busy.value = '' } }
// Add a filing or renewal to a client's calendar (tied to a service), or edit / remove one.
const todayIso = new Date().toISOString().slice(0, 10)
const blankF = () => ({ id: '', client_id: '', service_code: '', title: '', recurrence: 'annual', next_due: '', reminder_days: 30, notes: '', state: 'todo' as 'todo' | 'filed', filed_on: todayIso, create_job: true })
const cal = reactive({ open: false, ...blankF() })
function openAdd(clientId = '') { Object.assign(cal, blankF(), { open: true, client_id: clientId }) }
function openEdit(o: O) { Object.assign(cal, blankF(), { open: true, id: o.id, client_id: o.client_id, service_code: o.service_code ?? '', title: o.title, recurrence: o.recurrence, next_due: o.next_due, reminder_days: o.reminder_days ?? 30, notes: o.notes ?? '', create_job: false }) }
watch(() => cal.service_code, (c) => { if (cal.id) return; const s = data.value?.services.find((x) => x.code === c); if (s) { cal.title = s.name; cal.recurrence = s.billing === 'monthly' ? 'monthly' : s.billing === 'one_time' ? 'none' : 'annual' } })
const calPast = computed(() => !!cal.next_due && cal.next_due < todayIso)
const calClient = computed(() => data.value?.clients.find((c) => c.id === cal.client_id))
async function saveCal(remove = false) {
  if (remove && !confirm('Remove "' + cal.title + '" from this client\'s calendar?')) return
  busy.value = 'cal'; msg.value = ''; ok.value = ''
  try {
    const r = await $fetch<{ job_id?: string | null; workspace_created?: boolean }>('/api/services/tracker/obligation', { method: 'POST', body: { id: cal.id || undefined, remove, client_id: cal.client_id || undefined, service_code: cal.service_code, title: cal.title, recurrence: cal.recurrence, next_due: cal.next_due, reminder_days: cal.reminder_days, notes: cal.notes, filed_on: !cal.id && calPast.value && cal.state === 'filed' ? cal.filed_on : undefined, create_job: !cal.id && cal.create_job && !(calPast.value && cal.state === 'filed') } })
    ok.value = remove ? 'Removed from the client\'s calendar.' : cal.id ? 'Calendar item updated.' : 'Added to ' + (calClient.value?.name ?? 'the client') + '\'s calendar' + (r.job_id ? ' and a job opened' : '') + '.' + (r.workspace_created ? ' Their Finvry account was set up quietly (no email sent).' : '')
    cal.open = false; tab.value = 'compliance'; await refresh()
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' } finally { busy.value = '' }
}
</script>
<template>
  <section v-if="data">
    <div class="hd"><div><p class="eyebrow">Services desk</p><h1>Tracker</h1><p class="lead">Requests from clients and every client's filing calendar, in one place.</p></div><div class="hr"><input v-model="q" placeholder="Search client, company or filing" aria-label="Search"><button class="btn" type="button" @click="openAdd()">+ Add to client calendar</button></div></div>
    <div class="fx-stats">
      <StatTile clickable icon="inbox" tone="b" label="New requests" :value="k.fresh" :on="tab === 'requests' && st === 'new'" @click="tab = 'requests'; st = 'new'" />
      <StatTile clickable icon="briefcase" tone="n" label="Open requests" :value="k.open" :on="tab === 'requests' && !st" @click="tab = 'requests'; st = ''" />
      <StatTile clickable icon="clock" :tone="k.waiting ? 'a' : 'g'" label="Waiting on client" :value="k.waiting" :on="tab === 'requests' && st === 'waiting_client'" @click="tab = 'requests'; st = 'waiting_client'" />
      <StatTile icon="check" tone="g" label="Done this month" :value="k.doneMonth" />
      <StatTile clickable icon="alert" :tone="k.overdue ? 'r' : 'g'" label="Filings overdue" :value="k.overdue" :red="!!k.overdue" :on="tab === 'compliance' && cf === 'overdue'" @click="tab = 'compliance'; cf = 'overdue'" />
      <StatTile clickable icon="calendar" tone="c" label="Due in 30 days" :value="k.soon" :on="tab === 'compliance' && cf === 'soon'" @click="tab = 'compliance'; cf = 'soon'" />
    </div>
    <nav class="tabs"><button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">Overview</button><button :class="{ on: tab === 'requests' }" @click="tab = 'requests'">Requests <em>{{ jobs.length }}</em></button><button :class="{ on: tab === 'compliance' }" @click="tab = 'compliance'">Client compliance <em>{{ comp.length }}</em></button></nav>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>

    <div v-if="tab === 'overview'" class="ov">
      <div v-if="!k.overdue && !k.waiting" class="fx-allset w"><span class="fx-ck">✓</span><div><b>Nothing needs attention</b><span>No overdue filings and no jobs waiting on clients.</span></div></div>
      <div v-else class="card att w"><div class="fx-sh"><h2>Needs attention</h2><button type="button" @click="tab = 'compliance'; cf = 'overdue'">All overdue →</button></div>
        <div v-for="o in comp.filter((x) => x.days_left < 0).slice(0, 6)" :key="o.id" class="fx-row"><span class="fx-cal"><em>{{ mon(o.next_due) }}</em><b>{{ dd(o.next_due) }}</b></span><div class="fx-body"><b>{{ o.title }}</b><span>{{ o.company }} · due {{ day(o.next_due) }}</span></div>
          <div class="qa"><button type="button" :disabled="!!busy" @click="act(o, 'job')">Create job</button><button type="button" :disabled="!!busy" @click="act(o, 'done')">Mark filed</button><button type="button" @click="openEdit(o)">Edit</button></div><span class="fx-pill red">{{ when(o.days_left) }}</span></div>
        <NuxtLink v-for="j in jobs.filter((x) => x.status === 'waiting_client').slice(0, 6)" :key="j.id" :to="'/services/' + j.id" class="fx-row lk2"><span class="fx-mono">{{ initials(j.client) }}</span><div class="fx-body"><b>{{ j.title }}</b><span>{{ j.client }}</span></div><span class="fx-pill amber">Waiting on client</span></NuxtLink></div>
      <div class="card"><div class="fx-sh"><h2>Due in the next 30 days</h2><button type="button" @click="tab = 'compliance'; cf = 'soon'">Calendar →</button></div>
        <div v-for="o in comp.filter((x) => x.days_left >= 0 && x.days_left <= 30).slice(0, 10)" :key="o.id" class="fx-row"><span class="fx-cal"><em>{{ mon(o.next_due) }}</em><b>{{ dd(o.next_due) }}</b></span><div class="fx-body"><b>{{ o.title }}</b><span>{{ o.company }}</span></div><span class="fx-pill" :class="tone(o.days_left)">{{ when(o.days_left) }}</span></div>
        <p v-if="!k.soon" class="mut">No filings due in the next 30 days.</p></div>
      <div class="card"><div class="fx-sh"><h2>New requests</h2><button type="button" @click="tab = 'requests'; st = 'new'">All →</button></div>
        <NuxtLink v-for="j in jobs.filter((x) => x.status === 'new').slice(0, 8)" :key="j.id" :to="'/services/' + j.id" class="fx-row lk2"><span class="fx-mono">{{ initials(j.client) }}</span><div class="fx-body"><b>{{ j.title }}</b><span>{{ j.client }} · {{ day(j.created_at) }}</span></div><span class="fx-pill blue">New</span></NuxtLink>
        <p v-if="!k.fresh" class="mut">No new requests.</p></div>
      <div class="card w"><div class="fx-sh"><h2>Recently filed</h2></div>
        <div v-for="d in data.done.slice(0, 10)" :key="d.id" class="fx-row"><span class="fx-ck sm">✓</span><div class="fx-body"><b>{{ d.title }}</b><span>{{ d.company }}{{ d.note ? ' · ' + d.note.replace(/^Filed by Aidi: ?/, '') : '' }}</span></div><span class="fx-pill g">{{ day(d.completed_on) }}</span></div>
        <p v-if="!data.done.length" class="mut">Nothing filed in the last 90 days.</p></div>
    </div>

    <template v-else-if="tab === 'requests'">
      <div class="chips"><button :class="{ on: !st }" @click="st = ''">All {{ jobs.length }}</button><button v-for="(l, s) in ST" :key="s" :class="{ on: st === s }" @click="st = s">{{ l }} {{ counts[s] }}</button></div>
      <div class="box"><table v-if="reqs.length"><thead><tr><th>Request</th><th>Client</th><th>Status</th><th>Owner</th><th>Due</th><th>Updated</th></tr></thead>
        <tbody><tr v-for="j in reqs" :key="j.id"><td><NuxtLink :to="'/services/' + j.id" class="t">{{ j.title }}</NuxtLink><span class="sub">{{ j.service.replace(/_/g, ' ') }}{{ j.priority === 'high' ? ' · high priority' : '' }}</span></td><td>{{ j.client }}</td>
          <td><span class="fx-pill" :class="{ blue: j.status === 'new', amber: j.status === 'waiting_client', g: j.status === 'completed', grey: j.status === 'cancelled' }">{{ ST[j.status] }}</span></td><td class="mut">{{ j.owner ?? 'Unassigned' }}</td><td class="mut">{{ day(j.due_date) }}</td><td class="mut">{{ day(j.updated_at) }}</td></tr></tbody></table>
        <EmptyState v-else icon="services" title="No requests match" /></div>
    </template>

    <template v-else>
      <div class="chips"><button v-for="[f, l] in [['all', 'All'], ['overdue', 'Overdue'], ['soon', 'Next 30 days'], ['later', 'Later']]" :key="f" :class="{ on: cf === f }" @click="cf = f as 'all'">{{ l }}</button></div>
      <div class="box"><table v-if="comps.length"><thead><tr><th>Filing</th><th>Company</th><th>Due</th><th>Last filed</th><th /></tr></thead>
        <tbody><tr v-for="o in comps" :key="o.id"><td><b>{{ o.title }}</b><span class="sub">{{ o.service_code ? 'Finvry service · ' : '' }}{{ o.jurisdiction ?? '' }} · {{ o.recurrence }}</span></td><td>{{ o.company }}<span class="sub">{{ o.client }}</span></td>
          <td><span class="fx-pill" :class="tone(o.days_left)">{{ when(o.days_left) }}</span><span class="sub">{{ day(o.next_due) }}</span></td><td class="mut">{{ day(o.last_done) }}</td>
          <td class="acts"><button class="lk" :disabled="!!busy" @click="openEdit(o)">Edit</button><button class="btn secondary sm" :disabled="!!busy" @click="act(o, 'remind')">{{ busy === o.id + 'remind' ? 'Sending…' : 'Remind' }}</button><button class="btn secondary sm" :disabled="!!busy" @click="act(o, 'job')">Create job</button><button class="btn sm" :disabled="!!busy" @click="act(o, 'done')">Mark filed</button></td></tr></tbody></table>
        <EmptyState v-else icon="compliance" title="No filings match" text="Clients' compliance calendars appear here once their Finvry workspace is linked." /></div>
    </template>
    <AppModal :open="cal.open" :title="cal.id ? 'Edit calendar item' : 'Add to a client\'s compliance calendar'" @close="cal.open = false">
      <form id="calf" class="cf" @submit.prevent="saveCal()">
        <label class="label w">Client<select v-model="cal.client_id" required :disabled="!!cal.id"><option value="" disabled>Choose a client</option><option v-for="c in data.clients" :key="c.id" :value="c.id">{{ c.name }}{{ c.has_workspace ? '' : ' (no Finvry account yet)' }}</option></select></label>
        <p v-if="calClient && !calClient.has_workspace && !cal.id" class="hint w">This client has no Finvry account yet. One is set up quietly when you save — no email is sent.</p>
        <label class="label w">Service<select v-model="cal.service_code"><option value="">Other (not on the price list)</option><option v-for="s in data.services" :key="s.code" :value="s.code">{{ s.name }}</option></select></label>
        <label class="label w">Title on their calendar<input v-model="cal.title" maxlength="200" required placeholder="e.g. Federal Annual Filing"></label>
        <label class="label">Due date<input v-model="cal.next_due" type="date" required></label>
        <label class="label">Repeats<select v-model="cal.recurrence"><option value="annual">Every year</option><option value="quarterly">Every quarter</option><option value="monthly">Every month</option><option value="none">One-off</option></select></label>
        <div v-if="calPast && !cal.id" class="past w"><span class="label">This date has passed</span>
          <label :class="{ on: cal.state === 'todo' }"><input v-model="cal.state" type="radio" value="todo"><b>Still to file</b><em>Shows as overdue on their calendar</em></label>
          <label :class="{ on: cal.state === 'filed' }"><input v-model="cal.state" type="radio" value="filed"><b>Already filed</b><em>Logged as filed; the calendar moves to the next date</em></label>
          <label v-if="cal.state === 'filed'" class="label">Filed on<input v-model="cal.filed_on" type="date" :max="todayIso"></label></div>
        <label class="label">Remind them<select v-model.number="cal.reminder_days"><option :value="7">1 week before</option><option :value="14">2 weeks before</option><option :value="30">1 month before</option><option :value="60">2 months before</option></select></label>
        <label class="label w">Note (they see it on the item)<textarea v-model="cal.notes" rows="2" maxlength="3000" placeholder="e.g. We file this for you each year." /></label>
        <label v-if="!cal.id && !(calPast && cal.state === 'filed')" class="chk w"><input v-model="cal.create_job" type="checkbox"> Open a job for the team to do this filing</label>
      </form>
      <template #foot><button v-if="cal.id" class="btn secondary danger" type="button" :disabled="busy === 'cal'" @click="saveCal(true)">Remove</button><span class="sp" /><button class="btn secondary" type="button" @click="cal.open = false">Cancel</button><button class="btn" type="submit" form="calf" :disabled="busy === 'cal'">{{ busy === 'cal' ? 'Saving…' : cal.id ? 'Save' : 'Add to calendar' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 0; } .eyebrow { margin: 0 0 4px; font-size: 13px; color: var(--c-muted); } .lead { margin: 6px 0 0; color: var(--c-muted); font-size: 14.5px; }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin-bottom: 14px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .tabs em { font-style: normal; font-size: 12px; background: var(--c-paper-2); padding: 1px 7px; margin-left: 4px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: middle; }
.t { font-weight: 600; color: var(--c-ink); text-decoration: none; } .sub { display: block; font-size: 12px; color: var(--c-muted); text-transform: none; } .mut { color: var(--c-muted); } .acts { white-space: nowrap; text-align: right; } .acts .btn { margin-left: 6px; } .btn.sm { height: 30px; padding: 0 10px; font-size: 12.5px; }
.pill { font-size: 12px; font-weight: 500; padding: 3px 10px; white-space: nowrap; background: var(--c-paper-2); color: var(--c-ink-soft); } .pill.red { background: rgba(180,35,24,.08); color: var(--c-danger); } .pill.amber { background: rgba(181,71,8,.09); color: var(--c-warn); } .pill.blue { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pill.g { background: rgba(31,122,77,.1); color: var(--c-ok); }
.ok { color: var(--c-ok); } .error { color: var(--c-danger); }
.ov { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; } .ov .w { grid-column: 1 / -1; } .ov .card { padding: 18px 22px; } .mut { color: var(--c-muted); font-size: 13px; margin: 6px 0 0; }
.att { border-color: #f3c7cf; background: linear-gradient(0deg, #fff, #fff8f9); } .lk2 { text-decoration: none; color: inherit; } .lk2:hover .fx-body > b { color: var(--c-blue-deep); }
.qa { display: flex; gap: 12px; opacity: 0; transition: opacity .12s; } .fx-row:hover .qa { opacity: 1; } .qa button { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; } .fx-ck.sm { width: 22px; height: 22px; font-size: 11px; margin: 0 11px; }
.hd input { font: inherit; font-size: 13.5px; padding: 8px 11px; border: 1px solid var(--c-rule-strong); min-width: 280px; }
@media (max-width: 1100px) { .ov { grid-template-columns: 1fr; } .qa { opacity: 1; } }
.hr { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.cf { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .cf .w { grid-column: 1 / -1; } .cf .label { display: flex; flex-direction: column; gap: 6px; } .cf input, .cf select, .cf textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; }
.cf .hint { margin: -4px 0 0; font-size: 12.5px; color: var(--c-muted); } .chk { display: flex; gap: 8px; align-items: center; font-size: 14px; } .chk input { width: auto; }
.past { display: flex; flex-direction: column; gap: 6px; } .past > label:not(.label) { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; align-items: center; border: 1px solid var(--c-rule); padding: 9px 12px; cursor: pointer; font-size: 14px; } .past > label.on { border-color: var(--c-navy); } .past input[type=radio] { width: auto; grid-row: span 2; } .past em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.lk { background: none; border: 0; padding: 0 6px; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .sp { flex: 1; } .danger { color: var(--c-danger); }
</style>
