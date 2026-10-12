<script setup lang="ts">
import { mdRender } from '~/shared/markdown'
// Log or edit a meeting: details, attendees, agenda, rough notes → AI → clean minutes, decisions and action items.
const id = useRoute().params.id as string
const isNew = id === 'new'
interface Act { text: string; owner_id: string | null; owner: string | null; due: string | null; done: boolean }
const { data: meta } = await useFetch<{ entities: { id: string; name: string }[]; people: { id: string; name: string }[]; kinds: Record<string, string> }>('/api/meetings', { transform: (d: { entities: { id: string; name: string }[]; people: { id: string; name: string }[]; kinds: Record<string, string> }) => ({ entities: d.entities, people: d.people, kinds: d.kinds }) })
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const f = reactive({ title: '', kind: 'team', entity_id: '' as string, held_at: local(new Date()), minutes_long: 60 as number | string, location: '', attendees: [] as string[], guests: '', agenda: '', summary: '', notes: '', decisions: '', actions: [] as Act[], status: 'draft' as 'draft' | 'final' })
const rough = ref(''); const view = ref<'edit' | 'read'>(isNew ? 'edit' : 'read')
if (!isNew) {
  const m = await $fetch<Record<string, unknown>>('/api/meetings/' + id).catch(() => null)
  if (m) Object.assign(f, { title: m.title, kind: m.kind, entity_id: (m.entity_id as string) ?? '', held_at: local(new Date(m.held_at as string)), minutes_long: m.minutes_long ?? '', location: m.location ?? '', attendees: m.attendees ?? [], guests: m.guests ?? '', agenda: m.agenda ?? '', summary: m.summary ?? '', notes: m.notes ?? '', decisions: m.decisions ?? '', actions: (m.actions as Act[]) ?? [], status: m.status })
}
useHead({ title: () => (f.title || (isNew ? 'Log a meeting' : 'Meeting')) + ' · Minutes' })
const toggleA = (uid: string) => { f.attendees = f.attendees.includes(uid) ? f.attendees.filter((x) => x !== uid) : [...f.attendees, uid] }
const pname = (uid: string | null) => meta.value?.people.find((p) => p.id === uid)?.name ?? ''
const msg = ref(''); const ok = ref(''); const busy = ref(''); const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function save(status?: 'draft' | 'final') {
  if (status) f.status = status
  busy.value = 'save'; msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ id: string }>('/api/meetings', { method: 'POST', body: { ...f, id: isNew ? undefined : id, entity_id: f.entity_id || null, held_at: new Date(f.held_at).toISOString(), minutes_long: f.minutes_long === '' ? null : Number(f.minutes_long) } }); ok.value = f.status === 'final' ? 'Minutes saved as final.' : 'Draft saved.'; if (isNew) await navigateTo('/meetings/' + r.id, { replace: true }); else view.value = 'read' }
  catch (e) { msg.value = err(e) } finally { busy.value = '' }
}
async function write() {
  busy.value = 'ai'; msg.value = ''
  try {
    const r = await $fetch<{ summary: string; minutes: string; decisions: string; actions: Act[] }>('/api/meetings/draft', { method: 'POST', body: { title: f.title || 'Meeting', kind: f.kind, entity_id: f.entity_id || null, held_at: new Date(f.held_at).toISOString(), attendees: f.attendees, guests: f.guests, agenda: f.agenda, notes: rough.value || f.notes } })
    Object.assign(f, { summary: r.summary, notes: r.minutes, decisions: r.decisions, actions: [...f.actions.filter((a) => a.text.trim()), ...r.actions] }); ok.value = 'Minutes written from your notes. Review and edit before saving as final.'
  } catch (e) { msg.value = err(e) } finally { busy.value = '' }
}
async function del() { if (!window.confirm('Delete these minutes?')) return; try { await $fetch('/api/meetings/' + id, { method: 'DELETE' }); await navigateTo('/meetings') } catch (e) { msg.value = err(e) } }
const addAction = () => f.actions.push({ text: '', owner_id: null, owner: null, due: null, done: false })
const toggleDone = async (a: Act) => { a.done = !a.done; if (!isNew) await save() }
const when = computed(() => new Date(f.held_at).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }))
</script>
<template>
  <section v-if="meta" class="mm">
    <NuxtLink to="/meetings" class="back">← Meeting minutes</NuxtLink>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>

    <template v-if="view === 'read'">
      <div class="rh"><div><p class="eb">{{ meta.kinds[f.kind] }}{{ f.entity_id ? ' · ' + (meta.entities.find((e) => e.id === f.entity_id)?.name ?? '') : '' }}<span v-if="f.status === 'draft'" class="dr">Draft</span></p><h1>{{ f.title }}</h1><p class="mut">{{ when }}{{ f.minutes_long ? ' · ' + f.minutes_long + ' min' : '' }}{{ f.location ? ' · ' + f.location : '' }}</p></div>
        <div class="acts"><a class="btn secondary" :href="'/api/meetings/' + id + '/pdf'" target="_blank">PDF</a><button class="btn" @click="view = 'edit'">Edit</button></div></div>
      <div class="cols"><div class="col">
          <div v-if="f.summary" class="card sum"><b>Summary</b><p>{{ f.summary }}</p></div>
          <div v-if="f.notes" class="card"><h2>Minutes</h2><div class="mdb body" v-html="mdRender(f.notes)" /></div>
          <div v-if="f.decisions" class="card"><h2>Decisions</h2><div class="mdb body" v-html="mdRender(f.decisions)" /></div>
          <div v-if="f.agenda" class="card"><h2>Agenda</h2><div class="mdb body" v-html="mdRender(f.agenda)" /></div></div>
        <aside class="col">
          <div class="card"><h2>Action items</h2><label v-for="(a, i) in f.actions" :key="i" class="ai" :class="{ done: a.done }"><input type="checkbox" :checked="a.done" @change="toggleDone(a)"><span><b>{{ a.text }}</b><em>{{ pname(a.owner_id) || a.owner || 'No owner' }}{{ a.due ? ' · due ' + a.due : '' }}</em></span></label><p v-if="!f.actions.length" class="mut">No action items.</p></div>
          <div class="card"><h2>Attendees</h2><p class="mut">{{ f.attendees.map(pname).filter(Boolean).join(', ') || 'Not recorded' }}{{ f.guests ? ' · Guests: ' + f.guests : '' }}</p></div></aside></div>
    </template>

    <template v-else>
      <h1>{{ isNew ? 'Log a meeting' : 'Edit minutes' }}</h1>
      <div class="cols"><div class="col">
        <div class="card frm">
          <label class="label w">Title<input v-model="f.title" maxlength="200" placeholder="e.g. Q3 board meeting"></label>
          <label class="label">Type<select v-model="f.kind"><option v-for="(l, k) in meta.kinds" :key="k" :value="k">{{ l }}</option></select></label>
          <label class="label">Company<select v-model="f.entity_id"><option value="">Group-wide / none</option><option v-for="e in meta.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
          <label class="label">When<input v-model="f.held_at" type="datetime-local"></label>
          <label class="label">Length (minutes)<input v-model="f.minutes_long" type="number" min="1" max="1440"></label>
          <label class="label w">Where<input v-model="f.location" maxlength="300" placeholder="Office, video link or address"></label>
          <div class="label w">Attendees<div class="chips"><button v-for="p in meta.people" :key="p.id" type="button" :class="{ on: f.attendees.includes(p.id) }" @click="toggleA(p.id)">{{ p.name }}</button></div></div>
          <label class="label w">Guests (outside the team)<input v-model="f.guests" maxlength="1000" placeholder="e.g. Ada Obi (Northgate Capital), auditors"></label>
        </div>
        <div class="card ai2"><div class="aih"><div><h2>✨ Write the minutes with AI</h2><p class="mut">Paste or type rough notes — bullets, half-sentences, anything. AI writes a summary, minutes by topic, decisions and action items from what you wrote. It never adds facts.</p></div></div>
          <textarea v-model="rough" rows="7" maxlength="60000" placeholder="e.g. Reviewed Kiza Q3 numbers, revenue 120k up 18%. Agreed to extend runway, hire 2 engineers. Tolu to send board pack by Friday 18 Oct. Next call w/ Northgate re bridge…" />
          <div class="row"><button type="button" class="btn" :disabled="busy === 'ai' || (rough + f.notes).replace(/\s/g, '').length < 20" @click="write">{{ busy === 'ai' ? 'Writing…' : 'Write minutes' }}</button><span class="mut sm">Counts towards your AI allowance.</span></div></div>
        <div class="card"><h2>Summary</h2><textarea v-model="f.summary" rows="3" maxlength="4000" placeholder="Two or three sentences" /></div>
        <div class="card"><h2>Minutes</h2><ClientOnly><RichEditor v-model="f.notes" :min-height="260" :max-length="60000" placeholder="What was discussed, by topic" /></ClientOnly></div>
        <div class="card"><h2>Decisions</h2><ClientOnly><RichEditor v-model="f.decisions" :min-height="120" :max-length="20000" placeholder="One line per decision" /></ClientOnly></div>
        <div class="card"><h2>Agenda</h2><ClientOnly><RichEditor v-model="f.agenda" compact :min-height="100" :max-length="20000" /></ClientOnly></div>
      </div>
      <aside class="col">
        <div class="card"><h2>Action items</h2>
          <div v-for="(a, i) in f.actions" :key="i" class="ae"><input v-model="a.text" maxlength="500" placeholder="What needs doing"><div class="ar"><select v-model="a.owner_id"><option :value="null">{{ a.owner || 'Owner' }}</option><option v-for="p in meta.people" :key="p.id" :value="p.id">{{ p.name }}</option></select><input v-model="a.due" type="date"><label class="dn"><input v-model="a.done" type="checkbox"> Done</label><button type="button" class="x" aria-label="Remove" @click="f.actions.splice(i, 1)">×</button></div></div>
          <button type="button" class="lnk" @click="addAction">+ Add action item</button></div>
        <div class="card sv"><button class="btn" :disabled="!!busy || !f.title.trim()" @click="save('final')">{{ busy === 'save' ? 'Saving…' : 'Save as final' }}</button><button class="btn secondary" :disabled="!!busy || !f.title.trim()" @click="save('draft')">Save draft</button><button v-if="!isNew" class="btn secondary" @click="view = 'read'">Cancel</button><button v-if="!isNew" class="lnk red" @click="del">Delete minutes</button></div>
      </aside></div>
    </template>
  </section>
