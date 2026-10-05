<script setup lang="ts">
// Meetings with one investor: schedule, add to your calendar, import an invite.
const props = defineProps<{ dealId: string; investor: string }>()
const emit = defineEmits<{ changed: [] }>()
interface M { id: string; title: string; starts_at: string; ends_at: string; location: string | null; notes: string | null; remind_minutes: number | null; source: string; links: { google: string; outlook: string } }
const { data, refresh } = await useFetch<M[]>('/api/crm/meetings', { query: { deal: props.dealId }, key: 'meet-' + props.dealId })
const upcoming = computed(() => (data.value ?? []).filter((m) => new Date(m.ends_at) > new Date()).sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
const past = computed(() => (data.value ?? []).filter((m) => new Date(m.ends_at) <= new Date()))
const pad = (n: number) => String(n).padStart(2, '0')
const localInput = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
const nextSlot = () => { const d = new Date(Date.now() + 86400e3); d.setMinutes(0, 0, 0); d.setHours(10); return localInput(d) }
const f = reactive({ open: false, id: '', title: '', start: nextSlot(), mins: 30, location: '', notes: '', remind: 60 as number | null })
function edit(m?: M) { if (m) Object.assign(f, { open: true, id: m.id, title: m.title, start: localInput(new Date(m.starts_at)), mins: Math.round((new Date(m.ends_at).getTime() - new Date(m.starts_at).getTime()) / 60000), location: m.location ?? '', notes: m.notes ?? '', remind: m.remind_minutes }); else Object.assign(f, { open: true, id: '', title: 'Meeting with ' + props.investor, start: nextSlot(), mins: 30, location: '', notes: '', remind: 60 }) }
const msg = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function save() { busy.value = true; msg.value = ''; try { const s = new Date(f.start); await $fetch('/api/crm/meetings', { method: 'POST', body: { id: f.id || undefined, deal_id: props.dealId, title: f.title, starts_at: s.toISOString(), ends_at: new Date(s.getTime() + f.mins * 60000).toISOString(), location: f.location, notes: f.notes, remind_minutes: f.remind } }); f.open = false; await refresh(); emit('changed') } catch (e) { msg.value = err(e) } finally { busy.value = false } }
interface Ev { uid: string | null; title: string; starts_at: string; ends_at: string; location: string | null; description: string | null; added: boolean }
const found = ref<Ev[]>([])
async function importFile(ev: Event) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; msg.value = ''; const fd = new FormData(); fd.append('file', file); try { found.value = await $fetch<Ev[]>('/api/crm/meetings/import?deal=' + props.dealId, { method: 'POST', body: fd }) } catch (e) { msg.value = err(e) } }
async function addFound(e: Ev) { msg.value = ''; try { await $fetch('/api/crm/meetings', { method: 'POST', body: { deal_id: props.dealId, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, location: e.location ?? '', notes: e.description ?? '', remind_minutes: 60, source: 'ics', uid: e.uid ?? undefined } }); e.added = true; await refresh(); emit('changed') } catch (x) { msg.value = err(x) } }
const when = (s: string, e: string) => { const a = new Date(s), b = new Date(e); return a.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + a.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '–' + b.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }
const REM: [number | null, string][] = [[null, 'No reminder'], [15, '15 minutes before'], [60, '1 hour before'], [1440, '1 day before']]
</script>
<template>
  <div class="mp">
    <div class="mh"><b>Meetings</b><div class="row"><button type="button" class="btn secondary sm" @click="edit()">Schedule</button></div></div>
    <div v-for="m in upcoming" :key="m.id" class="mt"><span class="cal"><em>{{ new Date(m.starts_at).toLocaleDateString('en-GB', { month: 'short' }) }}</em><b>{{ new Date(m.starts_at).getDate() }}</b></span>
      <span class="mi"><b>{{ m.title }}</b><span>{{ when(m.starts_at, m.ends_at) }}{{ m.location ? ' · ' + m.location : '' }}</span><span class="add"><a :href="'/api/crm/meetings/' + m.id + '/ics'">.ics (Apple, Outlook)</a><a :href="m.links.google" target="_blank" rel="noopener">Google Calendar</a><a :href="m.links.outlook" target="_blank" rel="noopener">Outlook.com</a><button type="button" class="lk" @click="edit(m)">Edit</button><DeleteButton type="crm_meeting" :id="m.id" :name="m.title" link @deleted="refresh(); emit('changed')" /></span></span></div>
    <p v-if="!upcoming.length && !f.open" class="mut">No upcoming meetings.</p>
    <form v-if="f.open" class="mf" @submit.prevent="save">
      <label class="label w">Title<input v-model="f.title" required maxlength="200"></label>
      <label class="label">Starts<input v-model="f.start" type="datetime-local" required></label>
      <label class="label">Length<select v-model.number="f.mins"><option :value="15">15 minutes</option><option :value="30">30 minutes</option><option :value="45">45 minutes</option><option :value="60">1 hour</option><option :value="90">1.5 hours</option><option :value="120">2 hours</option></select></label>
      <label class="label">Reminder<select v-model="f.remind"><option v-for="[v, l] in REM" :key="String(v)" :value="v">{{ l }}</option></select></label>
      <label class="label w">Where<input v-model="f.location" maxlength="500" placeholder="Office address, or a Zoom / Google Meet link"></label>
      <label class="label w">Agenda (optional)<textarea v-model="f.notes" rows="2" maxlength="3000" /></label>
      <div class="row w"><button class="btn sm" type="submit" :disabled="busy">{{ f.id ? 'Save meeting' : 'Add meeting' }}</button><button type="button" class="btn secondary sm" @click="f.open = false">Cancel</button></div></form>
    <DropZone compact accept=".ics" label="Got an invite? Drop the .ics file here" hint="From Google Calendar, Outlook, Apple or Zoom" @change="importFile" />
    <div v-for="e in found" :key="(e.uid ?? '') + e.starts_at" class="fd"><span><b>{{ e.title }}</b><em>{{ when(e.starts_at, e.ends_at) }}</em></span><button v-if="!e.added" type="button" class="btn sm" @click="addFound(e)">Add to {{ investor }}</button><span v-else class="okk">Added</span></div>
    <details v-if="past.length" class="past"><summary>Past meetings ({{ past.length }})</summary><div v-for="m in past" :key="m.id" class="pm">{{ m.title }} · {{ when(m.starts_at, m.ends_at) }}</div></details>
    <p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.mp { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--c-rule); padding-top: 12px; } .mh { display: flex; justify-content: space-between; align-items: center; } .row { display: flex; gap: 8px; } .btn.sm { height: 30px; padding: 0 12px; font-size: 12.5px; }
.mt { display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; } .cal { width: 46px; flex: none; border: 1px solid var(--c-rule-strong); text-align: center; display: flex; flex-direction: column; } .cal em { font-style: normal; font-size: 10.5px; text-transform: uppercase; background: var(--c-navy); color: #fff; padding: 2px 0; } .cal b { font-size: 18px; padding: 3px 0; }
.mi { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .mi b { font-size: 14px; } .mi > span { font-size: 12.5px; color: var(--c-muted); } .add { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 3px; } .add a, .lk { font-size: 12.5px; color: var(--c-blue-deep); background: none; border: 0; padding: 0; font-family: inherit; cursor: pointer; }
.mf { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; background: #fbfaf7; border: 1px solid var(--c-rule); padding: 12px; } .w { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
input, select, textarea { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; } .fd { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 10px; background: var(--c-signal-soft); } .fd span { display: flex; flex-direction: column; } .fd em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.past summary { font-size: 13px; color: var(--c-muted); cursor: pointer; } .pm { font-size: 12.5px; color: var(--c-ink-soft); padding: 4px 0; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .okk { color: var(--c-ok); font-size: 13px; } .error { color: var(--c-danger); margin: 0; font-size: 13px; }
</style>
