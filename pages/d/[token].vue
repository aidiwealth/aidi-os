<script setup lang="ts">
// A shared data room (also at /<handle>/<name>): NDA gate when required; opening a file records who viewed it and for
// how long; optional watermark with the viewer's email and the date.
definePageMeta({ layout: 'public' })
const route = useRoute()
const ref0 = route.params.token ? String(route.params.token) : '@' + String(route.params.handle) + '.' + String(route.params.link)
const api = '/api/public/d/' + encodeURIComponent(ref0)
interface Fi { id: string; title: string; folder: string; is_deck: boolean; mime_type: string; size_bytes: number }
const nda = ref(String(useRoute().query.nda ?? ''))
const goNda = (id: string) => { const u = new URL(window.location.href); u.searchParams.set('nda', id); window.location.replace(u.toString()) }
const { data, error, refresh } = await useFetch<{ company: string; require_email: boolean; allow_download: boolean; watermark: boolean; nda: { required: boolean; text: string; key: string }; files: Fi[] }>(() => api + (nda.value ? '?nda=' + encodeURIComponent(nda.value) : ''), { key: 'pub-d-' + ref0 + (nda.value ? '-' + nda.value : '') })
useHead({ titleTemplate: '%s', title: () => (data.value ? data.value.company + ' · Data room' : 'Data room'), meta: [{ name: 'robots', content: 'noindex' }] })
const email = ref(''); const entered = ref(false); const msg = ref('')
onMounted(() => { const e = localStorage.getItem('finvry-dr-email'); if (e) { email.value = e; entered.value = true } const k = data.value?.nda?.key; if (data.value?.nda?.required && k) { const s = localStorage.getItem('finvry-nda-' + k); if (s && s !== nda.value) goNda(s) } })
function signed(id: string) { goNda(id) }
function enter() { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { localStorage.setItem('finvry-dr-email', email.value); entered.value = true } else msg.value = 'Enter a valid email.' }
const viewing = ref<{ title: string; url: string; mark: string | null; mime?: string } | null>(null); let viewId = ''; let timer: ReturnType<typeof setInterval> | undefined
async function open(f: Fi, download = false) {
  msg.value = ''
  try { const r = await $fetch<{ view_id: string; url: string; watermark: string | null }>(api + '/open', { method: 'POST', body: { file_id: f.id, email: email.value, download, nda: nda.value || undefined } })
    if (download || (!f.mime_type.includes('pdf') && !f.mime_type.startsWith('image/'))) { window.location.href = r.url; return }
    viewId = r.view_id; viewing.value = { title: f.title, url: r.url, mark: r.watermark, mime: (r as { mime?: string }).mime ?? '' }; clearInterval(timer); timer = setInterval(() => { if (document.visibilityState === 'visible') $fetch(api + '/beat', { method: 'POST', body: { view_id: viewId } }).catch(() => {}) }, 15000)
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open the file.' }
}
function close() { viewing.value = null; clearInterval(timer) }
onBeforeUnmount(() => clearInterval(timer))
const allGroups = computed(() => { const m = new Map<string, Fi[]>(); for (const f of data.value?.files ?? []) { const k = f.is_deck ? 'Pitch deck' : f.folder; m.set(k, [...(m.get(k) ?? []), f]) } return [...m.entries()] })
const folder = ref('all')
const groups = computed(() => (folder.value === 'all' ? allGroups.value : allGroups.value.filter(([g]) => g === folder.value)))
const KIND: Record<string, string> = { 'application/pdf': 'PDF', 'text/csv': 'CSV', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX' }
const badge = (f: Fi) => KIND[f.mime_type] ?? (f.mime_type.startsWith('image/') ? 'IMG' : (f.title.includes('.') ? f.title.split('.').pop()!.toUpperCase().slice(0, 4) : 'FILE'))
const size = (b: number) => (b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB')
</script>
<template>
  <section class="wrap">
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link is no longer active' : 'This link is not valid' }}</h1><p class="mut">Ask the company for a new link.</p></div>
    <NdaGate v-else-if="data && data.nda.required" :company="data.company" :text="data.nda.text" kind="room" :ref-key="ref0" :org-key="data.nda.key" @signed="signed" />
    <template v-else-if="data">
      <p class="label">Data room</p><h1>{{ data.company }}</h1>
      <form v-if="data.require_email && !entered" class="card gate" @submit.prevent="enter"><b>Enter your email to view</b><p class="mut">{{ data.company }} will see that you viewed their documents.</p><div class="row"><input v-model="email" type="email" required placeholder="you@fund.com"><button class="btn" type="submit">View documents</button></div><p v-if="msg" class="error">{{ msg }}</p></form>
      <template v-else>
        <p v-if="data.watermark" class="wmn">Documents are watermarked with your email and today's date, including downloads.</p>
        <p v-if="msg" class="error">{{ msg }}</p>
        <div v-if="data.files.length" class="dr"><nav class="side" aria-label="Folders"><button :class="{ on: folder === 'all' }" @click="folder = 'all'"><span>All documents</span><em>{{ data.files.length }}</em></button><button v-for="[g, list] in allGroups" :key="'n' + g" :class="{ on: folder === g }" @click="folder = g"><span>{{ g }}</span><em>{{ list.length }}</em></button></nav><div class="main">
        <div v-for="[g, list] in groups" :key="g" class="grp"><h2>{{ g }}</h2>
          <div v-for="f in list" :key="f.id" class="card fi"><span class="ic">{{ badge(f) }}</span><span class="ft"><b>{{ f.title }}</b><em>{{ size(f.size_bytes) }}</em></span>
            <button class="btn" @click="open(f)">{{ f.mime_type.includes('pdf') || f.mime_type.startsWith('image/') ? 'View' : 'Open' }}</button><button v-if="data.allow_download && (!data.watermark || f.mime_type.includes('pdf'))" class="btn secondary" @click="open(f, true)">Download</button></div></div>
        </div></div><!-- /dr -->
        <EmptyState v-if="!data.files.length" compact icon="documents" title="No documents shared yet" />
      </template>
    </template>
    <div v-if="viewing" class="viewer" @contextmenu.prevent><div class="vh"><b>{{ viewing.title }}</b><button class="btn secondary" @click="close">Close</button></div>
      <div class="vb"><ClientOnly v-if="viewing.mime === 'application/pdf'"><DeckViewer :src="viewing.url" /></ClientOnly><img v-else-if="viewing.mime?.startsWith('image/')" :src="viewing.url" :alt="viewing.title" class="vimg"><div v-else class="vnone"><p>This file can't be previewed in the browser.</p><p v-if="data?.allow_download" class="mut">Use Download to open it.</p><p v-else class="mut">Ask {{ data?.company }} for a PDF copy.</p></div><div v-if="viewing.mark" class="wm" aria-hidden="true"><span v-for="n in 40" :key="n">{{ viewing.mark }}</span></div></div></div>
  </section>
</template>
<style scoped>
.wrap { max-width: 1120px; margin: 0 auto; } h1 { margin: 2px 0 18px; color: inherit; } .gate { display: flex; flex-direction: column; gap: 8px; max-width: 520px; } .row { display: flex; gap: 8px; } .row input { flex: 1; font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); }
.grp h2 { font-size: 18px; margin: 18px 0 8px; color: inherit; } .fi { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; color: var(--c-ink); } .ic { width: 38px; height: 44px; display: grid; place-items: center; background: var(--c-signal-soft); color: var(--c-blue-deep); font-size: 10px; font-weight: 700; flex: none; } .ft { flex: 1; min-width: 0; display: flex; flex-direction: column; } .ft em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.wmn { font-size: 13px; opacity: .75; } .viewer { position: fixed; inset: 0; background: rgba(12,26,46,.88); z-index: 1000; display: flex; flex-direction: column; padding: 16px; } .vh { display: flex; justify-content: space-between; align-items: center; color: #fff; margin-bottom: 10px; }
.vb { flex: 1; position: relative; overflow: hidden; background: #fff; } .vb iframe { width: 100%; height: 100%; border: 0; }
.wm { position: absolute; inset: -50%; pointer-events: none; display: flex; flex-wrap: wrap; gap: 70px 90px; transform: rotate(-28deg); align-content: center; justify-content: center; } .wm span { font-size: 18px; font-weight: 600; color: rgba(12, 26, 46, .13); white-space: nowrap; user-select: none; }
.mut { opacity: .7; } .error { color: var(--c-danger); }
.vb { overflow: auto !important; padding: 16px 0; } .vimg { max-width: 100%; display: block; margin: 0 auto; } .vnone { padding: 40px; text-align: center; } .vnone .mut { color: var(--c-muted); font-size: 13.5px; }
.dr { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 28px; align-items: start; margin-top: 8px; }
.side { position: sticky; top: 90px; display: flex; flex-direction: column; gap: 2px; border-right: 1px solid var(--c-rule); padding-right: 14px; }
.side button { display: flex; justify-content: space-between; align-items: center; gap: 8px; background: none; border: 0; padding: 9px 12px; font: inherit; font-size: 14px; text-align: left; cursor: pointer; color: var(--c-ink-soft); border-radius: 6px; }
.side button:hover { background: var(--c-paper-2); } .side button.on { background: var(--c-signal-soft); color: var(--c-blue-deep); font-weight: 600; } .side em { font-style: normal; font-size: 12px; color: var(--c-muted); background: #fff; border: 1px solid var(--c-rule); padding: 0 7px; border-radius: 10px; }
.main .grp:first-child h2 { margin-top: 0; }
@media (max-width: 800px) { .dr { grid-template-columns: 1fr; gap: 12px; } .side { position: static; flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--c-rule); padding: 0 0 8px; } .side button { white-space: nowrap; } }
</style>
