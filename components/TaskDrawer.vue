<script setup lang="ts">
import type { Task, TaskPerson } from '~/composables/useTasks'
// One task, opened in a panel on the right: status, who it's for, due date and the rest, the checklist, notes and its
// history. Every change saves straight away.
const props = defineProps<{ id: string; people: TaskPerson[]; me: string; gp: boolean }>()
const emit = defineEmits<{ close: []; changed: [] }>()
interface Ev { id: string; kind: string; body: string | null; at: string; user_id: string | null; who: string }
const { data, refresh } = await useFetch<{ task: Task; events: Ev[] }>(() => '/api/tasks/' + props.id, { key: 'task-' + props.id, watch: [() => props.id] })
const t = computed(() => data.value?.task)
const msg = ref(''); const note = ref(''); const item = ref(''); const editT = ref(false); const title = ref(''); const notes = ref(''); const menu = ref(false)
watch(t, (v) => { if (v) { title.value = v.title; notes.value = v.notes ?? '' } }, { immediate: true })
async function save(body: Record<string, unknown>) {
  msg.value = ''
  try { await $fetch('/api/tasks/' + props.id, { method: 'POST', body }); await refresh(); emit('changed') } catch (e) { msg.value = taskErr(e) }
}
const done = computed(() => (t.value?.checklist ?? []).filter((c) => c.d).length)
const tick = (i: number) => { const c = (t.value?.checklist ?? []).map((x, k) => (k === i ? { ...x, d: !x.d } : x)); save({ checklist: c }) }
const addItem = () => { const v = item.value.trim(); if (!v || !t.value) return; item.value = ''; save({ checklist: [...t.value.checklist, { t: v, d: false }] }) }
const dropItem = (i: number) => save({ checklist: (t.value?.checklist ?? []).filter((_, k) => k !== i) })
async function addNote() { const b = note.value.trim(); if (!b) return; note.value = ''; await save({ action: 'note', body: b }) }
async function del() { if (!t.value) return; try { await $fetch('/api/tasks/' + props.id, { method: 'POST', body: { action: 'delete' } }); emit('changed'); emit('close') } catch (e) { msg.value = taskErr(e) } }
const canDelete = computed(() => props.gp || t.value?.created_by === props.me)
const mounted = ref(false); onMounted(() => { mounted.value = true })
const when = (iso: string) => (mounted.value ? fmtStamp(iso) : '')
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', onKey)); onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
<template>
  <Teleport to="body">
    <div class="scrim" @mousedown.self="emit('close')" />
    <aside v-if="t" class="dr" role="dialog" aria-modal="true" :aria-label="t.title">
      <div class="top"><span class="biz">{{ bizName(t.business) }}</span><span class="ac"><span v-if="canDelete" class="mm"><button type="button" class="ic" aria-label="More" @click="menu = !menu">⋯</button><span v-if="menu" class="pop"><button type="button" @click="del">{{ t.meeting_id ? 'Delete task and its action in the minutes' : 'Delete task' }}</button></span></span><button type="button" class="ic" aria-label="Close" @click="emit('close')">×</button></span></div>
      <h2 v-if="!editT" title="Click to rename" @click="editT = true">{{ t.title }}</h2>
      <input v-else v-model="title" class="ti" maxlength="200" aria-label="Title" @blur="editT = false; title.trim() && title !== t.title && save({ title })" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()">
      <div class="seg" role="group" aria-label="Status"><button v-for="[k, l] in TASK_STATUS" :key="k" type="button" :class="{ on: t.status === k }" @click="save({ status: k })">{{ l }}</button></div>
      <div class="kv">
        <span>For</span><select :value="t.assignee_group ?? t.assignee_id ?? ''" aria-label="For" @change="save({ assignee: ($event.target as HTMLSelectElement).value })"><option v-if="!t.assignee_group && !t.assignee_id" value="">No one</option><option v-for="p in people" :key="p.id" :value="p.id">{{ p.id === me ? p.name + ' (me)' : p.name }}</option><option v-if="gp" value="gp">All GPs</option><option value="team">Whole team</option></select>
        <span>Due</span><input type="date" :value="t.due_on ?? ''" aria-label="Due" @change="save({ due_on: ($event.target as HTMLInputElement).value || null })">
        <span>Priority</span><select :value="t.priority" aria-label="Priority" :class="'p-' + t.priority" @change="save({ priority: ($event.target as HTMLSelectElement).value })"><option v-for="[k, l] in TASK_PRI" :key="k" :value="k">{{ l }}</option></select>
        <span>Business</span><select :value="t.business" aria-label="Business" @change="save({ business: ($event.target as HTMLSelectElement).value })"><option v-for="[k, l] in TASK_BIZ_UI" :key="k" :value="k">{{ l }}</option></select>
        <span>Repeats</span><select :value="t.repeat" aria-label="Repeats" @change="save({ repeat: ($event.target as HTMLSelectElement).value })"><option value="none">No</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select>
        <template v-if="t.link"><span>{{ t.meeting_id ? 'Minutes' : 'Page' }}</span><NuxtLink :to="t.link" class="lk">{{ t.meeting_id ? 'Open the meeting minutes ↗' : 'Open the page ↗' }}</NuxtLink></template>
        <span>From</span><span class="mut">{{ t.creator_name ?? 'Aidi' }}<template v-if="mounted"> · {{ fmtStamp(t.created_at, false) }}</template></span>
      </div>
      <textarea v-model="notes" rows="3" maxlength="4000" placeholder="Add details…" aria-label="Details" class="nt" @blur="notes !== (t.notes ?? '') && save({ notes })" />
      <div class="cl"><b>Checklist<template v-if="t.checklist.length"> · {{ done }} of {{ t.checklist.length }}</template></b>
        <div v-if="t.checklist.length" class="bar"><i :style="{ width: (done / t.checklist.length) * 100 + '%' }" /></div>
        <div v-for="(c, i) in t.checklist" :key="i + c.t" class="ci" :class="{ d: c.d }"><button type="button" class="cb" :class="{ d: c.d }" :aria-label="(c.d ? 'Untick ' : 'Tick ') + c.t" @click="tick(i)" /><span>{{ c.t }}</span><button type="button" class="x" :aria-label="'Remove ' + c.t" @click="dropItem(i)">×</button></div>
        <input v-model="item" maxlength="200" placeholder="+ Add an item" aria-label="Add a checklist item" class="ai" @keydown.enter.prevent="addItem"></div>
      <div class="hs"><b>Notes and history</b>
        <div v-for="e in data?.events ?? []" :key="e.id" :class="e.kind === 'note' ? 'cm' : 'ev'"><template v-if="e.kind === 'note'"><span class="av">{{ initials(e.who) }}</span><div><b>{{ e.who.split(' ')[0] }}</b> <span class="ev">· {{ when(e.at) }}</span><p>{{ e.body }}</p></div></template><template v-else>{{ e.who.split(' ')[0] }} {{ e.kind === 'created' ? 'created this' : e.body?.charAt(0).toLowerCase() + (e.body?.slice(1) ?? '') }} · {{ when(e.at) }}</template></div>
        <div class="nn"><input v-model="note" maxlength="2000" placeholder="Write a note" aria-label="Write a note" @keydown.enter.prevent="addNote"><button type="button" class="btn secondary sm" :disabled="!note.trim()" @click="addNote">Add</button></div></div>
      <p v-if="msg" class="error">{{ msg }}</p>
      <div class="ft"><button v-if="t.status !== 'done'" type="button" class="btn" @click="save({ status: 'done' })">Mark done</button><button v-else type="button" class="btn secondary" @click="save({ status: 'todo' })">Reopen</button><span v-if="t.status === 'done' && t.completed_by_name" class="mut sm">Done by {{ t.completed_by_name.split(' ')[0] }}{{ t.repeat !== 'none' ? ' · the next one is on the list' : '' }}</span></div>
    </aside>
  </Teleport>
