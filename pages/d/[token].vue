<script setup lang="ts">
// A shared data room (also at /<handle>/<name>): NDA gate when required; opening a file records who viewed it and for
// how long; optional watermark with the viewer's email and the date.
definePageMeta({ layout: 'public' })
const route = useRoute()
const ref0 = route.params.token ? String(route.params.token) : '@' + String(route.params.handle) + '.' + String(route.params.link)
const api = '/api/public/d/' + encodeURIComponent(ref0)
interface Fi { id: string; title: string; folder: string; folder_id?: string | null; is_deck: boolean; mime_type: string; size_bytes: number }
interface Fo { id: string; parent_id: string | null; name: string; position: number; link: boolean }
const nda = ref(String(useRoute().query.nda ?? ''))
const goNda = (id: string) => { const u = new URL(window.location.href); u.searchParams.set('nda', id); window.location.replace(u.toString()) }
const { data, error, refresh } = await useFetch<{ invite?: { page: string }; viewer?: string | null; company: string; logo?: string | null; require_email: boolean; allow_download: boolean; watermark: boolean; nda: { required: boolean; text: string; key: string }; files: Fi[]; folders?: Fo[] }>(() => api + (nda.value ? '?nda=' + encodeURIComponent(nda.value) : ''), { key: 'pub-d-' + ref0 + (nda.value ? '-' + nda.value : '') })
useHead({ titleTemplate: '%s', title: () => (data.value ? data.value.company + ' · Data room' : 'Data room'), meta: [{ name: 'robots', content: 'noindex' }] })
const email = ref(''); const entered = ref(false); const msg = ref('')
watchEffect(() => { const v = data.value?.viewer; if (v) { email.value = v; entered.value = true } })
onMounted(() => { const e = localStorage.getItem('finvry-dr-email'); if (e && !data.value?.viewer) { email.value = e; entered.value = true } const k = data.value?.nda?.key; if (data.value?.nda?.required && k) { const s = localStorage.getItem('finvry-nda-' + k); if (s && s !== nda.value) goNda(s) } })
function signed(id: string) { goNda(id) }
function enter() { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { localStorage.setItem('finvry-dr-email', email.value); entered.value = true } else msg.value = 'Enter a valid email.' }
const viewing = ref<{ title: string; url: string; mark: string | null; overlay?: string | null; mime?: string } | null>(null); let viewId = ''; let timer: ReturnType<typeof setInterval> | undefined
async function open(f: Fi, download = false) {
  msg.value = ''
  try { const r = await $fetch<{ view_id: string; url: string; watermark: string | null; overlay?: string | null }>(api + '/open', { method: 'POST', body: { file_id: f.id, email: email.value, download, nda: nda.value || undefined } })
    if (download || (!f.mime_type.includes('pdf') && !f.mime_type.startsWith('image/'))) { window.location.href = r.url; return }
    viewId = r.view_id; viewing.value = { title: f.title, url: r.url, mark: r.watermark, overlay: r.overlay ?? null, mime: (r as { mime?: string }).mime ?? '' }; clearInterval(timer); timer = setInterval(() => { if (document.visibilityState === 'visible') $fetch(api + '/beat', { method: 'POST', body: { view_id: viewId } }).catch(() => {}) }, 15000)
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open the file.' }
}
function close() { viewing.value = null; clearInterval(timer) }
onBeforeUnmount(() => clearInterval(timer))
// Folders as the company ordered them, with sub-folders that open in the menu; files from before folders existed fall
// back to their category name.
const fos = computed<Fo[]>(() => { const f = data.value?.folders ?? []; if (f.length) return f
  return [...new Set((data.value?.files ?? []).filter((x) => !x.is_deck).map((x) => x.folder))].map((n, i) => ({ id: 'n:' + n, parent_id: null, name: n, position: i, link: false })) })
const fileFolder = (f: Fi) => (data.value?.folders?.length ? f.folder_id ?? null : 'n:' + f.folder)
const kidsOf = (id: string | null) => fos.value.filter((f) => f.parent_id === id).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
const filesIn = (id: string) => (data.value?.files ?? []).filter((f) => !f.is_deck && fileFolder(f) === id)
const countIn = (id: string): number => filesIn(id).length + kidsOf(id).reduce((t, k) => t + countIn(k.id), 0)
const decks = computed(() => (data.value?.files ?? []).filter((f) => f.is_deck))
const folder = ref('all')
const openSet = ref<Record<string, boolean>>({})
const pathTo = (id: string): Fo[] => { const f = fos.value.find((x) => x.id === id); return f ? [...(f.parent_id ? pathTo(f.parent_id) : []), f] : [] }
// The menu, flattened: each folder with its depth; a folder's sub-folders show while it is open or holds the one chosen.
const menu = computed(() => { const out: { f: Fo; depth: number; kids: boolean }[] = []; const onPath = new Set(pathTo(folder.value).map((x) => x.id))
  const walk = (pid: string | null, depth: number) => { for (const f of kidsOf(pid)) { const kids = kidsOf(f.id).length > 0; out.push({ f, depth, kids }); if (kids && (openSet.value[f.id] ?? onPath.has(f.id))) walk(f.id, depth + 1) } }
  walk(null, 0); return out })
function pick(f: Fo) { if (f.link) return openLink(f); const was = folder.value === f.id; folder.value = f.id; openSet.value = { ...openSet.value, [f.id]: was ? !(openSet.value[f.id] ?? true) : true } }
async function openLink(f: Fo) {
  const w = window.open('', '_blank')
  try { const r = await $fetch<{ url: string }>(api + '/link', { method: 'POST', body: { folder_id: f.id, email: email.value, nda: nda.value || undefined } }); if (w) w.location.href = r.url; else window.location.href = r.url }
  catch (e) { w?.close(); msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open the folder.' }
}
// What shows on the right: everything, folder by folder; or the chosen folder's sub-folders, then its files.
const sections = computed(() => { const out: { id: string; title: string; files: Fi[] }[] = []
  if (folder.value === 'all') { if (decks.value.length) out.push({ id: 'deck', title: 'Pitch deck', files: decks.value }); const walk = (pid: string | null) => { for (const f of kidsOf(pid)) { if (f.link) continue; const fl = filesIn(f.id); if (fl.length) out.push({ id: f.id, title: pathTo(f.id).map((x) => x.name).join(' / '), files: fl }); walk(f.id) } }; walk(null) }
  else if (folder.value === 'deck') out.push({ id: 'deck', title: 'Pitch deck', files: decks.value })
  else { const fl = filesIn(folder.value); if (fl.length) out.push({ id: folder.value, title: '', files: fl }) }
  return out })
// A long list shows 40 documents at a time and adds more as the reader scrolls (a large room no longer draws every
// row at once). Each folder starts again from the top.
const PAGE = 40
const shown = ref(PAGE)
watch(folder, () => { shown.value = PAGE })
const total = computed(() => sections.value.reduce((t, g) => t + g.files.length, 0))
const paged = computed(() => { let left = shown.value; const out: typeof sections.value = []
  for (const g of sections.value) { if (left <= 0) break; out.push({ ...g, files: g.files.slice(0, left) }); left -= g.files.length }
  return out })
const more = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null
watch(more, (el) => { io?.disconnect(); if (!el || typeof IntersectionObserver === 'undefined') return
  io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && shown.value < total.value) shown.value += PAGE }, { rootMargin: '600px 0px' }); io.observe(el) })
