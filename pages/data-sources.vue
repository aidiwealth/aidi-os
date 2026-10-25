<script setup lang="ts">
// Data sources: everything feeding Finvry (banks, linked sheets, accounting software) and the updates waiting
// for you, in one list, each linking to where it is managed.
interface It { name: string; company: string; detail: string; status: string; ok: boolean; to: string }
const { data } = await useFetch<{ sections: { key: string; title: string; empty: string; items: It[] }[] }>('/api/data-sources')
useHead({ title: 'Data sources' })
</script>
<template>
  <section class="ds">
    <div><h1>Data sources</h1><p class="lead">Banks, sheets and accounting software that feed your figures.</p></div>
    <div v-for="s in data?.sections ?? []" :key="s.key" class="card"><div class="ch"><h2>{{ s.title }}</h2><span v-if="s.items.length" class="mut">{{ s.items.length }}</span></div>
      <p v-if="!s.items.length" class="mut pad">{{ s.empty }}</p>
      <div v-for="(x, i) in s.items" :key="i" class="row"><div class="nm"><b>{{ x.name }}</b><small>{{ [x.company, x.detail].filter(Boolean).join(' · ') }}</small></div>
        <span class="st" :class="{ bad: !x.ok }">{{ x.status }}</span><NuxtLink :to="x.to" class="lk">Open</NuxtLink></div></div>
  </section>
</template>
<style scoped>
.ds { display: flex; flex-direction: column; gap: 16px; } .ds h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 680px; }
.card { background: #fff; border: 1px solid var(--c-rule); } .ch { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 18px 8px; } .ch h2 { margin: 0; font-size: 16px; }
.mut { color: var(--c-muted); font-size: 13px; } .pad { padding: 0 18px 14px; margin: 0; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 16px; align-items: center; padding: 10px 18px; border-top: 1px solid var(--c-rule); font-size: 13.5px; }
.nm small { display: block; color: var(--c-muted); font-size: 12px; margin-top: 2px; } .st { font-size: 12.5px; color: var(--c-ink-soft); text-align: right; } .st.bad { color: var(--c-blue-deep); font-weight: 500; }
.lk { font-size: 13px; color: var(--c-blue-deep); text-decoration: none; } @media (max-width: 720px) { .row { grid-template-columns: 1fr; gap: 4px; } .st { text-align: left; } }
</style>
