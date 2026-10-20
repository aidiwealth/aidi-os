<script setup lang="ts">
// Desk: run a client's raise — investors (ticket, status, committed, notes, terms), meetings with reminders.
const id = useRoute().params.id as string
interface I { deal_id?: string | null; notify?: boolean; id: string; name: string; firm: string | null; email: string | null; ticket: string | null; committed: string | null; status: string; next_step: string | null; notes: string | null; terms: string | null; visible: boolean; updated_at: string }
interface V { program: { id: string; client: string; client_email: string | null; status: string; currency: string; target: string | null; round: string | null; instrument: string | null; fee_pct: string; intake: Record<string, unknown>; job_id: string | null }; investors: I[]; meetings: { id: string; title: string; starts_at: string; minutes: number; location: string | null; agenda: string | null; investor: string | null; investor_id: string | null }[]; totals: { target: number; committed: number; closed: number; pipeline: number; fee: number; fee_pct: number; count: number; active: number }; labels: Record<string, string> }
const { data, refresh } = await useFetch<V>('/api/services/raise/' + id)
useHead({ title: () => (data.value?.program.client ?? 'Raise') + ' · Fundraising' })
const msg = ref(''); const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function post(body: Record<string, unknown>) { msg.value = ''; try { await $fetch('/api/services/raise/' + id, { method: 'POST', body }); await refresh(); return true } catch (e) { msg.value = err(e); return false } }
const blankI = () => ({ id: '', name: '', firm: '', email: '', ticket: '' as string | number, committed: '' as string | number, status: 'target', next_step: '', notes: '', terms: '', visible: true, notify: false, deal_id: null as string | null })
// The founder's own Fundraising pipelines: an investor added here can also go into one (contact details stay with us).
const { data: pls, refresh: rpls } = await useFetch<{ pipelines: { id: string; name: string; status: string; deals: number }[]; current: string | null; workspace: boolean }>('/api/services/raise/' + id + '/pipelines', { default: () => ({ pipelines: [], current: null, workspace: false }) })
const pl = reactive({ to: '', new_name: '' })
const ie = reactive({ open: false, ...blankI() })
function editI(i?: I) { pl.to = i ? '' : (pls.value?.current ?? pls.value?.pipelines[0]?.id ?? (pls.value?.workspace ? 'new' : '')); pl.new_name = ''; Object.assign(ie, blankI(), i ? { ...i, firm: i.firm ?? '', email: i.email ?? '', ticket: i.ticket ?? '', committed: i.committed ?? '', next_step: i.next_step ?? '', notes: i.notes ?? '', terms: i.terms ?? '' } : {}, { open: true }) }
// AI fill: only empty fields change.
function fillI(g: import('~/shared/investor').InvestorGuess) {
  if (!ie.name) ie.name = g.name; if (!ie.firm) ie.firm = g.firm; if (!ie.email && g.email) ie.email = g.email
  if (ie.ticket === '' && (g.ticket_max_usd || g.ticket_min_usd)) ie.ticket = g.ticket_max_usd ?? g.ticket_min_usd ?? ''
  const bits = [g.role && g.firm ? g.role + ', ' + g.firm : g.role, g.location, g.stages.length ? 'Stages: ' + g.stages.join(', ') : '', g.sectors.length ? 'Sectors: ' + g.sectors.join(', ') : ''].filter(Boolean)
  if (!ie.notes && (g.profile || bits.length)) ie.notes = (g.profile ? '<p>' + esc(g.profile) + '</p>' : '') + (bits.length ? '<p>' + esc(bits.join(' · ')) + '</p>' : '')
}
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
async function saveI() { const { open, deal_id, ...rest } = ie; void open; const pipeline = !deal_id && pl.to ? (pl.to === 'new' ? { id: 'new' as const, new_name: pl.new_name } : { id: pl.to }) : undefined; if (await post({ investor: { ...rest, id: rest.id || undefined, pipeline } })) { ie.open = false; await rpls() } }
async function delI() { if (ie.id && await askConfirm('Remove ' + ie.name + ' from the list?')) { await post({ investor: { id: ie.id, delete: true } }); ie.open = false } }
const me = reactive({ open: false, investor_id: '', title: '', date: '', time: '10:00', minutes: 30, location: '', agenda: '' })
function newM() { Object.assign(me, { open: true, investor_id: '', title: 'Investor meeting', date: new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10), time: '10:00', minutes: 30, location: '', agenda: '' }) }
async function saveM() { const at = new Date(me.date + 'T' + me.time); if (await post({ meeting: { investor_id: me.investor_id || null, title: me.title, starts_at: at.toISOString(), minutes: me.minutes, location: me.location, agenda: me.agenda } })) me.open = false }
async function delM(mid: string) { if (await askConfirm('Cancel this meeting?')) await post({ meeting: { id: mid, delete: true } }) }
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value?.program.currency ?? 'USD', maximumFractionDigits: 0 }).format(v)
const when = (s: string) => new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
const pstatus = ref('active'); watchEffect(() => { if (data.value) pstatus.value = data.value.program.status })
async function delProgram() { if (!await askConfirm('Delete this fundraising program, its investor list and meetings? The client job stays.')) return; if (await post({ program: { delete: true } })) await navigateTo('/services/raise') }
</script>
<template>
  <section v-if="data">
    <NuxtLink to="/services/raise" class="back">← Fundraising clients</NuxtLink>
    <div class="hd"><div><h1>{{ data.program.client }}</h1><p class="mut">{{ data.program.round }} · {{ data.program.instrument }} · fee {{ Number(data.program.fee_pct) }}%<template v-if="data.program.job_id"> · <NuxtLink :to="'/services/' + data.program.job_id">job</NuxtLink></template></p></div>
      <div class="acts"><span class="pst" :class="data.program.status">{{ { intake: 'Getting started', active: 'In progress', paused: 'Paused', closed: 'Closed' }[data.program.status] }}</span><select v-model="pstatus" aria-label="Change status" @change="post({ program: { status: pstatus } })"><option value="intake">Getting started</option><option value="active">In progress</option><option value="paused">Paused</option><option value="closed">Closed (raise finished)</option></select><button class="btn secondary danger" @click="delProgram">Delete</button><button class="btn secondary" @click="newM">Schedule meeting</button><button class="btn" @click="editI()">Add investor</button></div></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div class="fx-stats"><StatTile label="Target" :value="money(data.totals.target)" icon="flag" tone="n" /><StatTile label="Pipeline (tickets)" :value="money(data.totals.pipeline)" icon="chart" tone="b" /><StatTile label="Committed" :value="money(data.totals.committed)" icon="briefcase" tone="c" /><StatTile label="Closed" :value="money(data.totals.closed)" icon="check" tone="g" /><StatTile :label="'Fee due (' + data.totals.fee_pct + '%)'" :value="money(data.totals.fee)" icon="billing" tone="a" /></div>
    <div class="cols"><div class="card"><h2>Investor list</h2><RaiseTable :investors="data.investors" :labels="data.labels" :currency="data.program.currency" editable @edit="editI" /><p class="s">Faded rows are hidden from the client.</p></div>
      <aside><div class="card"><h2>Meetings</h2><div v-for="m in data.meetings" :key="m.id" class="mt"><b>{{ when(m.starts_at) }}</b><span>{{ m.title }}{{ m.investor ? ' · ' + m.investor : '' }} ({{ m.minutes }} min)</span><span v-if="m.location" class="s">{{ m.location }}</span><button class="lk red" @click="delM(m.id)">Cancel</button></div><p v-if="!data.meetings.length" class="s">None yet. The client gets an email when you book one, and reminders 1 day and 1 hour before.</p></div></aside></div>
    <RaiseBrief v-if="data.program.job_id" :job-id="data.program.job_id" in-workspace class="bfull" />
    <AppModal :open="ie.open" :title="ie.id ? 'Edit investor' : 'Add investor'" wide @close="ie.open = false">
      <div class="ef"><InvestorAssist v-if="!ie.id" :key="String(ie.open)" @fill="fillI" /><div class="g3"><label class="label">Investor *<input v-model="ie.name" maxlength="200"></label><label class="label">Firm<input v-model="ie.firm" maxlength="200"></label><label class="label">Email (not shown to client)<input v-model="ie.email" maxlength="254"></label>
        <label class="label">Ticket size<input v-model="ie.ticket" inputmode="decimal"></label><label class="label">Committed<input v-model="ie.committed" inputmode="decimal"></label><label class="label">Status<select v-model="ie.status"><option v-for="(l, k) in data.labels" :key="k" :value="k">{{ l }}</option></select></label></div>
        <label class="label">Next step<input v-model="ie.next_step" maxlength="500" placeholder="e.g. Send data room; partner meeting Tuesday"></label>
        <div class="label">Notes<ClientOnly><RichEditor v-model="ie.notes" compact :min-height="90" :max-length="5000" /></ClientOnly></div><div class="label">Terms they raised<ClientOnly><RichEditor v-model="ie.terms" compact :min-height="70" :max-length="5000" placeholder="e.g. $8M cap, pro-rata, board observer" /></ClientOnly></div>
        <div v-if="pls?.workspace" class="plp"><span class="label">Founder's Fundraising pipeline</span>
          <p v-if="ie.deal_id" class="s">In the founder's pipeline. Status and amount changes here update it there. The founder sees the investor and stage, not the contact.</p>
          <template v-else><select v-model="pl.to"><option value="">Don't add to their pipeline</option><option v-for="p in pls.pipelines" :key="p.id" :value="p.id">{{ p.name }}{{ p.status === 'closed' ? ' (closed)' : '' }} · {{ p.deals }} investor{{ p.deals === 1 ? '' : 's' }}</option><option value="new">+ Create a new pipeline</option></select>
            <input v-if="pl.to === 'new'" v-model="pl.new_name" maxlength="120" :placeholder="'Pipeline name, e.g. ' + (data.program.round || 'Seed') + ' round'">
            <p class="s">The founder sees the investor ({{ ie.firm || 'firm or name' }}) and its stage in their pipeline, marked as added by Finvry. Contact name and email stay with our team.</p></template></div>
        <label class="cb"><input v-model="ie.visible" type="checkbox"> Show this investor to the client</label>
        <label class="cb"><input v-model="ie.notify" type="checkbox" :disabled="!ie.email"> Email this investor meeting invites and reminders</label><p class="s">Leave unticked to keep it between the founder and Finvry: the investor gets no emails from us.</p></div>
      <template #foot><button v-if="ie.id" class="btn secondary danger" @click="delI">Remove</button><button class="btn secondary" @click="ie.open = false">Cancel</button><button class="btn" :disabled="!ie.name" @click="saveI">Save</button></template>
    </AppModal>
    <AppModal :open="me.open" title="Schedule a meeting" @close="me.open = false">
      <div class="ef"><label class="label">With<select v-model="me.investor_id"><option value="">No specific investor</option><option v-for="i in data.investors" :key="i.id" :value="i.id">{{ i.name }}{{ i.firm ? ' (' + i.firm + ')' : '' }}</option></select></label>
        <label class="label">Title<input v-model="me.title" maxlength="200"></label><div class="g3"><label class="label">Date<input v-model="me.date" type="date"></label><label class="label">Time ({{ tz }})<input v-model="me.time" type="time"></label><label class="label">Length<select v-model.number="me.minutes"><option :value="30">30 min</option><option :value="45">45 min</option><option :value="60">1 hour</option><option :value="90">1.5 hours</option></select></label></div>
        <label class="label">Location or video link<input v-model="me.location" maxlength="500"></label><div class="label">Agenda<ClientOnly><RichEditor v-model="me.agenda" compact :min-height="90" :max-length="3000" /></ClientOnly></div>
        <p class="s">{{ data.program.client_email ? 'We email ' + data.program.client_email + ' now, then 1 day and 1 hour before.' : 'The client has no email on file, so no reminders will be sent.' }} {{ data.investors.find((i) => i.id === me.investor_id)?.notify ? 'The investor is emailed too.' : 'The investor is not emailed.' }}</p></div>
      <template #foot><button class="btn secondary" @click="me.open = false">Cancel</button><button class="btn" :disabled="!me.title || !me.date" @click="saveM">Schedule</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.back { color: var(--c-muted); text-decoration: none; font-size: 13.5px; } .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 6px; } .hd h1 { margin: 0; } .mut { color: var(--c-muted); font-size: 13.5px; margin: 4px 0 0; } .acts { display: flex; gap: 8px; } select, input, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }

.cols { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 14px; align-items: start; } .cols h2 { margin: 0 0 8px; font-size: 16px; } aside { display: flex; flex-direction: column; gap: 12px; } .mt { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .s { font-size: 12.5px; color: var(--c-muted); }
.lk { background: none; border: 0; cursor: pointer; font: inherit; font-size: 12.5px; padding: 0; text-align: left; color: var(--c-blue-deep); } .lk.red { color: var(--c-danger); } .brief dl { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; margin: 0; font-size: 13px; } .brief dt { color: var(--c-muted); text-transform: capitalize; } .brief dd { margin: 0; white-space: pre-wrap; }
.ef { display: flex; flex-direction: column; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .cb { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .cb input { width: auto; } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .cols, .g3 { grid-template-columns: 1fr; } }
.pst { font-size: 12.5px; font-weight: 600; padding: 6px 10px; align-self: center; background: var(--c-paper-2); } .pst.active { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pst.closed { background: rgba(29,90,134,.1); color: var(--c-ok); } .pst.paused { background: rgba(181,71,8,.09); color: var(--c-warn); }
.bfull { margin-top: 14px; }
div.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
/* fields fit */
input, select, textarea { box-sizing: border-box; max-width: 100%; min-width: 0; }
.plp { display: flex; flex-direction: column; gap: 6px; background: var(--c-paper-2); padding: 10px 12px; } .plp select, .plp input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
</style>