onBeforeUnmount(() => io?.disconnect())
const subs = computed(() => (folder.value === 'all' || folder.value === 'deck' ? [] : kidsOf(folder.value)))
const KIND: Record<string, string> = { 'application/pdf': 'PDF', 'text/csv': 'CSV', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX' }
const badge = (f: Fi) => KIND[f.mime_type] ?? (f.mime_type.startsWith('image/') ? 'IMG' : (f.title.includes('.') ? f.title.split('.').pop()!.toUpperCase().slice(0, 4) : 'FILE'))
const size = (b: number) => (b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB')
</script>
<template>
  <section class="wrap">
    <div v-if="!error && data?.nda.required && data.logo" class="brand"><span class="lg"><img :src="data.logo" :alt="data.company"></span></div>
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link is no longer active' : 'This link is not valid' }}</h1><p class="mut">Ask the company for a new link.</p></div>
    <template v-else-if="data && data.invite"><div class="brand"><span v-if="data.logo" class="lg"><img :src="data.logo" :alt="data.company"></span><div><p class="label">Data room</p><h1>{{ data.company }}</h1></div></div>
      <InviteGate :slug="data.invite.page" :company="data.company" what="room" @done="refresh()" /></template>
    <NdaGate v-else-if="data && data.nda.required" :company="data.company" :text="data.nda.text" kind="room" :ref-key="ref0" :org-key="data.nda.key" @signed="signed" />
    <template v-else-if="data">
      <div class="brand"><span v-if="data.logo" class="lg"><img :src="data.logo" :alt="data.company"></span><div><p class="label">Data room</p><h1>{{ data.company }}</h1></div></div>
      <form v-if="data.require_email && !entered" class="card gate" @submit.prevent="enter"><b>Enter your email to view</b><p class="mut">{{ data.company }} will see that you viewed their documents.</p><div class="row"><input v-model="email" type="email" required placeholder="you@fund.com"><button class="btn" type="submit">View documents</button></div><p v-if="msg" class="error">{{ msg }}</p></form>
      <template v-else>
        <p v-if="data.watermark" class="wmn">Documents are watermarked with your email and today's date, including downloads.</p>
        <p v-if="msg" class="error">{{ msg }}</p>
        <FinSummary :fin="(data as any).financials" />
        <div v-if="data.files.length || fos.some((f) => f.link)" class="dr"><nav class="side" aria-label="Folders"><button :class="{ on: folder === 'all' }" @click="folder = 'all'"><span>All documents</span><em>{{ data.files.length }}</em></button><button v-if="decks.length" :class="{ on: folder === 'deck' }" @click="folder = 'deck'"><span>Pitch deck</span><em>{{ decks.length }}</em></button>
          <button v-for="m in menu" :key="m.f.id" :class="['dp' + Math.min(m.depth, 3), { on: folder === m.f.id, sub: m.depth > 0 }]" :aria-expanded="m.kids ? (openSet[m.f.id] ?? pathTo(folder).some((x) => x.id === m.f.id)) : undefined" @click="pick(m.f)"><span><i v-if="m.kids" class="car">{{ (openSet[m.f.id] ?? pathTo(folder).some((x) => x.id === m.f.id)) ? '▾' : '▸' }}</i>{{ m.f.name }}</span><em v-if="!m.f.link">{{ countIn(m.f.id) }}</em><b v-else class="ext">Open ↗</b></button></nav><div class="main">
        <p v-if="folder !== 'all' && folder !== 'deck'" class="crumb"><template v-for="(x, i) in pathTo(folder)" :key="x.id"><span v-if="i" class="sl">/</span><button v-if="i < pathTo(folder).length - 1" class="cl" @click="folder = x.id">{{ x.name }}</button><b v-else>{{ x.name }}</b></template></p>
        <div v-if="subs.length" class="subs"><button v-for="k in subs" :key="k.id" class="card sfo" @click="pick(k)"><span class="fic" aria-hidden="true"><template v-if="k.link">↗</template><svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h6l2 2h10v10H3z" /></svg></span><b>{{ k.name }}</b><em>{{ k.link ? 'Opens outside the data room' : countIn(k.id) + (countIn(k.id) === 1 ? ' document' : ' documents') }}</em></button></div>
        <p v-if="folder !== 'all' && folder !== 'deck' && !subs.length && !sections.length" class="mut">This folder is empty.</p>
        <div v-for="g in paged" :key="g.id" class="grp"><h2 v-if="g.title">{{ g.title }}</h2>
          <div v-for="f in g.files" :key="f.id" class="card fi"><FileBadge :name="f.title" :mime="f.mime_type" size="lg" /><span class="ft"><b>{{ f.title }}</b><em>{{ size(f.size_bytes) }}</em></span>
            <button class="btn" @click="open(f)">{{ f.mime_type.includes('pdf') || f.mime_type.startsWith('image/') ? 'View' : 'Open' }}</button><button v-if="data.allow_download && (!data.watermark || f.mime_type.includes('pdf'))" class="btn secondary" @click="open(f, true)">Download</button></div></div>
        <div v-if="shown < total" ref="more" class="more"><button class="btn secondary" @click="shown += PAGE">Show more ({{ total - shown }} left)</button></div>
        </div></div><!-- /dr -->
        <EmptyState v-if="!data.files.length && !fos.some((f) => f.link)" compact icon="documents" title="No documents shared yet" />
      </template>
    </template>
    <div v-if="viewing" class="viewer" @contextmenu.prevent><div class="vh"><b>{{ viewing.title }}</b><button class="btn secondary" @click="close">Close</button></div>
      <div class="vb"><ClientOnly v-if="viewing.mime === 'application/pdf'"><DeckViewer :src="viewing.url" :mark="viewing.overlay" /></ClientOnly><img v-else-if="viewing.mime?.startsWith('image/')" :src="viewing.url" :alt="viewing.title" class="vimg"><div v-else class="vnone"><p>This file can't be previewed in the browser.</p><p v-if="data?.allow_download" class="mut">Use Download to open it.</p><p v-else class="mut">Ask {{ data?.company }} for a PDF copy.</p></div><div v-if="viewing.mark" class="wm" aria-hidden="true"><span v-for="n in 40" :key="n">{{ viewing.mark }}</span></div></div></div>
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
.dr { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 28px; align-items: start; margin-top: 8px; }
.side { position: sticky; top: 90px; display: flex; flex-direction: column; gap: 2px; border-right: 1px solid var(--c-rule); padding-right: 14px; }
.side button { display: flex; justify-content: space-between; align-items: center; gap: 8px; background: none; border: 0; padding: 9px 12px; font: inherit; font-size: 14px; text-align: left; cursor: pointer; color: var(--c-ink-soft); border-radius: 0; }
.side button:hover { background: var(--c-paper-2); } .side button.on { background: var(--c-signal-soft); color: var(--c-blue-deep); font-weight: 600; } .side em { font-style: normal; font-size: 12px; color: var(--c-muted); background: #fff; border: 1px solid var(--c-rule); padding: 0 7px; border-radius: 0; }
.main .grp:first-child h2 { margin-top: 0; }
.side button.sub { font-size: 13.5px; padding-top: 7px; padding-bottom: 7px; } .side .dp1 { padding-left: 26px; } .side .dp2 { padding-left: 40px; } .side .dp3 { padding-left: 54px; }
.car { font-style: normal; display: inline-block; width: 14px; color: var(--c-muted); font-size: 11px; } .ext { font-weight: 500; font-size: 12px; color: var(--c-blue-deep); white-space: nowrap; }
.more { display: flex; justify-content: center; padding: 16px 0 8px; }
.crumb { margin: 0 0 12px; font-size: 13.5px; color: var(--c-muted); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; } .crumb b { color: var(--c-ink); } .crumb .sl { color: var(--c-rule-strong); } .cl { border: 0; background: none; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.subs { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-bottom: 18px; } .sfo { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 0 10px; align-items: center; text-align: left; font: inherit; cursor: pointer; color: var(--c-ink); } .sfo:hover { border-color: var(--c-blue-deep); }
.sfo .fic { grid-row: span 2; width: 28px; height: 22px; background: var(--c-signal-soft); display: grid; place-items: center; font-size: 12px; color: var(--c-blue-deep); } .sfo b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .sfo em { font-style: normal; font-size: 12px; color: var(--c-muted); }
@media (max-width: 800px) { .dr { grid-template-columns: 1fr; gap: 12px; } .side { position: static; flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--c-rule); padding: 0 0 8px; } .side button { white-space: nowrap; } .side .dp1, .side .dp2, .side .dp3 { padding-left: 12px; } }
.brand { display: flex; align-items: center; gap: 16px; margin: 4px 0 18px; } .brand h1 { margin: 2px 0 0; } .lg { width: 64px; height: 64px; flex: none; border: 1px solid var(--c-rule); background: #fff; display: grid; place-items: center; padding: 6px; } .lg img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
