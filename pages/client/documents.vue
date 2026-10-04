<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useHead({ title: 'Documents' })
const { data } = await usePortalFetch<{ id: string; title: string; size_bytes: number; kind: string; reason: string | null; created_at: string; job_id: string; job: string }[]>('/api/portal/documents')
const msg = ref('')
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/portal/documents/' + id); window.location.href = r.url } catch (e) { msg.value = portalErr(e) } }
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const size = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB')
</script>
<template>
  <section v-if="data">
    <ClientTabs />
    <h1>Documents</h1><p v-if="msg" class="error">{{ msg }}</p>
    <div class="box"><table v-if="data.length"><thead><tr><th>Document</th><th>Reason</th><th>Request</th><th>Date</th><th /></tr></thead>
      <tbody><tr v-for="d in data" :key="d.id + d.created_at"><td><b>{{ d.title.split(' — ').pop() }}</b><span class="s">{{ d.kind === 'client_document' ? 'Sent by you' : 'From our team' }} · {{ size(d.size_bytes) }}</span></td>
        <td class="r">{{ d.reason || '—' }}</td><td><NuxtLink :to="'/client/jobs/' + d.job_id">{{ d.job }}</NuxtLink></td><td class="dt">{{ day(d.created_at) }}</td><td><button type="button" class="link" @click="openDoc(d.id)">Download</button></td></tr></tbody></table>
      <p v-else class="none">No documents yet.</p></div>
  </section>
</template>
<style scoped>
h1 { margin: 0 0 16px; } .box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 400; font-size: 13px; color: var(--c-muted); padding: 12px 16px; border-bottom: 1px solid var(--c-rule); } td { padding: 13px 16px; border-bottom: 1px solid var(--c-rule); font-size: 14px; vertical-align: top; }
td b { font-weight: 500; } .s { display: block; font-size: 12px; color: var(--c-muted); } .r { max-width: 320px; color: var(--c-ink-soft); } .dt { white-space: nowrap; color: var(--c-ink-soft); }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .none { padding: 18px; color: var(--c-muted); margin: 0; } .error { color: var(--c-danger); }
</style>