</template>
<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(12, 26, 46, .18); z-index: 900; }
.dr { position: fixed; top: 0; right: 0; bottom: 0; width: min(500px, 100vw); background: #fff; z-index: 901; box-shadow: -16px 0 40px rgba(12, 26, 46, .12); padding: 22px 24px 0; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; box-sizing: border-box; }
.top { display: flex; justify-content: space-between; align-items: center; } .biz { font-size: 12px; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); }
.ac { display: flex; gap: 4px; align-items: center; } .ic { background: none; border: 0; font-size: 22px; line-height: 1; color: var(--c-muted); cursor: pointer; padding: 2px 6px; } .mm { position: relative; } .pop { position: absolute; right: 0; top: 30px; background: #fff; border: 1px solid var(--c-rule-strong); box-shadow: 0 8px 24px rgba(12, 26, 46, .12); z-index: 2; } .pop button { background: none; border: 0; font: inherit; font-size: 13.5px; padding: 9px 14px; cursor: pointer; color: var(--c-danger); white-space: nowrap; }
h2 { margin: 0; font-size: 21px; line-height: 1.3; cursor: text; } .ti { font: inherit; font-size: 19px; font-weight: 600; padding: 6px 8px; border: 1px solid var(--c-rule-strong); }
.seg { display: inline-flex; background: var(--c-paper-2); padding: 3px; gap: 2px; align-self: flex-start; } .seg button { background: none; border: 0; font: inherit; font-size: 13.5px; padding: 6px 12px; color: var(--c-ink-soft); cursor: pointer; } .seg button.on { background: #fff; color: var(--c-ink); font-weight: 500; }
.kv { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 8px 12px; align-items: center; font-size: 13.5px; } .kv > span:nth-child(odd) { color: var(--c-muted); }
.kv select, .kv input { font: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid transparent; background: transparent; width: 100%; box-sizing: border-box; cursor: pointer; } .kv select:hover, .kv input:hover, .kv select:focus, .kv input:focus { border-color: var(--c-rule-strong); background: #fff; }
.p-urgent { color: var(--c-danger); font-weight: 500; } .p-high { color: var(--c-warn); } .lk { color: var(--c-blue-deep); } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; }
.nt { font: inherit; font-size: 14px; line-height: 1.5; padding: 9px 10px; border: 1px solid var(--c-rule); resize: vertical; } .nt:focus { border-color: var(--c-rule-strong); }
.cl b, .hs > b { font-size: 13.5px; } .bar { height: 6px; background: var(--c-paper-2); margin: 8px 0 4px; } .bar i { display: block; height: 100%; background: var(--c-blue-deep); }
.ci { display: flex; gap: 10px; align-items: center; font-size: 14px; padding: 5px 0; } .ci span { flex: 1; } .ci.d span { color: var(--c-muted); text-decoration: line-through; } .ci .x { opacity: 0; } .ci:hover .x { opacity: 1; }
.x { background: none; border: 0; font-size: 17px; color: var(--c-muted); cursor: pointer; }
.cb { width: 17px; height: 17px; border: 1.5px solid rgba(15, 17, 21, .35); background: #fff; padding: 0; cursor: pointer; position: relative; flex: none; } .cb.d { background: var(--c-blue-deep); border-color: var(--c-blue-deep); } .cb.d::after { content: ''; position: absolute; left: 4.5px; top: 1px; width: 4px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.ai { font: inherit; font-size: 13.5px; border: 0; border-bottom: 1px solid transparent; padding: 6px 0; width: 100%; } .ai:focus { border-bottom-color: var(--c-rule-strong); outline: none; }
.hs { border-top: 1px solid var(--c-rule); padding-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.cm { display: flex; gap: 10px; font-size: 13.5px; } .cm p { margin: 2px 0 0; white-space: pre-wrap; } .ev { font-size: 12.5px; color: var(--c-muted); }
.av { width: 26px; height: 26px; border-radius: 50%; background: var(--c-navy); color: #fff; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.nn { display: flex; gap: 8px; } .nn input { flex: 1; font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); }
.error { color: var(--c-danger); margin: 0; font-size: 13px; }
.ft { position: sticky; bottom: 0; background: #fff; border-top: 1px solid var(--c-rule); padding: 14px 0 18px; margin-top: auto; display: flex; gap: 12px; align-items: center; } .ft .btn { padding: 10px 18px; }
</style>
