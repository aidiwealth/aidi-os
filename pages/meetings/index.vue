<script setup lang="ts">
// Meeting minutes: every team, board, investor and client meeting, by company, with decisions and open actions.
useHead({ title: 'Meeting minutes' })
interface M { id: string; title: string; kind: string; held_at: string; entity_id: string | null; entity: string | null; status: string; summary: string | null; attendees: string[]; guests: string | null; open_actions: number; actions: number; by_name: string | null }
const entity = ref(''); const kind = ref(''); const q = ref('')
const { data } = await useFetch<{ meetings: M[]; entities: { id: string; name: string }[]; people: { id: string; name: string }[]; kinds: Record<string, string> }>('/api/meetings', { query: { entity } })
const list = computed(() => (data.value?.meetings ?? []).filter((m) => (!kind.value || m.kind === kind.value) && (!q.value || (m.title + ' ' + (m.entity ?? '') + ' ' + (m.summary ?? '')).toLowerCase().includes(q.value.toLowerCase()))))
const n = computed(() => { const l = data.value?.meetings ?? [], month = new Date(Date.now() - 30 * 864e5).toISOString(); return { month: l.filter((m) => m.held_at >= month).length, open: l.reduce((a, m) => a + m.open_actions, 0), drafts: l.filter((m) => m.status === 'draft').length } })
const who = (ids: string[]) => ids.map((i) => data.value?.people.find((p) => p.id === i)?.name.split(' ')[0]).filter(Boolean).join(', ')
const mon = (d: string) => new Date(d).toLocaleDateString('en-GB', { month: 'short' }); const dd = (d: string) => new Date(d).getDate()
const time = (d: string) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>
<template>
  <section v-if="data">
    <div class="hd"><div><h1>Meeting minutes</h1><p class="lead">Minutes, decisions and actions for every meeting, by company.</p></div><NuxtLink to="/meetings/new" class="btn">+ Log a meeting</NuxtLink></div>
    <div class="fx-stats"><StatTile icon="calendar" tone="b" label="Meetings, last 30 days" :value="n.month" /><StatTile icon="check" :tone="n.open ? 'a' : 'g'" label="Open action items" :value="n.open" note="across all meetings" /><StatTile icon="doc" tone="n" label="Drafts" :value="n.drafts" note="not marked final" /></div>
    <div class="bar"><select v-model="entity" aria-label="Company"><option value="">All companies</option><option v-for="e in data.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select>
      <div class="chips"><button :class="{ on: !kind }" @click="kind = ''">All</button><button v-for="(l, k) in data.kinds" :key="k" :class="{ on: kind === k }" @click="kind = String(k)">{{ l }}</button></div>
      <input v-model="q" placeholder="Search meetings" aria-label="Search meetings"></div>
    <div v-if="list.length" class="list">
      <NuxtLink v-for="m in list" :key="m.id" :to="'/meetings/' + m.id" class="row">
        <span class="fx-cal"><em>{{ mon(m.held_at) }}</em><b>{{ dd(m.held_at) }}</b></span>
        <div class="tx"><b>{{ m.title }}<span v-if="m.status === 'draft'" class="dr">Draft</span></b><span class="mt">{{ data.kinds[m.kind] }}{{ m.entity ? ' · ' + m.entity : '' }} · {{ time(m.held_at) }}{{ m.attendees.length ? ' · ' + who(m.attendees) : '' }}</span><p v-if="m.summary" class="sm">{{ m.summary }}</p></div>
        <span class="fx-pill" :class="m.open_actions ? 'amber' : m.actions ? 'g' : ''">{{ m.open_actions ? m.open_actions + ' open action' + (m.open_actions === 1 ? '' : 's') : m.actions ? 'Actions done' : 'No actions' }}</span>
      </NuxtLink>
    </div>
    <EmptyState v-else card icon="meetings" title="No meetings logged yet" text="Log your first meeting."><NuxtLink to="/meetings/new" class="btn">Log a meeting</NuxtLink></EmptyState>
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 820px; } .hd a.btn { text-decoration: none; }
.bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; } .bar select, .bar input { font: inherit; font-size: 13.5px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .bar input { margin-left: auto; min-width: 220px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.list { background: #fff; border: 1px solid var(--c-rule); } .row { display: flex; gap: 14px; align-items: flex-start; padding: 14px 18px; border-bottom: 1px solid var(--c-rule); text-decoration: none; color: inherit; } .row:last-child { border-bottom: 0; } .row:hover { background: #fbfaf7; }
.tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; } .tx b { font-weight: 600; color: var(--c-ink); display: flex; gap: 8px; align-items: center; } .mt { font-size: 12.5px; color: var(--c-muted); } .sm { margin: 4px 0 0; font-size: 13.5px; color: var(--c-ink-soft); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dr { font-size: 11px; font-weight: 600; padding: 2px 7px; background: #fff6e6; color: #a5650b; }
</style>
