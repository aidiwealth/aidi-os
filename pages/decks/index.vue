<script setup lang="ts">
// Decks: every deck you share (seed deck, demo day deck, one-pager…), each with its own tracked link. Click one for its analytics.
useHead({ title: 'Decks' })
interface Dk { id: string; title: string; description: string | null; token: string; primary_deck: boolean; created_at: string; updated_at: string; versions: number; current: string | null; url: string; stats: { total: number; unique: number; avg_seconds: number; downloads: number; last_view: string | null } }
const { data, refresh } = await useFetch<{ decks: Dk[]; pdfs: { id: string; title: string; created_at: string }[] }>('/api/documents/decks')
const open = ref(false), busy = ref(false), msg = ref(''), copied = ref('')
const f = reactive({ title: '', description: '', source: 'upload' as 'upload' | 'doc', doc: '', primary: false, file: null as File | null })
function startNew() { Object.assign(f, { title: '', description: '', source: 'upload', doc: '', primary: !data.value?.decks.length, file: null }); msg.value = ''; open.value = true }
function onFile(ev: Event) { f.file = (ev.target as HTMLInputElement).files?.[0] ?? null; if (f.file && !f.title) f.title = f.file.name.replace(/\.pdf$/i, '') }
const ready = computed(() => (f.source === 'upload' ? !!f.file : !!f.doc))
async function create() {
  if (!ready.value) return
  busy.value = true; msg.value = ''
  const fd = new FormData()
  if (f.source === 'upload' && f.file) fd.append('file', f.file); else fd.append('document_id', f.doc)
  fd.append('title', f.title); fd.append('description', f.description); if (f.primary) fd.append('primary', '1')
  try { const r = await $fetch<{ id: string }>('/api/documents/decks', { method: 'POST', body: fd }); open.value = false; await refresh(); await navigateTo('/decks/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not create the deck.' }
  finally { busy.value = false }
}
async function copy(d: Dk) { await navigator.clipboard.writeText(d.url); copied.value = d.id; setTimeout(() => (copied.value = ''), 1500) }
const mmss = (s: number) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago' }
const totals = computed(() => (data.value?.decks ?? []).reduce((a, d) => ({ visits: a.visits + d.stats.total, unique: a.unique + d.stats.unique, downloads: a.downloads + d.stats.downloads }), { visits: 0, unique: 0, downloads: 0 }))
</script>
<template>
  <section v-if="data">
    <p class="label">Investors</p>
    <div class="head"><div><h1>Decks</h1><p class="lead">Keep a deck for each purpose — your main pitch deck, a demo day version, a one-pager. Each one has its own private link and viewer analytics. The ★ main deck is used on your investor page and in investor updates.</p></div>
      <button class="btn" @click="startNew">+ New deck</button></div>
    <EmptyState v-if="!data.decks.length" card icon="documents" title="No decks yet" text="Upload your pitch deck as a PDF. You get a private link with viewer analytics, and your investor page shows it automatically." />
    <template v-else>
      <div class="kpi"><div><span>Decks</span><b>{{ data.decks.length }}</b></div><div><span>Total visits</span><b>{{ totals.visits }}</b></div><div><span>Unique visitors</span><b>{{ totals.unique }}</b></div><div><span>Downloads</span><b>{{ totals.downloads }}</b></div></div>
      <div class="grid">
        <NuxtLink v-for="d in data.decks" :key="d.id" :to="'/decks/' + d.id" class="dk">
          <div class="dk-top"><span class="thumb" aria-hidden="true"><i /><i /><i /></span><span v-if="d.primary_deck" class="main">★ Main deck</span></div>
          <h3>{{ d.title }}</h3>
          <p class="desc">{{ d.description || d.current || 'PDF deck' }}</p>
          <div class="nums"><div><b>{{ d.stats.total }}</b><span>Visits</span></div><div><b>{{ d.stats.unique }}</b><span>Unique</span></div><div><b>{{ mmss(d.stats.avg_seconds) }}</b><span>Avg time</span></div><div><b>{{ d.stats.downloads }}</b><span>Downloads</span></div></div>
          <div class="foot"><span>{{ d.versions }} version{{ d.versions === 1 ? '' : 's' }} · {{ d.stats.last_view ? 'Last viewed ' + ago(d.stats.last_view) : 'Not viewed yet' }}</span>
            <button class="lk" @click.prevent.stop="copy(d)">{{ copied === d.id ? 'Copied' : 'Copy link' }}</button></div>
        </NuxtLink>
        <button class="dk add" @click="startNew"><span>+</span>New deck</button>
      </div>
    </template>
    <AppModal :open="open" title="New deck" @close="open = false">
      <div class="form">
        <label>Name<input v-model="f.title" maxlength="200" placeholder="e.g. Seed round deck"></label>
        <label>What it's for <em>optional</em><input v-model="f.description" maxlength="500" placeholder="e.g. Short version for demo day investors"></label>
        <div class="src"><button :class="{ on: f.source === 'upload' }" @click="f.source = 'upload'">Upload a PDF</button><button :class="{ on: f.source === 'doc' }" :disabled="!data.pdfs.length" @click="f.source = 'doc'">Use one from Documents</button></div>
        <label v-if="f.source === 'upload'" class="drop"><input type="file" accept=".pdf" hidden @change="onFile"><b>{{ f.file ? f.file.name : 'Choose a PDF' }}</b><span>{{ f.file ? Math.round(f.file.size / 1024) + ' KB' : 'Click to browse' }}</span></label>
        <select v-else v-model="f.doc"><option value="">Choose a PDF</option><option v-for="p in data.pdfs" :key="p.id" :value="p.id">{{ p.title }}</option></select>
        <label class="chk"><input v-model="f.primary" type="checkbox"> Make this my main deck</label>
        <p v-if="msg" class="error">{{ msg }}</p>
      </div>
      <template #foot><button class="btn secondary" @click="open = false">Cancel</button><button class="btn" :disabled="!ready || busy" @click="create">{{ busy ? 'Creating…' : 'Create deck' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 6px; } .head h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; max-width: 760px; }
.kpi { display: flex; gap: 36px; flex-wrap: wrap; margin: 20px 0; } .kpi span { display: block; font-size: 13px; color: var(--c-muted); } .kpi b { font-size: 28px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 16px; }
.dk { display: flex; flex-direction: column; gap: 8px; background: #fff; border: 1px solid var(--c-rule); padding: 18px; text-decoration: none; color: inherit; transition: border-color .15s, box-shadow .15s, transform .15s; text-align: left; font: inherit; }
.dk:hover { border-color: var(--c-blue-deep); box-shadow: 0 8px 24px rgba(12,26,46,.08); transform: translateY(-1px); }
.dk-top { display: flex; justify-content: space-between; align-items: flex-start; }
.thumb { width: 54px; height: 40px; background: var(--c-paper-2); border: 1px solid var(--c-rule); display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 8px; } .thumb i { display: block; height: 3px; background: var(--c-rule-strong); } .thumb i:first-child { width: 70%; background: var(--c-blue-deep); } .thumb i:last-child { width: 50%; }
.main { font-size: 12px; font-weight: 600; color: #b7791f; background: #fdf3e1; padding: 3px 8px; }
.dk h3 { margin: 4px 0 0; font-size: 18px; } .desc { margin: 0; color: var(--c-muted); font-size: 13.5px; min-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; border-top: 1px solid var(--c-rule); border-bottom: 1px solid var(--c-rule); padding: 12px 0; margin-top: 4px; } .nums b { display: block; font-size: 17px; font-variant-numeric: tabular-nums; } .nums span { font-size: 12px; color: var(--c-muted); }
.foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12.5px; color: var(--c-muted); }
.lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 13px; padding: 0; }
.add { align-items: center; justify-content: center; border-style: dashed; color: var(--c-muted); cursor: pointer; min-height: 200px; font-size: 15px; } .add span { font-size: 30px; line-height: 1; }
.form { display: flex; flex-direction: column; gap: 14px; } .form label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 500; } .form em { font-style: normal; color: var(--c-muted); font-weight: 400; font-size: 12.5px; }
.form input:not([type]), .form select { font: inherit; padding: 9px 10px; border: 1px solid var(--c-rule-strong); }
.src { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; width: fit-content; } .src button { background: none; border: 0; padding: 7px 12px; font: inherit; font-size: 13.5px; cursor: pointer; } .src .on { background: #fff; font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); } .src button:disabled { opacity: .45; cursor: default; }
.drop { border: 1.5px dashed var(--c-rule-strong); padding: 22px; align-items: center; cursor: pointer; text-align: center; } .drop:hover { border-color: var(--c-blue-deep); } .drop span { color: var(--c-muted); font-weight: 400; font-size: 13px; }
.form .chk { flex-direction: row; align-items: center; gap: 8px; font-weight: 400; } .error { color: var(--c-danger); margin: 0; }
</style>
