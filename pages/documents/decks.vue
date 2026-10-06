<script setup lang="ts">
// Decks: upload or pick a PDF, share a tracked link, see who viewed what.
useHead({ title: 'Decks' })
interface Dk { id: string; title: string; token: string; primary_deck: boolean; created_at: string; versions: number; current: string | null; url: string; stats: { total: number; unique: number; avg_seconds: number; downloads: number } }
const { data, refresh } = await useFetch<{ decks: Dk[]; pdfs: { id: string; title: string; created_at: string }[] }>('/api/documents/decks')
const sel = ref<string | null>(null)
interface Det { deck: { id: string; title: string; token: string; primary_deck: boolean; require_email: boolean; allow_download: boolean; created_at: string; url: string }; versions: { id: string; filename: string | null; pages: number | null; created_at: string }[]; visits: { id: string; email: string | null; name: string | null; visitor_key: string | null; started_at: string; last_at: string; seconds: number; slides: Record<string, number>; pages: number | null; downloads: number }[]; stats: { total: number; unique: number; avg_seconds: number; avg_per_slide: number; downloads: number; slides: Record<string, { seconds: number; views: number }> } }
const det = ref<Det | null>(null); const tab = ref<'visitors' | 'slides'>('visitors')
watchEffect(() => { if (!sel.value && data.value?.decks.length) sel.value = data.value.decks[0]!.id })
watch(sel, async (id) => { det.value = id ? await $fetch<Det>('/api/documents/decks/' + id) : null }, { immediate: true })
const mmss = (s: number) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago' }
const pagesOf = computed(() => det.value?.versions[0]?.pages ?? Math.max(0, ...(det.value?.visits.map((v) => v.pages ?? 0) ?? [0])))
const msg = ref(''); const busy = ref(false); const copied = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not upload.'
async function upload(ev: Event, deckId?: string) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; busy.value = true; msg.value = ''; const fd = new FormData(); fd.append('file', file); if (deckId) fd.append('deck_id', deckId); try { const r = await $fetch<{ id: string }>('/api/documents/decks', { method: 'POST', body: fd }); await refresh(); sel.value = r.id; det.value = await $fetch<Det>('/api/documents/decks/' + r.id) } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function fromDoc(id: string) { const fd = new FormData(); fd.append('document_id', id); try { const r = await $fetch<{ id: string }>('/api/documents/decks', { method: 'POST', body: fd }); await refresh(); sel.value = r.id } catch (e) { msg.value = err(e) } }
async function patch(body: Record<string, unknown>) { await $fetch('/api/documents/decks/' + sel.value, { method: 'POST', body }); await refresh(); det.value = await $fetch<Det>('/api/documents/decks/' + sel.value) }
async function copy() { if (det.value) { await navigator.clipboard.writeText(det.value.deck.url); copied.value = true; setTimeout(() => (copied.value = false), 1500) } }
const pick = ref('')
async function newLink() { if (confirm('Make a new link? The old link stops working.')) await patch({ new_link: true }) }
async function archive() { if (confirm('Archive this deck? Its link stops working.')) { await patch({ archive: true }); sel.value = null } }
</script>
<template>
  <section v-if="data">
    <NuxtLink to="/documents" class="back">← Documents</NuxtLink>
    <div class="head"><div><h1>Decks</h1><p class="lead">Share your deck with a private link and see who opened it, how long they spent and which slides they read. Your main deck is used on your investor page and in investor updates.</p></div>
      <label class="btn">{{ busy ? 'Uploading…' : '+ New deck' }}<input type="file" accept=".pdf" hidden @change="upload($event)"></label></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div v-if="data.pdfs.length && !data.decks.length" class="card from"><b>Use a PDF already in Documents</b><div class="row"><select v-model="pick"><option value="">Choose a PDF</option><option v-for="p in data.pdfs" :key="p.id" :value="p.id">{{ p.title }}</option></select><button class="btn secondary" :disabled="!pick" @click="fromDoc(pick)">Make it a deck</button></div></div>
    <EmptyState v-if="!data.decks.length" card icon="documents" title="No decks yet" text="Upload your pitch deck as a PDF. You get a private link with viewer analytics, and your investor page shows it automatically." />
    <template v-else>
      <nav class="dtabs"><button v-for="d in data.decks" :key="d.id" :class="{ on: sel === d.id }" @click="sel = d.id">{{ d.primary_deck ? '★ ' : '' }}{{ d.title }}</button></nav>
      <div v-if="det" class="dd">
        <div class="dtop"><div><h2>{{ det.deck.title }}</h2><span class="mut">Created {{ ago(det.deck.created_at) }}</span></div>
          <div class="acts"><button class="star" :class="{ on: det.deck.primary_deck }" :title="det.deck.primary_deck ? 'Main deck' : 'Make this the main deck'" @click="patch({ primary: true })">★</button><button class="btn secondary" @click="copy">{{ copied ? 'Copied' : 'Copy link' }}</button>
            <label class="btn">+ New version<input type="file" accept=".pdf" hidden @change="upload($event, det.deck.id)"></label></div></div>
        <div class="kpi"><div><span>Total visits</span><b>{{ det.stats.total }}</b></div><div><span>Unique visits</span><b>{{ det.stats.unique }}</b></div><div><span>Avg total time</span><b>{{ mmss(det.stats.avg_seconds) }}</b></div><div><span>Avg time per slide</span><b>{{ mmss(det.stats.avg_per_slide) }}</b></div><div><span>Downloads</span><b>{{ det.stats.downloads }}</b></div></div>
        <div class="cols"><div>
          <nav class="tb"><button :class="{ on: tab === 'visitors' }" @click="tab = 'visitors'">Visitor analytics</button><button :class="{ on: tab === 'slides' }" @click="tab = 'slides'">Per slide analytics</button></nav>
          <table v-if="tab === 'visitors'" class="vt"><thead><tr><th>Visits</th><th class="n">Time spent</th><th class="n">Viewed slides</th><th class="n">Slide engagement</th></tr></thead><tbody>
            <tr v-for="v in det.visits" :key="v.id"><td><span class="av">{{ (v.name || v.email || '?').slice(0, 2).toUpperCase() }}</span><div class="who"><b>{{ v.name || v.email || 'Anonymous viewer' }}</b><span v-if="v.name && v.email">{{ v.email }}</span><em>Viewed {{ ago(v.last_at) }}<template v-if="v.downloads"> · ⤓ {{ v.downloads }}</template></em></div></td>
              <td class="n">{{ mmss(v.seconds) }}</td><td class="n">{{ Object.keys(v.slides).length }} / {{ v.pages ?? pagesOf ?? '?' }}</td><td class="n">{{ mmss(Object.keys(v.slides).length ? Math.round(v.seconds / Object.keys(v.slides).length) : 0) }}</td></tr>
            <tr v-if="!det.visits.length"><td colspan="4" class="mut">No visits yet. Copy the link and share it.</td></tr></tbody></table>
          <div v-else class="sl"><div v-for="n in pagesOf" :key="n" class="slr"><span>Slide {{ n }}</span><div class="bar"><i :style="{ width: (det.stats.slides[n] ? Math.min(100, (det.stats.slides[n].seconds / Math.max(1, ...Object.values(det.stats.slides).map((x) => x.seconds))) * 100) : 0) + '%' }" /></div><em>{{ det.stats.slides[n] ? mmss(Math.round(det.stats.slides[n].seconds / det.stats.slides[n].views)) + ' avg · ' + det.stats.slides[n].views + ' views' : 'not viewed' }}</em></div><p v-if="!pagesOf" class="mut">Slide numbers appear after the first visit.</p></div>
        </div>
        <aside><div class="card"><b>Upload history</b><div v-for="(v, i) in det.versions" :key="v.id" class="ver"><span>{{ v.filename }}</span><em>{{ ago(v.created_at) }}<template v-if="v.pages"> · {{ v.pages }} slides</template></em><span v-if="i === 0" class="cur">Current version</span></div></div>
          <div class="card set"><b>Link settings</b><label><input type="checkbox" :checked="det.deck.require_email" @change="patch({ require_email: ($event.target as HTMLInputElement).checked })"> Ask viewers for their email</label><label><input type="checkbox" :checked="det.deck.allow_download" @change="patch({ allow_download: ($event.target as HTMLInputElement).checked })"> Allow download</label>
            <button class="lk" @click="newLink">Make a new link</button><button class="lk red" @click="archive">Archive deck</button></div></aside></div>
      </div>
    </template>
  </section>
