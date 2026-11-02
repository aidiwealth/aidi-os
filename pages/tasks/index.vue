<script setup lang="ts">
import type { Task, TaskPerson } from '~/composables/useTasks'
// Tasks: My tasks, Everyone (what I may see) and, for GPs, Progress. A task opens in a panel on the right (?id=).
useHead({ title: 'Tasks' })
const route = useRoute(); const router = useRouter()
const view = computed(() => (['all', 'progress'].includes(String(route.query.v)) ? String(route.query.v) : 'mine'))
const biz = ref(''); const st = ref('open'); const person = ref('')
const q = computed(() => ({ view: view.value === 'all' ? 'all' : 'mine', status: st.value, business: biz.value || undefined, person: view.value === 'all' ? person.value || undefined : undefined }))
const { data, refresh } = await useFetch<{ tasks: Task[]; people: TaskPerson[]; me: string; gp: boolean }>('/api/tasks', { query: q, key: 'tasks-list' })
// Everyone: by person (each GP, each team member, all GPs, the whole team) or by date.
const by = ref<'person' | 'date'>('person')
const groups = computed(() => {
  const list = data.value?.tasks ?? []
  if (view.value !== 'all' || by.value === 'date') return taskGroups(list)
  const m = new Map<string, { key: string; label: string; items: Task[] }>()
  for (const t of list) { const k = t.assignee_group ?? t.assignee_id ?? 'none'; if (!m.has(k)) m.set(k, { key: 'p-' + k, label: t.assignee_id === data.value?.me ? whoName(t) + ' (me)' : whoName(t), items: [] }); m.get(k)!.items.push(t) }
  const rank = (k: string) => (k === 'p-' + data.value?.me ? 0 : k === 'p-gp' ? 2 : k === 'p-team' ? 3 : k === 'p-none' ? 4 : 1)
  return [...m.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label))
})
const openCount = computed(() => (data.value?.tasks ?? []).filter((t) => t.status !== 'done').length)
const go = (v: string) => router.replace({ query: { ...route.query, v: v === 'mine' ? undefined : v, id: undefined } })
const openId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const openTask = (id: string) => router.replace({ query: { ...route.query, id } })
const closeTask = () => router.replace({ query: { ...route.query, id: undefined } })
const mounted = ref(false); onMounted(() => { mounted.value = true })
const newOpen = ref(false); const quick = ref(''); const msg = ref('')
async function quickAdd() {
  const title = quick.value.trim(); if (!title) return
  msg.value = ''; quick.value = ''
  try { await $fetch('/api/tasks', { method: 'POST', body: { title, assignee: 'me' } }); await refresh() } catch (e) { msg.value = taskErr(e); quick.value = title }
}
async function toggle(t: Task) {
  const prev = t.status; t.status = t.status === 'done' ? 'todo' : 'done'
  try { await $fetch('/api/tasks/' + t.id, { method: 'POST', body: { status: t.status } }); await refresh() } catch (e) { t.status = prev; msg.value = taskErr(e) }
}
const sub = (t: Task) => [t.meeting_id ? 'From meeting minutes' : '', t.checklist.length ? t.checklist.filter((c) => c.d).length + ' of ' + t.checklist.length + ' done' : '', t.repeat !== 'none' ? (t.repeat === 'weekly' ? 'every week' : 'every month') : '', t.status === 'doing' ? 'Doing' : t.status === 'waiting' ? 'Waiting' : ''].filter(Boolean).join(' · ')
</script>
<template>
  <section v-if="data" class="tk">
    <div class="hd"><div><h1>Tasks</h1><p class="mut">What each of us is doing, across every business.</p></div><button type="button" class="btn" @click="newOpen = true">+ New task</button></div>
    <div class="bar"><div class="seg" role="tablist"><button role="tab" :aria-selected="view === 'mine'" :class="{ on: view === 'mine' }" @click="go('mine')">My tasks<template v-if="view === 'mine'"> · {{ openCount }}</template></button><button role="tab" :aria-selected="view === 'all'" :class="{ on: view === 'all' }" @click="go('all')">Everyone</button><button v-if="data.gp" role="tab" :aria-selected="view === 'progress'" :class="{ on: view === 'progress' }" @click="go('progress')">Progress</button></div>
      <div v-if="view !== 'progress'" class="fl"><select v-model="biz" aria-label="Business"><option value="">All businesses</option><option v-for="[k, l] in TASK_BIZ_UI" :key="k" :value="k">{{ l }}</option></select>
        <select v-model="st" aria-label="Status"><option value="open">Open</option><option value="done">Done</option><option value="all">All</option></select>
        <div v-if="view === 'all'" class="sg2" role="group" aria-label="Group by"><button type="button" :class="{ on: by === 'person' }" @click="by = 'person'">By person</button><button type="button" :class="{ on: by === 'date' }" @click="by = 'date'">By date</button></div>
        <select v-if="view === 'all'" v-model="person" aria-label="Person"><option value="">Anyone</option><option v-for="p in data.people" :key="p.id" :value="p.id">{{ p.name }}</option><option v-if="data.gp" value="gp">All GPs</option><option value="team">Whole team</option></select></div></div>
    <TaskProgress v-if="view === 'progress' && data.gp" @open="openTask" />
    <template v-else>
      <form class="qa" @submit.prevent="quickAdd"><span class="pl" aria-hidden="true">+</span><input v-model="quick" maxlength="200" placeholder="Add a task for yourself and press Enter" aria-label="Add a task"><button type="button" class="lk" @click="newOpen = true">More options</button></form>
      <p v-if="msg" class="error">{{ msg }}</p>
      <div v-if="!groups.length" class="empty"><b>{{ st === 'done' ? 'Nothing done yet' : 'Nothing to do' }}</b><span class="mut">{{ view === 'mine' ? 'Tasks given to you, or to your group, show here.' : 'No tasks match.' }}</span></div>
      <div v-for="g in groups" :key="g.key" class="grp"><div class="gl" :class="g.key"><b>{{ g.label }}</b><span>{{ g.key.startsWith('p-') ? g.items.filter((x) => x.status !== 'done').length + ' open' + (g.items.some((x) => x.status !== 'done' && dueLabel(x.due_on).cls === 'od') ? ' · ' + g.items.filter((x) => x.status !== 'done' && dueLabel(x.due_on).cls === 'od').length + ' late' : '') : g.items.length }}</span></div>
        <div v-for="t in g.items" :key="t.id" class="tr" :class="{ sel: openId === t.id, done: t.status === 'done' }" @click="openTask(t.id)">
          <button type="button" class="cb" :class="{ d: t.status === 'done' }" :aria-label="t.status === 'done' ? 'Reopen ' + t.title : 'Mark done: ' + t.title" @click.stop="toggle(t)" />
          <div class="tt"><b>{{ t.title }}</b><span v-if="sub(t)">{{ sub(t) }}</span></div>
          <span class="biz">{{ bizName(t.business) }}</span>
          <span class="due" :class="t.status === 'done' ? '' : dueLabel(t.due_on).cls">{{ t.status === 'done' ? (mounted && t.completed_at ? 'Done ' + fmtStamp(t.completed_at, false) : 'Done') : dueLabel(t.due_on).text }}</span>
          <span class="pri" :class="t.priority">{{ t.priority === 'normal' ? '' : priName(t.priority) }}</span>
          <span class="av" :class="{ me: t.assignee_id === data.me, grp: !!t.assignee_group }" :title="whoName(t)">{{ t.assignee_group === 'gp' ? 'GPs' : t.assignee_group === 'team' ? 'All' : initials(t.assignee_name) }}</span>
        </div>
      </div>
    </template>
    <TaskDrawer v-if="openId" :id="openId" :key="openId" :people="data.people" :me="data.me" :gp="data.gp" @close="closeTask" @changed="refresh(); refreshNuxtData('tasks-progress')" />
    <TaskNew :open="newOpen" :people="data.people" :me="data.me" :gp="data.gp" @close="newOpen = false" @created="refresh()" />
  </section>
