<script setup lang="ts">
useHead({ title: 'Documents' })
const { data } = await usePortalFetch<{ id: string; title: string; size_bytes: number; kind: string; reason: string | null; created_at: string; job_id: string; job: string }[]>('/api/portal/documents')
const msg = ref(''); const who = ref<'all' | 'team' | 'you'>('all'); const q = ref('')
const list = computed(() => (data.value ?? []).filter((d) => (who.value === 'all' || (who.value === 'you') === (d.kind === 'client_document')) && (!q.value || (d.title + ' ' + (d.reason ?? '')).toLowerCase().includes(q.value.toLowerCase()))))
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/portal/documents/' + id); window.location.href = r.url } catch (e) { msg.value = portalErr(e) } }
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const size = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB')
const ext = (t: string) => (t.split('.').pop() ?? 'file').slice(0, 4).toUpperCase()
</script>
<template>
  <section v-if="data">
    <ClientTabs />
    <div class="hd"><h1>Documents</h1><div class="tools"><input v-model="q" placeholder="Search documents" aria-label="Search"><div class="seg"><button v-for="[k, l] in [['all', 'All'], ['team', 'From Aidi'], ['you', 'Sent by you']]" :key="k" :class="{ on: who === k }" @click="who = k as 'all'">{{ l }}</button></div></div></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div class="grid"><button v-for="d in list" :key="d.id + d.created_at" type="button" class="card dc" @click="openDoc(d.id)"><span class="ic">{{ ext(d.title) }}</span><span class="dt"><b>{{ d.title.split(' — ').pop() }}</b><em>{{ d.reason || 'No note' }}</em><span class="mt">{{ d.kind === 'client_document' ? 'Sent by you' : 'From Aidi' }} · {{ day(d.created_at) }} · {{ size(d.size_bytes) }}</span></span><span class="dl">Download</span></button></div>
    <EmptyState v-if="!list.length" card icon="documents" :title="data.length ? 'No documents match' : 'No documents yet'" :text="data.length ? 'Try another filter.' : 'Documents we share with you, and files you send us in messages or requests, appear here.'" />
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; } .hd h1 { margin: 0; } .tools { display: flex; gap: 10px; flex-wrap: wrap; } input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { background: #fff; border: 0; padding: 8px 12px; font: inherit; font-size: 13px; cursor: pointer; color: var(--c-ink-soft); } .seg button.on { background: var(--c-navy); color: #fff; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; } .dc { display: flex; gap: 12px; align-items: flex-start; text-align: left; font: inherit; cursor: pointer; } .dc:hover { border-color: var(--c-navy); }
.ic { width: 42px; height: 48px; display: grid; place-items: center; background: var(--c-signal-soft); color: var(--c-blue-deep); font-size: 11px; font-weight: 700; flex: none; } .dt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dt b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .dt em { font-style: normal; font-size: 13px; color: var(--c-ink-soft); } .mt { font-size: 12px; color: var(--c-muted); } .dl { font-size: 13px; color: var(--c-blue-deep); }
.none { color: var(--c-muted); text-align: center; padding: 28px; } .error { color: var(--c-danger); }
</style>
