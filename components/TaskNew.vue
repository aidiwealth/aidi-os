<script setup lang="ts">
import type { TaskPerson } from '~/composables/useTasks'
// New task: title, who it's for (quick picks: me, a colleague, all GPs, the whole team), due date, business, priority,
// then optional notes, checklist, a link to the page where the work happens, and repeat.
const props = defineProps<{ open: boolean; people: TaskPerson[]; me: string; gp: boolean; link?: string }>()
const emit = defineEmits<{ close: []; created: [id: string] }>()
const blank = () => ({ title: '', assignee: 'me', due_on: '', business: 'group', priority: 'normal', notes: '', link: props.link ?? '', repeat: 'none', checklist: [] as { t: string; d: boolean }[] })
const f = reactive(blank()); const more = ref(false); const item = ref(''); const busy = ref(false); const msg = ref('')
watch(() => props.open, (o) => { if (o) { Object.assign(f, blank()); more.value = false; msg.value = '' } })
const others = computed(() => props.people.filter((p) => p.id !== props.me))
const quick = computed(() => [['me', 'Me'], ...others.value.slice(0, 4).map((p) => [p.id, p.name.split(' ')[0]!]), ...(props.gp ? [['gp', 'All GPs']] : []), ['team', 'Whole team']] as [string, string][])
const target = computed(() => (f.assignee === 'me' ? null : f.assignee === 'gp' ? 'all GPs' : f.assignee === 'team' ? 'the whole team' : props.people.find((p) => p.id === f.assignee)?.name.split(' ')[0] ?? null))
function addItem() { const t = item.value.trim(); if (t) f.checklist.push({ t, d: false }); item.value = '' }
async function save() {
  if (!f.title.trim()) { msg.value = 'Give the task a title.'; return }
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/tasks', { method: 'POST', body: { ...f, due_on: f.due_on || null, link: f.link || null, notes: f.notes || null } }); emit('created', r.id); emit('close') }
  catch (e) { msg.value = taskErr(e) } finally { busy.value = false }
}
</script>
<template>
  <AppModal :open="open" title="New task" @close="emit('close')">
    <form class="tn" @submit.prevent="save">
      <input v-model="f.title" class="ttl" maxlength="200" placeholder="What needs doing?" aria-label="Task" autofocus>
      <div><span class="lb">For</span><div class="qk"><button v-for="[v, l] in quick" :key="v" type="button" :class="{ on: f.assignee === v }" @click="f.assignee = v">{{ l }}</button>
        <select v-if="others.length > 4" :value="quick.some((q) => q[0] === f.assignee) ? '' : f.assignee" aria-label="Someone else" @change="f.assignee = ($event.target as HTMLSelectElement).value || 'me'"><option value="">Someone else…</option><option v-for="p in others.slice(4)" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
        <span v-if="f.assignee === 'gp' || f.assignee === 'team'" class="hint">Anyone in {{ f.assignee === 'gp' ? 'the GPs' : 'the team' }} can pick it up.{{ f.assignee === 'gp' ? ' Team members won\'t see it.' : '' }}</span></div>
      <div class="g2"><label>Due<input v-model="f.due_on" type="date"></label><label>Business<select v-model="f.business"><option v-for="[k, l] in TASK_BIZ_UI" :key="k" :value="k">{{ l }}</option></select></label>
        <label>Priority<select v-model="f.priority"><option v-for="[k, l] in TASK_PRI" :key="k" :value="k">{{ l }}</option></select></label><label>Repeats<select v-model="f.repeat"><option value="none">No</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label></div>
      <button v-if="!more" type="button" class="lk" @click="more = true">+ Notes, checklist, link to a page</button>
      <template v-else>
        <label>Notes<textarea v-model="f.notes" rows="3" maxlength="4000" /></label>
        <div><span class="lb">Checklist</span><div v-for="(c, i) in f.checklist" :key="i" class="ci"><span>{{ c.t }}</span><button type="button" class="x" :aria-label="'Remove ' + c.t" @click="f.checklist.splice(i, 1)">×</button></div>
          <div class="ad"><input v-model="item" maxlength="200" placeholder="Add an item and press Enter" @keydown.enter.prevent="addItem"><button type="button" class="btn secondary sm" @click="addItem">Add</button></div></div>
        <label>Page in Aidi (optional)<input v-model="f.link" maxlength="300" placeholder="/rentals"></label>
      </template>
      <p v-if="msg" class="error">{{ msg }}</p>
    </form>
    <template #foot><button type="button" class="btn secondary" @click="emit('close')">Cancel</button><button type="button" class="btn" :disabled="busy" @click="save">{{ busy ? 'Creating…' : target ? 'Create and tell ' + target : 'Create' }}</button></template>
  </AppModal>
</template>
<style scoped>
.tn { display: flex; flex-direction: column; gap: 14px; } .ttl { font-size: 17px; padding: 11px 12px; }
.lb, label { font-size: 12.5px; color: var(--c-muted); } label { display: flex; flex-direction: column; gap: 5px; }
.qk { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; align-items: center; } .qk button { font: inherit; font-size: 13px; padding: 6px 11px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; } .qk button.on { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } .qk select { width: auto; font-size: 13px; padding: 6px 8px; }
.hint { display: block; font-size: 12px; color: var(--c-muted); margin-top: 6px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } input, select, textarea { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); width: 100%; box-sizing: border-box; background: #fff; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; align-self: flex-start; }
.ci { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .x { background: none; border: 0; font-size: 18px; color: var(--c-muted); cursor: pointer; }
.ad { display: flex; gap: 8px; margin-top: 6px; } .error { color: var(--c-danger); margin: 0; font-size: 13px; }
@media (max-width: 600px) { .g2 { grid-template-columns: 1fr; } }
</style>