</template>
<style scoped>
.back { color: var(--c-muted); text-decoration: none; font-size: 13.5px; } .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 6px; } .head h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; max-width: 760px; } label.btn { cursor: pointer; }
.from { margin: 14px 0; display: flex; flex-direction: column; gap: 8px; } .row { display: flex; gap: 8px; } select { font: inherit; padding: 8px; border: 1px solid var(--c-rule-strong); }
.dtabs { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; margin: 16px 0; width: fit-content; max-width: 100%; overflow-x: auto; } .dtabs button { background: none; border: 0; padding: 8px 14px; font: inherit; font-size: 14px; cursor: pointer; white-space: nowrap; } .dtabs .on { background: #fff; font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); }
.dtop { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; } .dtop h2 { margin: 0; } .mut { color: var(--c-muted); font-size: 13px; } .acts { display: flex; gap: 8px; align-items: center; } .star { background: none; border: 0; font-size: 22px; color: var(--c-rule-strong); cursor: pointer; } .star.on { color: #f0a020; }
.kpi { display: flex; gap: 36px; flex-wrap: wrap; margin: 18px 0; } .kpi span { display: block; font-size: 13px; color: var(--c-muted); } .kpi b { font-size: 32px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; } .tb { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin-bottom: 8px; } .tb button { background: none; border: 0; padding: 10px 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; border-bottom: 2px solid transparent; } .tb .on { border-bottom-color: var(--c-blue-deep); }
.vt { width: 100%; border-collapse: collapse; font-size: 14px; } .vt th { text-align: left; font-weight: 500; color: var(--c-muted); padding: 10px 8px; border-bottom: 1px solid var(--c-rule); } .vt td { padding: 12px 8px; border-bottom: 1px solid var(--c-rule); vertical-align: middle; } .vt td:first-child { display: flex; gap: 12px; align-items: center; } .n { text-align: right; font-variant-numeric: tabular-nums; }
.av { width: 38px; height: 38px; border-radius: 50%; background: #efeafc; color: #5b3fc4; display: grid; place-items: center; font-size: 13px; font-weight: 600; flex: none; } .who { display: flex; flex-direction: column; } .who span { color: var(--c-ink-soft); font-size: 13px; } .who em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.sl { display: flex; flex-direction: column; gap: 8px; } .slr { display: grid; grid-template-columns: 70px 1fr 160px; gap: 10px; align-items: center; font-size: 13px; } .bar { height: 10px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-blue-deep); } .slr em { font-style: normal; color: var(--c-muted); }
aside { display: flex; flex-direction: column; gap: 12px; } aside .card { display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; } .ver { display: flex; flex-direction: column; border-left: 2px solid var(--c-rule); padding-left: 10px; } .ver em { font-style: normal; color: var(--c-muted); font-size: 12.5px; } .cur { color: var(--c-ok); font-size: 12px; font-weight: 600; }
.set label { display: flex; gap: 8px; align-items: center; } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 13px; text-align: left; padding: 0; } .lk.red { color: var(--c-danger); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
</style>
