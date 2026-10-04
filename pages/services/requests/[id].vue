<script setup lang="ts">
const id = useRoute().params.id as string
interface Q { id: string; label: string; type: string; section: string; detail?: string; detailWhen?: string }
const { data, refresh } = await useFetch<{ request: { id: string; client_id: string; client: string; company: string | null; job_id: string | null; tax_year: number; sent_to: string; status: string; answers: Record<string, any>; submitted_at: string | null; link_active: boolean }; files: { field: string; id: string; title: string; size_bytes: number }[]; questions: Q[] }>('/api/services/requests/' + id)
useHead({ title: () => (data.value ? data.value.request.tax_year + ' tax information · ' + data.value.request.client : 'Tax information') })
const sections = computed(() => { const m = new Map<string, Q[]>(); for (const q of data.value?.questions ?? []) m.set(q.section, [...(m.get(q.section) ?? []), q]); return [...m.entries()] })
const files = (f: string) => (data.value?.files ?? []).filter((x) => x.field === f)
const show = (v: unknown) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v === undefined || v === null || v === '' ? '—' : String(v))
const msg = ref(''); const ok = ref('')
async function act(action: string) { msg.value = ''; ok.value = ''; try { await $fetch('/api/services/requests/' + id + '/action', { method: 'POST', body: { action } }); ok.value = action === 'resend' ? 'A new link was emailed.' : 'Cancelled.'; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' } }
async function open(docId: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + docId + '/download'); window.location.href = r.url } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open the file.' } }
const ST: Record<string, string> = { sent: 'Sent, not started', in_progress: 'Client is filling it in', submitted: 'Submitted', cancelled: 'Cancelled' }
</script>

<template>
  <section v-if="data">
    <CsNav />
    <NuxtLink :to="'/services/clients/' + data.request.client_id" class="back">← {{ data.request.client }}</NuxtLink>
    <div class="dh"><div><h1>{{ data.request.tax_year }} tax information</h1><p class="muted">{{ data.request.company }} · sent to {{ data.request.sent_to }} · {{ ST[data.request.status] }}{{ data.request.submitted_at ? ' ' + new Date(data.request.submitted_at).toLocaleDateString('en-GB') : '' }}</p></div>
      <div class="row"><NuxtLink v-if="data.request.job_id" :to="'/services/' + data.request.job_id" class="btn secondary">Open job</NuxtLink>
        <button v-if="data.request.status === 'sent' || data.request.status === 'in_progress'" class="btn secondary" @click="act('resend')">Resend link</button>
        <button v-if="data.request.status !== 'cancelled' && data.request.status !== 'submitted'" class="btn secondary" @click="act('cancel')">Cancel</button></div></div>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
    <div v-for="[sec, qs] in sections" :key="sec" class="card sec">
      <h2>{{ sec }}</h2>
      <div v-for="q in qs" :key="q.id" class="qa">
        <span class="ql">{{ q.label }}</span>
        <div v-if="q.type === 'file'"><template v-if="files(q.id).length"><button v-for="f in files(q.id)" :key="f.id" class="file" @click="open(f.id)">{{ f.title.split(' — ').pop() }}</button></template><span v-else class="muted">No file</span></div>
        <table v-else-if="q.type === 'shareholders' && Array.isArray(data.request.answers[q.id])" class="mini"><tr v-for="(r, i) in data.request.answers[q.id]" :key="i"><td><b>{{ r.name }}</b> {{ r.ownership ? r.ownership + '%' : '' }}</td><td>{{ r.country }}</td><td>{{ r.contact }}</td><td>{{ r.tax_id }}</td><td>{{ r.address }}</td></tr></table>
        <table v-else-if="q.type === 'accounts' && Array.isArray(data.request.answers[q.id])" class="mini"><tr v-for="(r, i) in data.request.answers[q.id]" :key="i"><td>{{ r.bank }}</td><td>{{ r.last4 ? '•••• ' + r.last4 : '' }}</td><td>{{ r.highest ? '$' + r.highest : '' }}</td></tr></table>
        <p v-else class="ans">{{ show(data.request.answers[q.id]) }}</p>
        <p v-if="q.detail && data.request.answers[q.id + '_detail']" class="ans det">{{ q.detail }}: {{ data.request.answers[q.id + '_detail'] }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 12px; color: var(--c-muted); } .muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); } .row { display: flex; gap: 8px; flex-wrap: wrap; }
.sec { margin: 14px 0; } .sec h2 { margin: 0 0 6px; } .qa { display: grid; grid-template-columns: 40% 1fr; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--c-rule); } .qa:last-child { border-bottom: 0; }
.ql { font-size: 13px; color: var(--c-muted); } .ans { margin: 0; white-space: pre-wrap; font-size: 14px; } .det { grid-column: 2; font-size: 13px; color: var(--c-ink-soft); }
.file { display: block; background: var(--c-paper-2); border: 0; padding: 6px 10px; margin-bottom: 4px; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; text-align: left; }
.mini { border-collapse: collapse; font-size: 13px; } .mini td { padding: 4px 12px 4px 0; vertical-align: top; }
@media (max-width: 800px) { .qa { grid-template-columns: 1fr; gap: 4px; } .det { grid-column: 1; } }
</style>