</template>
<style scoped>
.tk { display: flex; flex-direction: column; gap: 16px; max-width: 1180px; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; } .hd h1 { margin: 0 0 4px; } .hd p { margin: 0; font-size: 14px; } .mut { color: var(--c-muted); }
.bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.seg { display: inline-flex; background: var(--c-paper-2); padding: 3px; gap: 2px; } .seg button { background: none; border: 0; font: inherit; font-size: 13.5px; padding: 7px 14px; color: var(--c-ink-soft); cursor: pointer; } .seg button.on { background: #fff; color: var(--c-ink); font-weight: 500; }
.fl { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .sg2 { display: inline-flex; border: 1px solid var(--c-rule-strong); } .sg2 button { background: #fff; border: 0; font: inherit; font-size: 13px; padding: 6px 10px; cursor: pointer; color: var(--c-ink-soft); } .sg2 button.on { background: var(--c-navy); color: #fff; } .fl select { font: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.qa { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border: 1px solid var(--c-rule-strong); background: #fff; } .qa input { flex: 1; border: 0; font: inherit; font-size: 14px; padding: 3px 0; outline: none; } .pl { color: var(--c-muted); font-size: 16px; }
.lk { background: none; border: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; white-space: nowrap; }
.error { color: var(--c-danger); margin: 0; font-size: 13px; }
.empty { display: flex; flex-direction: column; gap: 4px; padding: 40px 20px; text-align: center; border: 1px dashed var(--c-rule-strong); background: #fff; }
.gl { display: flex; gap: 8px; align-items: center; font-size: 12.5px; color: var(--c-muted); padding: 8px 0 6px; } .gl b { color: var(--c-ink); font-weight: 600; font-size: 13px; } .gl.od b { color: var(--c-danger); }
.tr { display: grid; grid-template-columns: 22px minmax(0, 1fr) 128px 112px 64px 28px; gap: 12px; align-items: center; padding: 11px 14px; background: #fff; border: 1px solid var(--c-rule); margin-top: -1px; font-size: 14px; cursor: pointer; transition: background .12s; }
.tr:hover { background: var(--c-paper-3); } .tr.sel { background: #f2f6f9; } .tr.done .tt b { color: var(--c-muted); text-decoration: line-through; font-weight: 400; }
.cb { width: 17px; height: 17px; border: 1.5px solid rgba(15, 17, 21, .35); background: #fff; padding: 0; cursor: pointer; position: relative; } .cb:hover { border-color: var(--c-blue-deep); } .cb.d { background: var(--c-blue-deep); border-color: var(--c-blue-deep); } .cb.d::after { content: ''; position: absolute; left: 4.5px; top: 1px; width: 4px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.tt { min-width: 0; } .tt b { font-weight: 500; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .tt span { font-size: 12.5px; color: var(--c-muted); }
.biz { font-size: 12px; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); justify-self: start; white-space: nowrap; }
.due { font-size: 13px; color: var(--c-ink-soft); } .due.od { color: var(--c-danger); } .due.td { color: var(--c-blue-deep); font-weight: 500; } .due.nd { color: var(--c-muted); }
.pri { font-size: 12px; color: var(--c-muted); } .pri.urgent { color: var(--c-danger); font-weight: 500; } .pri.high { color: var(--c-warn); }
.av { width: 26px; height: 26px; border-radius: 50%; background: #b9cfe2; color: var(--c-navy); font-size: 11px; display: inline-flex; align-items: center; justify-content: center; } .av.me { background: var(--c-navy); color: #fff; } .av.grp { border-radius: 0; background: #e6ecf2; color: var(--c-blue-deep); font-size: 10px; }
@media (max-width: 800px) { .tr { grid-template-columns: 22px minmax(0, 1fr) 80px 28px; } .tr .biz, .tr .pri { display: none; } }
</style>
