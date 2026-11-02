<script setup lang="ts">
import type { Task } from '~/composables/useTasks'
// For GPs: what everyone has done and has open this month, by person and by business, and what was just finished.
const emit = defineEmits<{ open: [id: string] }>()
interface P { key: string; name: string; done_month: number; done_week: number; open: number; late: number; due_week: number }
const { data } = await useFetch<{ people: P[]; biz: { business: string; done: number; open: number }[]; kpis: { done_month: number; done_week: number; open: number; due_week: number; late: number; oldest_late: number | null; on_time: number | null }; recent: Task[] }>('/api/tasks/progress', { key: 'tasks-progress' })
const pct = (v: number, tot: number) => (tot ? (v / tot) * 100 : 0) + '%'
const ago = (iso: string | null) => { if (!iso) return ''; const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : fmtStamp(iso, false) }
</script>
<template>
  <div v-if="data" class="pg">
    <div class="kp"><div class="card"><span>Done this month</span><b>{{ data.kpis.done_month }}</b><em>{{ data.kpis.done_week }} this week</em></div><div class="card"><span>Open</span><b>{{ data.kpis.open }}</b><em>{{ data.kpis.due_week }} due this week</em></div>
      <div class="card"><span>Late</span><b :class="{ dn: data.kpis.late }">{{ data.kpis.late }}</b><em>{{ data.kpis.oldest_late ? 'oldest ' + data.kpis.oldest_late + ' day' + (data.kpis.oldest_late === 1 ? '' : 's') : 'none' }}</em></div><div class="card"><span>On time</span><b>{{ data.kpis.on_time != null ? data.kpis.on_time + '%' : '—' }}</b><em>done by the due date</em></div></div>
    <section class="card"><div class="ch"><b>By person</b><span class="lg"><i class="a" />Done this month <i class="b" />Open <i class="c" />Late</span></div>
      <div v-if="!data.people.length" class="mut sm">No tasks yet.</div>
      <div v-for="p in data.people" :key="p.key" class="pr"><span class="nm"><span class="av" :class="{ grp: p.key === 'gp' || p.key === 'team' }">{{ p.key === 'gp' ? 'GPs' : p.key === 'team' ? 'All' : initials(p.name) }}</span><b>{{ p.name }}</b></span>
        <div class="pb"><i class="a" :style="{ width: pct(p.done_month, p.done_month + p.open) }" /><i class="b" :style="{ width: pct(p.open - p.late, p.done_month + p.open) }" /><i class="c" :style="{ width: pct(p.late, p.done_month + p.open) }" /></div>
        <span>{{ p.done_month }} done</span><span>{{ p.open }} open</span><span :class="p.late ? 'dn' : 'mut'">{{ p.late ? p.late + ' late' : '—' }}</span></div></section>
    <div class="g2"><section class="card"><b>By business</b><div v-for="x in data.biz" :key="x.business" class="pr bz"><span>{{ bizName(x.business) }}</span><div class="pb"><i class="a" :style="{ width: pct(x.done, x.done + x.open) }" /><i class="b" :style="{ width: pct(x.open, x.done + x.open) }" /></div><span class="mut">{{ x.done }}/{{ x.done + x.open }}</span></div></section>
      <section class="card"><b>Just finished</b><div v-if="!data.recent.length" class="mut sm" style="margin-top: 8px;">Nothing finished yet.</div>
        <button v-for="t in data.recent" :key="t.id" type="button" class="rc" @click="emit('open', t.id)"><span class="ok" aria-hidden="true" /><span class="rt">{{ t.title }}<em>{{ bizName(t.business) }} · {{ ago(t.completed_at) }}</em></span><span class="av">{{ initials(t.completed_by_name) }}</span></button></section></div>
  </div>
</template>
<style scoped>
.pg { display: flex; flex-direction: column; gap: 14px; } .card { padding: 16px 20px; } .mut { color: var(--c-muted); } .sm { font-size: 13px; } .dn { color: var(--c-danger); }
.kp { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .kp span { display: block; font-size: 12.5px; color: var(--c-muted); } .kp b { display: block; font-size: 28px; font-weight: 600; letter-spacing: -.02em; } .kp em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.ch { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; } .lg { font-size: 12.5px; color: var(--c-muted); display: flex; align-items: center; gap: 5px; } .lg i { display: inline-block; width: 10px; height: 10px; margin-left: 8px; }
.a { background: var(--c-blue-deep); } .b { background: #b9cfe2; } .c { background: var(--c-danger); }
.pr { display: grid; grid-template-columns: 210px minmax(0, 1fr) 70px 70px 64px; gap: 14px; align-items: center; padding: 11px 0; border-top: 1px solid var(--c-rule); font-size: 14px; } .pr:first-of-type { margin-top: 10px; } .pr.bz { grid-template-columns: 140px minmax(0, 1fr) 54px; }
.nm { display: flex; gap: 10px; align-items: center; min-width: 0; } .nm b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb { height: 10px; background: var(--c-paper-2); display: flex; } .pb i { display: block; height: 100%; }
.av { width: 26px; height: 26px; border-radius: 50%; background: var(--c-navy); color: #fff; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; flex: none; } .av.grp { border-radius: 0; background: #e6ecf2; color: var(--c-blue-deep); font-size: 10px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
.rc { display: flex; gap: 10px; align-items: center; width: 100%; padding: 9px 0; border: 0; border-top: 1px solid var(--c-rule); background: none; font: inherit; font-size: 14px; text-align: left; cursor: pointer; } .rc:first-of-type { margin-top: 10px; } .rc:hover .rt { color: var(--c-blue-deep); }
.rt { flex: 1; min-width: 0; } .rt em { display: block; font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.ok { width: 17px; height: 17px; background: var(--c-blue-deep); position: relative; flex: none; } .ok::after { content: ''; position: absolute; left: 5.5px; top: 2px; width: 4px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
@media (max-width: 900px) { .kp, .g2 { grid-template-columns: 1fr 1fr; } .pr { grid-template-columns: 1fr 1fr; } .g2 { grid-template-columns: 1fr; } }
</style>
