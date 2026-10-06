<script setup lang="ts">
// Desk: run a client's raise — investors (ticket, status, committed, notes, terms), meetings with reminders.
const id = useRoute().params.id as string
interface I { id: string; name: string; firm: string | null; email: string | null; ticket: string | null; committed: string | null; status: string; next_step: string | null; notes: string | null; terms: string | null; visible: boolean; updated_at: string }
interface V { program: { id: string; client: string; client_email: string | null; status: string; currency: string; target: string | null; round: string | null; instrument: string | null; fee_pct: string; intake: Record<string, unknown>; job_id: string | null }; investors: I[]; meetings: { id: string; title: string; starts_at: string; minutes: number; location: string | null; agenda: string | null; investor: string | null; investor_id: string | null }[]; totals: { target: number; committed: number; closed: number; pipeline: number; fee: number; fee_pct: number; count: number; active: number }; labels: Record<string, string> }
const { data, refresh } = await useFetch<V>('/api/services/raise/' + id)
useHead({ title: () => (data.value?.program.client ?? 'Raise') + ' · Fundraising' })
const msg = ref(''); const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function post(body: Record<string, unknown>) { msg.value = ''; try { await $fetch('/api/services/raise/' + id, { method: 'POST', body }); await refresh(); return true } catch (e) { msg.value = err(e); return false } }
const blankI = () => ({ id: '', name: '', firm: '', email: '', ticket: '' as string | number, committed: '' as string | number, status: 'target', next_step: '', notes: '', terms: '', visible: true })
const ie = reactive({ open: false, ...blankI() })
function editI(i?: I) { Object.assign(ie, blankI(), i ? { ...i, firm: i.firm ?? '', email: i.email ?? '', ticket: i.ticket ?? '', committed: i.committed ?? '', next_step: i.next_step ?? '', notes: i.notes ?? '', terms: i.terms ?? '' } : {}, { open: true }) }
async function saveI() { const { open, ...rest } = ie; void open; if (await post({ investor: { ...rest, id: rest.id || undefined } })) ie.open = false }
async function delI() { if (ie.id && confirm('Remove ' + ie.name + ' from the list?')) { await post({ investor: { id: ie.id, delete: true } }); ie.open = false } }
const me = reactive({ open: false, investor_id: '', title: '', date: '', time: '10:00', minutes: 30, location: '', agenda: '' })
function newM() { Object.assign(me, { open: true, investor_id: '', title: 'Investor meeting', date: new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10), time: '10:00', minutes: 30, location: '', agenda: '' }) }
async function saveM() { const at = new Date(me.date + 'T' + me.time); if (await post({ meeting: { investor_id: me.investor_id || null, title: me.title, starts_at: at.toISOString(), minutes: me.minutes, location: me.location, agenda: me.agenda } })) me.open = false }
async function delM(mid: string) { if (confirm('Cancel this meeting?')) await post({ meeting: { id: mid, delete: true } }) }
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value?.program.currency ?? 'USD', maximumFractionDigits: 0 }).format(v)
const when = (s: string) => new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
const pstatus = ref('active'); watchEffect(() => { if (data.value) pstatus.value = data.value.program.status })
async function delProgram() { if (!confirm('Delete this fundraising program, its investor list and meetings? The client job stays.')) return; if (await post({ program: { delete: true } })) await navigateTo('/services/raise') }
</script>
<template>
  <section v-if="data">
    <NuxtLink to="/services/raise" class="back">← Fundraising clients</NuxtLink>
    <div class="hd"><div><h1>{{ data.program.client }}</h1><p class="mut">{{ data.program.round }} · {{ data.program.instrument }} · fee {{ Number(data.program.fee_pct) }}%<template v-if="data.program.job_id"> · <NuxtLink :to="'/services/' + data.program.job_id">job</NuxtLink></template></p></div>
      <div class="acts"><span class="pst" :class="data.program.status">{{ { intake: 'Getting started', active: 'In progress', paused: 'Paused', closed: 'Closed' }[data.program.status] }}</span><select v-model="pstatus" aria-label="Change status" @change="post({ program: { status: pstatus } })"><option value="intake">Getting started</option><option value="active">In progress</option><option value="paused">Paused</option><option value="closed">Closed (raise finished)</option></select><button class="btn secondary danger" @click="delProgram">Delete</button><button class="btn secondary" @click="newM">Schedule meeting</button><button class="btn" @click="editI()">Add investor</button></div></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div class="kp"><div class="k"><span>Target</span><b>{{ money(data.totals.target) }}</b></div><div class="k"><span>Pipeline (tickets)</span><b>{{ money(data.totals.pipeline) }}</b></div><div class="k"><span>Committed</span><b>{{ money(data.totals.committed) }}</b></div><div class="k"><span>Closed</span><b>{{ money(data.totals.closed) }}</b></div><div class="k"><span>Fee due ({{ data.totals.fee_pct }}%)</span><b>{{ money(data.totals.fee) }}</b></div></div>
    <div class="cols"><div class="card"><h2>Investor list</h2><RaiseTable :investors="data.investors" :labels="data.labels" :currency="data.program.currency" editable @edit="editI" /><p class="s">Faded rows are hidden from the client.</p></div>
      <aside><div class="card"><h2>Meetings</h2><div v-for="m in data.meetings" :key="m.id" class="mt"><b>{{ when(m.starts_at) }}</b><span>{{ m.title }}{{ m.investor ? ' · ' + m.investor : '' }} ({{ m.minutes }} min)</span><span v-if="m.location" class="s">{{ m.location }}</span><button class="lk red" @click="delM(m.id)">Cancel</button></div><p v-if="!data.meetings.length" class="s">None yet. The client gets an email when you book one, and reminders 1 day and 1 hour before.</p></div>
        <div v-if="Object.keys(data.program.intake ?? {}).length" class="card brief"><h2>Client brief</h2><dl><template v-for="(v, k) in data.program.intake" :key="k"><template v-if="v !== '' && v !== null && k !== 'agree_fee'"><dt>{{ String(k).replace(/_/g, ' ') }}</dt><dd>{{ v }}</dd></template></template></dl></div></aside></div>
    <AppModal :open="ie.open" :title="ie.id ? 'Edit investor' : 'Add investor'" wide @close="ie.open = false">
      <div class="ef"><div class="g3"><label class="label">Investor *<input v-model="ie.name" maxlength="200"></label><label class="label">Firm<input v-model="ie.firm" maxlength="200"></label><label class="label">Email (not shown to client)<input v-model="ie.email" maxlength="254"></label>
        <label class="label">Ticket size<input v-model="ie.ticket" inputmode="decimal"></label><label class="label">Committed<input v-model="ie.committed" inputmode="decimal"></label><label class="label">Status<select v-model="ie.status"><option v-for="(l, k) in data.labels" :key="k" :value="k">{{ l }}</option></select></label></div>
        <label class="label">Next step<input v-model="ie.next_step" maxlength="500" placeholder="e.g. Send data room; partner meeting Tuesday"></label>
        <label class="label">Notes<textarea v-model="ie.notes" rows="3" maxlength="5000" /></label><label class="label">Terms they raised<textarea v-model="ie.terms" rows="2" maxlength="5000" placeholder="e.g. $8M cap, pro-rata, board observer" /></label>
        <label class="cb"><input v-model="ie.visible" type="checkbox"> Show this investor to the client</label></div>
      <template #foot><button v-if="ie.id" class="btn secondary danger" @click="delI">Remove</button><button class="btn secondary" @click="ie.open = false">Cancel</button><button class="btn" :disabled="!ie.name" @click="saveI">Save</button></template>
    </AppModal>
    <AppModal :open="me.open" title="Schedule a meeting" @close="me.open = false">
      <div class="ef"><label class="label">With<select v-model="me.investor_id"><option value="">No specific investor</option><option v-for="i in data.investors" :key="i.id" :value="i.id">{{ i.name }}{{ i.firm ? ' (' + i.firm + ')' : '' }}</option></select></label>
        <label class="label">Title<input v-model="me.title" maxlength="200"></label><div class="g3"><label class="label">Date<input v-model="me.date" type="date"></label><label class="label">Time ({{ tz }})<input v-model="me.time" type="time"></label><label class="label">Length<select v-model.number="me.minutes"><option :value="30">30 min</option><option :value="45">45 min</option><option :value="60">1 hour</option><option :value="90">1.5 hours</option></select></label></div>
        <label class="label">Location or video link<input v-model="me.location" maxlength="500"></label><label class="label">Agenda<textarea v-model="me.agenda" rows="3" maxlength="3000" /></label>
        <p class="s">{{ data.program.client_email ? 'We email ' + data.program.client_email + ' now, then 1 day and 1 hour before.' : 'The client has no email on file, so no reminders will be sent.' }}</p></div>
      <template #foot><button class="btn secondary" @click="me.open = false">Cancel</button><button class="btn" :disabled="!me.title || !me.date" @click="saveM">Schedule</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.back { color: var(--c-muted); text-decoration: none; font-size: 13.5px; } .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 6px; } .hd h1 { margin: 0; } .mut { color: var(--c-muted); font-size: 13.5px; margin: 4px 0 0; } .acts { display: flex; gap: 8px; } select, input, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.kp { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 14px 0; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 12px 14px; } .k span { display: block; font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 22px; font-weight: 600; }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 14px; align-items: start; } .cols h2 { margin: 0 0 8px; font-size: 16px; } aside { display: flex; flex-direction: column; gap: 12px; } .mt { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .s { font-size: 12.5px; color: var(--c-muted); }
.lk { background: none; border: 0; cursor: pointer; font: inherit; font-size: 12.5px; padding: 0; text-align: left; color: var(--c-blue-deep); } .lk.red { color: var(--c-danger); } .brief dl { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; margin: 0; font-size: 13px; } .brief dt { color: var(--c-muted); text-transform: capitalize; } .brief dd { margin: 0; white-space: pre-wrap; }
.ef { display: flex; flex-direction: column; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .cb { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .cb input { width: auto; } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .cols, .g3 { grid-template-columns: 1fr; } }
.pst { font-size: 12.5px; font-weight: 600; padding: 6px 10px; align-self: center; background: var(--c-paper-2); } .pst.active { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pst.closed { background: rgba(31,122,77,.1); color: var(--c-ok); } .pst.paused { background: rgba(181,71,8,.09); color: var(--c-warn); }
</style>