</template>
<style scoped>
.back { color: var(--c-muted); text-decoration: none; font-size: 13.5px; display: inline-block; margin: 4px 0 12px; } h1 { margin: 0 0 6px; } h2 { margin: 0 0 10px; font-size: 16px; } .mut { color: var(--c-muted); font-size: 13.5px; margin: 0; } .sm { font-size: 12.5px; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
.rh { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; } .eb { margin: 0 0 4px; font-size: 13px; color: var(--c-muted); display: flex; gap: 8px; align-items: center; } .acts { display: flex; gap: 8px; } .acts a { text-decoration: none; }
.dr { font-size: 11px; font-weight: 600; padding: 2px 7px; background: #fff6e6; color: #a5650b; }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; margin-top: 10px; } .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.sum { background: var(--c-signal-soft); border-color: #c9d8f5; } .sum p { margin: 6px 0 0; line-height: 1.55; } .body { font-size: 14px; line-height: 1.6; color: var(--c-ink-soft); } .body :deep(h2), .body :deep(h3) { font-size: 15px; margin: 14px 0 6px; color: var(--c-ink); }
.frm { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; } .frm .w { grid-column: 1 / -1; } .label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
input, select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 0; box-sizing: border-box; max-width: 100%; } textarea { width: 100%; resize: vertical; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.ai2 { display: flex; flex-direction: column; gap: 10px; border-color: #c9d8f5; background: linear-gradient(0deg, #fff, #f5f9ff); } .row { display: flex; gap: 12px; align-items: center; }
.ai { display: flex; gap: 10px; align-items: flex-start; padding: 9px 0; border-top: 1px solid var(--c-rule); cursor: pointer; } .ai input { margin-top: 3px; } .ai span { display: flex; flex-direction: column; } .ai b { font-weight: 500; font-size: 14px; } .ai em { font-style: normal; font-size: 12px; color: var(--c-muted); } .ai.done b { text-decoration: line-through; color: var(--c-muted); }
.ae { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-top: 1px solid var(--c-rule); } .ae input:first-child { width: 100%; } .ar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .ar select { flex: 1; min-width: 0; } .ar input[type=date] { width: 140px; } .dn { display: flex; gap: 4px; align-items: center; font-size: 12.5px; } .dn input { width: auto; } .x { background: none; border: 0; font-size: 18px; color: var(--c-muted); cursor: pointer; }
.lnk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; text-align: left; margin-top: 8px; } .lnk.red { color: var(--c-danger); }
.sv { display: flex; flex-direction: column; gap: 8px; position: sticky; top: 16px; }
@media (max-width: 1000px) { .cols, .frm { grid-template-columns: 1fr; } }
</style>
