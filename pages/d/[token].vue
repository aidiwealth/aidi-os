<script setup lang="ts">
// A shared data room (also at /<handle>/<name>): NDA gate when required; opening a file records who viewed it and for
// how long; optional watermark with the viewer's email and the date.
definePageMeta({ layout: 'public' })
const route = useRoute()
const ref0 = route.params.token ? String(route.params.token) : '@' + String(route.params.handle) + '.' + String(route.params.link)
const api = '/api/public/d/' + encodeURIComponent(ref0)
interface Fi { id: string; title: string; folder: string; is_deck: boolean; mime_type: string; size_bytes: number }
const nda = ref('')
const { data, error, refresh } = await useFetch<{ company: string; require_email: boolean; allow_download: boolean; watermark: boolean; nda: { required: boolean; text: string; key: string }; files: Fi[] }>(() => api + (nda.value ? '?nda=' + nda.value : ''), { key: 'pub-d-' + ref0 })
useHead({ titleTemplate: '%s', title: () => (data.value ? data.value.company + ' · Data room' : 'Data room'), meta: [{ name: 'robots', content: 'noindex' }] })
const email = ref(''); const entered = ref(false); const msg = ref('')
onMounted(() => { const e = localStorage.getItem('finvry-dr-email'); if (e) { email.value = e; entered.value = true } const k = data.value?.nda?.key; if (data.value?.nda?.required && k) { const s = localStorage.getItem('finvry-nda-' + k); if (s) { nda.value = s; refresh() } } })
function signed(id: string) { nda.value = id; entered.value = true; refresh() }
function enter() { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { localStorage.setItem('finvry-dr-email', email.value); entered.value = true } else msg.value = 'Enter a valid email.' }
const viewing = ref<{ title: string; url: string; mark: string | null } | null>(null); let viewId = ''; let timer: ReturnType<typeof setInterval> | undefined
async function open(f: Fi, download = false) {
  msg.value = ''
  try { const r = await $fetch<{ view_id: string; url: string; watermark: string | null }>(api + '/open', { method: 'POST', body: { file_id: f.id, email: email.value, download, nda: nda.value || undefined } })
    if (download || (!f.mime_type.includes('pdf') && !f.mime_type.startsWith('image/'))) { window.location.href = r.url; return }
    viewId = r.view_id; viewing.value = { title: f.title, url: r.url, mark: r.watermark }; clearInterval(timer); timer = setInterval(() => { if (document.visibilityState === 'visible') $fetch(api + '/beat', { method: 'POST', body: { view_id: viewId } }).catch(() => {}) }, 15000)
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open the file.' }
}
function close() { viewing.value = null; clearInterval(timer) }
onBeforeUnmount(() => clearInterval(timer))
const groups = computed(() => { const m = new Map<string, Fi[]>(); for (const f of data.value?.files ?? []) { const k = f.is_deck ? 'Pitch deck' : f.folder; m.set(k, [...(m.get(k) ?? []), f]) } return [...m.entries()] })
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
        <div v-for="[g, list] in groups" :key="g" class="grp"><h2>{{ g }}</h2>
          <div v-for="f in list" :key="f.id" class="card fi"><span class="ic">{{ f.title.split('.').pop()?.toUpperCase().slice(0, 4) }}</span><span class="ft"><b>{{ f.title }}</b><em>{{ (f.size_bytes / 1e6).toFixed(1) }} MB</em></span>
            <button class="btn" @click="open(f)">{{ f.mime_type.includes('pdf') || f.mime_type.startsWith('image/') ? 'View' : 'Open' }}</button><button v-if="data.allow_download && (!data.watermark || f.mime_type.includes('pdf'))" class="btn secondary" @click="open(f, true)">Download</button></div></div>
        <EmptyState v-if="!data.files.length" compact icon="documents" title="No documents shared yet" />
      </template>
    </template>
    <div v-if="viewing" class="viewer" @contextmenu.prevent><div class="vh"><b>{{ viewing.title }}</b><button class="btn secondary" @click="close">Close</button></div>
      <div class="vb"><iframe :src="viewing.url + (viewing.mark ? '#toolbar=0' : '')" title="Document" /><div v-if="viewing.mark" class="wm" aria-hidden="true"><span v-for="n in 40" :key="n">{{ viewing.mark }}</span></div></div></div>
  </section>
</template>
<style scoped>
.wrap { max-width: 900px; margin: 0 auto; } h1 { margin: 2px 0 18px; color: inherit; } .gate { display: flex; flex-direction: column; gap: 8px; max-width: 520px; } .row { display: flex; gap: 8px; } .row input { flex: 1; font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); }
.grp h2 { font-size: 18px; margin: 18px 0 8px; color: inherit; } .fi { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; color: var(--c-ink); } .ic { width: 38px; height: 44px; display: grid; place-items: center; background: var(--c-signal-soft); color: var(--c-blue-deep); font-size: 10px; font-weight: 700; flex: none; } .ft { flex: 1; min-width: 0; display: flex; flex-direction: column; } .ft em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.wmn { font-size: 13px; opacity: .75; } .viewer { position: fixed; inset: 0; background: rgba(12,26,46,.88); z-index: 1000; display: flex; flex-direction: column; padding: 16px; } .vh { display: flex; justify-content: space-between; align-items: center; color: #fff; margin-bottom: 10px; }
.vb { flex: 1; position: relative; overflow: hidden; background: #fff; } .vb iframe { width: 100%; height: 100%; border: 0; }
.wm { position: absolute; inset: -50%; pointer-events: none; display: flex; flex-wrap: wrap; gap: 70px 90px; transform: rotate(-28deg); align-content: center; justify-content: center; } .wm span { font-size: 18px; font-weight: 600; color: rgba(12, 26, 46, .13); white-space: nowrap; user-select: none; }
.mut { opacity: .7; } .error { color: var(--c-danger); }
</style>
