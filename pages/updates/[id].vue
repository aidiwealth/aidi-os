<script setup lang="ts">
// The update editor: 1. content (cover + blocks), 2. recipients, 3. preview & send.
definePageMeta({ fullBleed: true })
const id = useRoute().params.id as string
interface Bl { type: string; md?: string; title?: string; metrics?: string[]; period?: string; count?: number; left?: Bl; right?: Bl; media_id?: string; caption?: string; url?: string; name?: string }
interface R { lists: string[]; stages: string[]; contacts: string[]; emails: string[] }
interface D { kind?: string; update: { subject?: string | null; title: string; period_type: string; period_end: string; highlights: string | null; challenges: string | null; asks: string | null; blocks: Bl[]; cover_id: string | null; from_name: string | null; recipients: R; status: string; sent_at: string | null; sent_count: number; is_template: boolean }
  label: string; metrics: { key: string; label: string }[]; lists: { id: string; name: string; n: number }[]; stages: { id: string; name: string; n: number }[]; contacts: { id: string; name: string; email: string }[]
  sends: { investor_id: string; name: string; email: string; sent_at: string; opened_at: string | null; opens: number }[]; page: { slug: string; published: boolean } | null; from: string[]; me: string; company: string }
const { data, refresh } = await useFetch<D>('/api/updates/' + id)
useHead({ title: () => data.value?.update.title ?? 'Update' })
const step = ref(1)
const isVc = computed(() => !!data.value && data.value.kind !== 'company')
const { data: subs } = await useFetch<{ entities: { id: string; name: string; kind: string }[]; companies: { id: string; name: string }[] }>('/api/financials/subjects', { key: 'fin-subjects', immediate: true })
const f = reactive({ subject: null as string | null, title: '', blocks: [] as Bl[], cover_id: null as string | null, from_name: '', recipients: { lists: [], stages: [], contacts: [], emails: [] } as R, highlights: '', challenges: '', asks: '' })
const loaded = ref(false)
watch(data, (d) => { if (d && !loaded.value) { const u = d.update; Object.assign(f, { subject: u.subject ?? null, title: u.title, blocks: JSON.parse(JSON.stringify(u.blocks ?? [])), cover_id: u.cover_id, from_name: u.from_name || d.from[0] || '', recipients: Object.assign({ lists: [], stages: [], contacts: [], emails: [] }, u.recipients ?? {}) as R, highlights: u.highlights ?? '', challenges: u.challenges ?? '', asks: u.asks ?? '' }); loaded.value = true } }, { immediate: true })
const saveState = ref<'saved' | 'saving' | 'dirty'>('saved'); let timer: ReturnType<typeof setTimeout> | undefined
watch(() => JSON.stringify(f), () => { if (!loaded.value) return; saveState.value = 'dirty'; clearTimeout(timer); timer = setTimeout(save, 1200) })
const msg = ref(''); const ok = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function save() { saveState.value = 'saving'; try { await $fetch('/api/updates/' + id, { method: 'POST', body: f }); if (isVc.value) await renderCharts(); saveState.value = 'saved' } catch (e) { saveState.value = 'dirty'; msg.value = err(e) } }
// blocks
const adding = ref<number | null>(null)
const ADD = [['text', 'Text', 'Paragraphs, headings and bullets'], ['chart', 'Chart', 'A metric from your Financials'], ['two_charts', 'Two charts', 'Side by side'], ['metrics_table', 'Metrics table', 'Several metrics over time'], ['image', 'Image', 'Photo or graphic'], ['video', 'Video', 'Link to Loom, YouTube…'], ['file', 'File', 'Attach a PDF or document'], ['deck', 'Deck', 'Link to your deck']] as const
const { data: mainDeck } = await useFetch<{ url: string | null }>('/api/documents/decks/primary', { key: 'main-deck' })
function addBlock(type: string, at: number) { const b: Bl = type === 'text' ? { type, md: '' } : type === 'chart' ? { type, title: 'Revenue', metrics: ['revenue'], period: data.value?.update.period_type === 'quarter' ? 'quarter' : 'month', count: 6 } : type === 'two_charts' ? { type, left: { type: 'chart', title: 'Revenue', metrics: ['revenue'], period: 'month', count: 6 }, right: { type: 'chart', title: 'Cash', metrics: ['cash'], period: 'month', count: 6 } } : type === 'metrics_table' ? { type, title: 'Key metrics', metrics: ['revenue', 'gross_margin', 'net_income', 'cash'], period: 'month', count: 6 } : type === 'deck' ? { type, url: mainDeck.value?.url ?? '' } : { type }
  f.blocks.splice(at, 0, b); adding.value = null; if (['chart', 'two_charts', 'metrics_table'].includes(type)) { editing.value = at; side.value = type === 'two_charts' ? 'left' : 'main' } }
function move(i: number, d: number) { const j = i + d; if (j < 0 || j >= f.blocks.length) return; const a = f.blocks; [a[i], a[j]] = [a[j]!, a[i]!] }
const editing = ref<number | null>(null); const side = ref<'main' | 'left' | 'right'>('main')
const target = computed<Bl | null>(() => { if (editing.value === null) return null; const b = f.blocks[editing.value]; if (!b) return null; return b.type === 'two_charts' ? (side.value === 'right' ? (b.right ??= { type: 'chart' }) : (b.left ??= { type: 'chart' })) : b })
const previews = ref<Record<number, string>>({}); let ptimer: ReturnType<typeof setTimeout> | undefined
watch(() => JSON.stringify(f.blocks.map((b) => (['chart', 'two_charts', 'metrics_table'].includes(b.type) ? b : null))), () => { clearTimeout(ptimer); ptimer = setTimeout(renderCharts, 500) })
async function renderCharts() { for (const [i, b] of f.blocks.entries()) if (['chart', 'two_charts', 'metrics_table'].includes(b.type)) { try { const r = await $fetch<{ html: string }>('/api/updates/' + id + '/render', { method: 'POST', body: { blocks: [b] } }); previews.value[i] = r.html } catch { /* keep last */ } } }
onMounted(() => setTimeout(renderCharts, 300))
const uploading = ref(''); async function upload(ev: Event, apply: (r: { id: string; name: string }) => void) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; uploading.value = file.name; const fd = new FormData(); fd.append('file', file); try { apply(await $fetch<{ id: string; name: string }>('/api/updates/media', { method: 'POST', body: fd })) } catch (e) { msg.value = err(e) } finally { uploading.value = '' } }
const aiBusy = ref(false)
async function writeAi() { aiBusy.value = true; msg.value = ''; try { const r = await $fetch<{ title: string; body: string }>('/api/updates/' + id + '/generate', { method: 'POST', body: { highlights: f.highlights, challenges: f.challenges, asks: f.asks } }); f.blocks.splice(0, 0, { type: 'text', md: r.body }); ai.value = false; ok.value = 'Draft added at the top. Edit it before sending.' } catch (e) { msg.value = err(e) } finally { aiBusy.value = false } }
const ai = ref(false)
// recipients
const pick = ref(''); const typed = ref('')
const options = computed(() => [...(data.value?.lists ?? []).map((l) => ({ v: 'l:' + l.id, t: 'List · ' + l.name + ' (' + l.n + ')' })), ...(data.value?.stages ?? []).map((s) => ({ v: 's:' + s.id, t: 'Stage · ' + s.name + ' (' + s.n + ')' })), ...(data.value?.contacts ?? []).map((c) => ({ v: 'c:' + c.id, t: c.name + ' · ' + c.email }))])
watch(pick, (v) => { if (!v) return; const [k, x] = [v.slice(0, 1), v.slice(2)]; const r = f.recipients; const arr = k === 'l' ? r.lists : k === 's' ? r.stages : r.contacts; if (!arr.includes(x)) arr.push(x); nextTick(() => (pick.value = '')) })
function addTyped() { for (const e of typed.value.split(/[\s,;]+/)) { const x = e.trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) && !f.recipients.emails.includes(x)) f.recipients.emails.push(x) } typed.value = '' }
const chips = computed(() => [...f.recipients.lists.map((x) => ({ k: 'lists' as const, x, t: 'List · ' + (data.value?.lists.find((l) => l.id === x)?.name ?? '?') })), ...f.recipients.stages.map((x) => ({ k: 'stages' as const, x, t: 'Stage · ' + (data.value?.stages.find((s) => s.id === x)?.name ?? '?') })),
  ...f.recipients.contacts.map((x) => ({ k: 'contacts' as const, x, t: data.value?.contacts.find((c) => c.id === x)?.name ?? '?' })), ...f.recipients.emails.map((x) => ({ k: 'emails' as const, x, t: x }))])
function unchip(k: keyof R, x: string) { const a = f.recipients[k]; a.splice(a.indexOf(x), 1) }
const count = ref<{ count: number; sample: { email: string; name: string }[] } | null>(null)
watch(() => JSON.stringify(f.recipients), async () => { try { count.value = await $fetch('/api/updates/' + id + '/recipients', { method: 'POST', body: f.recipients }) } catch { count.value = null } }, { immediate: true })
// preview & send
const asName = ref(''); const emailHtml = ref(''); const pmode = ref(true)
const frame = ref<HTMLIFrameElement | null>(null); const frameH = ref(600)
function fit() { const d = frame.value?.contentDocument; if (d) { frameH.value = Math.max(400, d.documentElement.scrollHeight + 8); setTimeout(() => { const d2 = frame.value?.contentDocument; if (d2) frameH.value = Math.max(400, d2.documentElement.scrollHeight + 8) }, 400) } }
async function preview() { try { emailHtml.value = (await $fetch<{ html: string }>('/api/updates/' + id + '/render', { method: 'POST', body: { blocks: f.blocks, title: f.title, cover_id: f.cover_id, from_name: f.from_name, full: true, as_name: asName.value } })).html } catch (e) { msg.value = err(e) } }
watch([step, asName], () => { if (step.value === 3) preview() })
const sending = ref(''); const pubMenu = ref(false)
async function send(mode: string) { pubMenu.value = false; if (mode !== 'test' && mode !== 'publish' && !confirm('Send "' + f.title + '" to ' + (count.value?.count ?? 0) + ' people now?')) return; sending.value = mode; msg.value = ''; ok.value = ''
  try { await save(); const r = await $fetch<{ sent: number }>('/api/updates/' + id + '/send', { method: 'POST', body: { mode } }); ok.value = mode === 'test' ? 'Test sent to ' + data.value?.me + '.' : mode === 'publish' ? 'Published on your investor page.' : 'Sent to ' + r.sent + ' people.'; await refresh() } catch (e) { msg.value = err(e) } finally { sending.value = '' } }
const coverUrl = computed(() => (f.cover_id ? '/api/public/media/' + f.cover_id : ''))
const mlabel = (k: string) => data.value?.metrics.find((m) => m.key === k)?.label ?? k
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>
<template>
  <section v-if="data" class="ed">
    <aside class="steps"><NuxtLink to="/updates" class="back">← {{ isVc ? 'LP reports' : 'Updates' }}</NuxtLink><b class="h">{{ isVc ? 'LP report' : 'Investor update' }}</b>
      <button v-for="(s, i) in ['Update content', 'Recipients', 'Preview & send']" :key="s" :class="{ on: step === i + 1 }" @click="step = i + 1"><span>{{ i + 1 }}</span>{{ s }}</button>
      <div v-if="data.update.sent_at" class="sent"><b>Sent to {{ data.update.sent_count }}</b><span>{{ data.sends.filter((s) => s.opened_at).length }} opened</span></div></aside>
    <div class="main">
      <div class="top"><span class="crumb">{{ data.update.is_template ? 'Template' : data.label }} · {{ data.update.sent_at ? 'Sent' : data.update.status === 'published' ? 'Published' : 'Draft' }}</span><span class="sv">{{ saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Unsaved changes' }}</span>
        <button v-if="step < 3" class="btn secondary" @click="step++">Next →</button><template v-else><button class="btn secondary" :disabled="!!sending" @click="send('test')">{{ sending === 'test' ? 'Sending…' : 'Send a test' }}</button>
          <span class="pw"><button class="btn" :disabled="!!sending" @click="pubMenu = !pubMenu">{{ sending ? 'Working…' : 'Publish ▾' }}</button><span v-if="pubMenu" class="pm"><button @click="send('email')"><b>Send by email</b><em>To {{ count?.count ?? 0 }} recipients</em></button><button @click="send('email_publish')"><b>Send and publish</b><em>Email, and show on your investor page</em></button><button @click="send('publish')"><b>Publish only</b><em>Investor page, no email</em></button></span></span></template></div>
      <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>

      <div v-if="step === 1" class="doc">
        <div class="from"><span class="lg">{{ data.company.slice(0, 2).toUpperCase() }}</span><span>{{ f.from_name }}</span></div>
        <input v-model="f.title" class="title" maxlength="200" aria-label="Title">
        <label v-if="isVc" class="srcsel">Figures and charts from<select v-model="f.subject" @change="renderCharts"><option :value="null">Group (consolidated)</option><optgroup label="Funds and entities"><option v-for="e in subs?.entities ?? []" :key="e.id" :value="'entity:' + e.id">{{ e.name }}</option></optgroup><optgroup v-if="subs?.companies.length" label="Portfolio companies"><option v-for="c in subs.companies" :key="c.id" :value="'company:' + c.id">{{ c.name }}</option></optgroup></select></label>
        <div class="cover"><img v-if="coverUrl" :src="coverUrl" alt=""><DropZone compact accept=".png,.jpg,.jpeg,.gif,.webp" :label="uploading ? 'Uploading…' : coverUrl ? 'Drop a new cover image' : 'Add a cover image: drop it here'" hint="or click to choose" @change="upload($event, (r) => (f.cover_id = r.id))" /><button v-if="coverUrl" class="lk" @click="f.cover_id = null">Remove</button></div>
        <div class="aibar"><button class="lk" @click="ai = !ai">✨ Write with AI from your numbers</button></div>
        <div v-if="ai" class="card aib"><label class="label">Highlights<textarea v-model="f.highlights" rows="2" /></label><label class="label">Challenges<textarea v-model="f.challenges" rows="2" /></label><label class="label">How investors can help<textarea v-model="f.asks" rows="2" /></label><button class="btn" :disabled="aiBusy" @click="writeAi">{{ aiBusy ? 'Writing…' : 'Write it' }}</button></div>
        <template v-for="(b, i) in f.blocks" :key="i">
          <div class="ins"><button @click="adding = adding === i ? null : i">+</button><span v-if="adding === i" class="menu"><b>Add a block</b><button v-for="[t, l, d] in ADD" :key="t" @click="addBlock(t, i)"><span>{{ l }}</span><em>{{ d }}</em></button></span></div>
          <div class="blk" :class="b.type"><div class="tb"><button title="Move up" @click="move(i, -1)">↑</button><button title="Move down" @click="move(i, 1)">↓</button><button v-if="['chart', 'two_charts', 'metrics_table'].includes(b.type)" title="Edit chart" @click="editing = i; side = b.type === 'two_charts' ? 'left' : 'main'">⚙</button><button title="Remove" @click="f.blocks.splice(i, 1)">×</button></div>
            <ClientOnly v-if="b.type === 'text'"><RichEditor v-model="b.md" :min-height="120" placeholder="Write here, or type ## for a heading and - for a list…" /></ClientOnly>
            <div v-else-if="['chart', 'two_charts', 'metrics_table'].includes(b.type)" class="chartp" @click="editing = i; side = b.type === 'two_charts' ? 'left' : 'main'"><div v-if="previews[i]" v-html="previews[i]" /><p v-else class="mut">Loading chart…</p></div>
            <div v-else-if="b.type === 'image'" class="media"><img v-if="b.media_id" :src="'/api/public/media/' + b.media_id" alt=""><DropZone compact accept=".png,.jpg,.jpeg,.gif,.webp" :label="b.media_id ? 'Drop a new image' : 'Drop an image here'" hint="or click to choose" @change="upload($event, (r) => (b.media_id = r.id))" /><input v-model="b.caption" placeholder="Caption (optional)" maxlength="300"></div>
            <div v-else-if="b.type === 'file'" class="media"><span v-if="b.media_id">📎 {{ b.name }}</span><DropZone compact accept=".pdf,.xlsx,.docx,.pptx,.csv" :label="b.media_id ? 'Drop a new file' : 'Drop a file to attach'" hint="PDF, Excel, Word, PowerPoint or CSV" @change="upload($event, (r) => { b.media_id = r.id; b.name = r.name })" /></div>
            <div v-else class="media"><label class="label">{{ b.type === 'video' ? 'Video link (Loom, YouTube, Vimeo)' : 'Deck link (e.g. your Finvry data room link)' }}<input v-model="b.url" placeholder="https://" maxlength="500"></label><input v-model="b.title" :placeholder="b.type === 'video' ? 'Watch the video' : 'View our deck'" maxlength="200"></div></div>
        </template>
        <div class="ins end"><button @click="adding = adding === -1 ? null : -1">+ Add a block</button><span v-if="adding === -1" class="menu"><b>Add a block</b><button v-for="[t, l, d] in ADD" :key="t" @click="addBlock(t, f.blocks.length)"><span>{{ l }}</span><em>{{ d }}</em></button></span></div>
      </div>

      <div v-else-if="step === 2" class="card rec">
        <h2>Add recipients to your update</h2><p class="mut">Choose a contact list or pipeline stage, search for a contact, or type in email addresses. Unsubscribed contacts are left out.</p>
        <select v-model="pick"><option value="">Select a list, stage or contact…</option><option v-for="o in options" :key="o.v" :value="o.v">{{ o.t }}</option></select>
        <div class="ty"><input v-model="typed" placeholder="Type emails, separated by commas" @keydown.enter.prevent="addTyped"><button class="btn secondary" @click="addTyped">Add</button></div>
        <div class="chips"><span v-for="c in chips" :key="c.k + c.x" class="chip" :class="c.k">{{ c.t }}<button aria-label="Remove" @click="unchip(c.k, c.x)">×</button></span></div>
        <p class="cnt"><b>{{ count?.count ?? 0 }}</b> people will receive this update<span v-if="count?.sample.length" class="mut"> · {{ count.sample.map((s) => s.email).join(', ') }}{{ count.count > count.sample.length ? '…' : '' }}</span></p>
        <NuxtLink to="/contacts" class="lk">Manage contacts and lists →</NuxtLink>
      </div>

      <div v-else class="pv">
        <div class="card hdr"><div class="r"><span>Subject:</span><input v-model="f.title" maxlength="200"></div><div class="r"><span>From:</span><select v-model="f.from_name"><option v-for="o in data.from" :key="o">{{ o }}</option></select></div></div>
        <div class="pvbar"><label class="cb"><input v-model="pmode" type="checkbox"> Email preview</label><label class="va">View as<select v-model="asName"><option value="">A recipient</option><option v-for="c in data.contacts.slice(0, 200)" :key="c.id" :value="c.name">{{ c.name }}</option></select></label></div>
        <p class="note">This is how the email will look. It may appear slightly differently across email apps, so send yourself a test.</p>
        <iframe v-if="pmode" ref="frame" :srcdoc="emailHtml" title="Email preview" class="frame" scrolling="no" :style="{ height: frameH + 'px' }" @load="fit" />
        <UpdateReactions :update-id="id" />
        <div v-if="data.sends.length" class="card opens"><h3>Opens ({{ data.sends.filter((s) => s.opened_at).length }} of {{ data.sends.length }})</h3><div v-for="s in data.sends" :key="s.investor_id" class="li"><span>{{ s.name }} <em>{{ s.email }}</em></span><b :class="{ okk: s.opened_at }">{{ s.opened_at ? 'Opened ' + when(s.opened_at) + (s.opens > 1 ? ' · ' + s.opens + '×' : '') : 'Not opened' }}</b></div></div>
      </div>
    </div>

    <div v-if="target" class="drawer"><div class="dh"><b>Edit chart</b><button class="btn" @click="editing = null">Done</button></div>
      <div v-if="editing !== null && f.blocks[editing]?.type === 'two_charts'" class="seg"><button :class="{ on: side === 'left' }" @click="side = 'left'">Left chart</button><button :class="{ on: side === 'right' }" @click="side = 'right'">Right chart</button></div>
      <label class="label">Title<input v-model="target.title" maxlength="200"></label>
      <div><span class="lb">Metrics (up to {{ f.blocks[editing!]?.type === 'metrics_table' ? 6 : 3 }})</span><div class="ml"><label v-for="m in data.metrics" :key="m.key" class="cb"><input v-model="target.metrics" type="checkbox" :value="m.key" :disabled="!(target.metrics ?? []).includes(m.key) && (target.metrics ?? []).length >= (f.blocks[editing!]?.type === 'metrics_table' ? 6 : 3)"> {{ m.label }}</label></div></div>
      <label class="label">Show<select v-model="target.period"><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></label>
      <label class="label">How many periods<select v-model.number="target.count"><option v-for="n in [3, 4, 6, 8, 12, 24]" :key="n" :value="n">Last {{ n }}</option></select></label>
      <p class="mut">Figures come from Financials: {{ (target.metrics ?? []).map(mlabel).join(', ') || 'choose a metric' }}.</p></div>
  </section>
</template>
<style scoped>
.ed { display: grid; grid-template-columns: 240px 1fr; gap: 0; min-height: calc(var(--vh100) - var(--topbar-h, 60px)); align-items: stretch; } .steps { position: sticky; top: var(--topbar-h, 60px); height: calc(var(--vh100) - var(--topbar-h, 60px)); overflow-y: auto; padding-top: 22px !important; align-self: start; } .steps { padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; background: var(--c-paper-2); border-right: 1px solid var(--c-rule); box-sizing: border-box; } .main { padding: 8px 32px 72px !important; max-width: 1180px; }
.back { font-size: 13px; color: var(--c-muted); padding: 0 8px 8px; } .h { font-size: 17px; padding: 0 8px 10px; } .steps button { display: flex; gap: 10px; align-items: center; background: none; border: 0; padding: 10px 8px; font: inherit; font-size: 14.5px; text-align: left; cursor: pointer; color: var(--c-ink-soft); }
.steps button span { width: 22px; height: 22px; border: 1px solid var(--c-rule-strong); display: grid; place-items: center; font-size: 12px; } .steps button.on { background: #e6e4dd; color: var(--c-ink); font-weight: 500; } .steps button.on span { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.sent { margin-top: 16px; padding: 10px 8px; border-top: 1px solid var(--c-rule); display: flex; flex-direction: column; font-size: 13px; } .sent span { color: var(--c-muted); }
.main { padding: 0 24px 40px; min-width: 0; } .top { display: flex; gap: 10px; align-items: center; justify-content: flex-end; padding: 10px 0 14px; border-bottom: 1px solid var(--c-rule); margin-bottom: 18px; position: sticky; top: var(--topbar-h, 60px); background: var(--c-paper, #fbfaf7); z-index: 10; }
.crumb { margin-right: auto; color: var(--c-muted); font-size: 14px; } .sv { font-size: 13px; color: var(--c-muted); } .pw { position: relative; } .pm { position: absolute; right: 0; top: 40px; background: #fff; border: 1px solid var(--c-rule); box-shadow: var(--shadow-pop); width: 280px; z-index: 30; display: flex; flex-direction: column; padding: 6px; }
.pm button { background: none; border: 0; padding: 10px; text-align: left; font: inherit; cursor: pointer; display: flex; flex-direction: column; } .pm button:hover { background: var(--c-paper-2); } .pm em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.doc { max-width: 760px; margin: 0 auto; } .from { display: flex; gap: 10px; align-items: center; color: var(--c-muted); font-size: 14px; margin-bottom: 10px; } .lg { width: 38px; height: 38px; background: var(--c-navy); color: #fff; display: grid; place-items: center; font-size: 13px; font-weight: 600; }
.title { width: 100%; font-family: var(--font-heading); font-size: 40px; font-weight: 600; border: 0; background: transparent; color: var(--c-navy); padding: 4px 0; margin-bottom: 10px; } .title:focus { outline: none; border-bottom: 1px dashed var(--c-rule-strong); }
.cover { margin-bottom: 14px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; } .cover img { width: 100%; display: block; } .cv { position: relative; overflow: hidden; color: var(--c-blue-deep); cursor: pointer; font-size: 14px; } .cv input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.aibar { margin: 4px 0 8px; } .aib { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; }
.ins { position: relative; height: 22px; display: flex; align-items: center; } .ins > button { background: none; border: 1px dashed transparent; color: var(--c-muted); cursor: pointer; font-size: 16px; padding: 0 6px; opacity: .3; } .ins:hover > button { opacity: 1; border-color: var(--c-rule-strong); } .ins.end > button { opacity: 1; font-size: 14px; padding: 8px 12px; border-color: var(--c-rule-strong); margin-top: 10px; }
.ins.end { height: auto; } .menu { position: absolute; left: 0; top: 26px; z-index: 40; background: #fff; border: 1px solid var(--c-rule); box-shadow: var(--shadow-pop); width: 300px; padding: 8px; display: flex; flex-direction: column; } .ins.end .menu { top: 52px; }
.menu b { font-size: 12.5px; color: var(--c-muted); font-weight: 500; padding: 4px 8px; } .menu button { background: none; border: 1px solid var(--c-rule); margin: 3px 0; padding: 9px 10px; text-align: left; font: inherit; cursor: pointer; display: flex; justify-content: space-between; gap: 8px; } .menu button:hover { border-color: var(--c-navy); } .menu em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.blk { position: relative; border: 1px solid transparent; padding: 4px; } .blk:hover { border-color: var(--c-rule); } .tb { position: absolute; right: 6px; top: -14px; display: none; background: #fff; border: 1px solid var(--c-rule); z-index: 5; } .blk:hover .tb { display: flex; } .tb button { background: none; border: 0; padding: 4px 8px; cursor: pointer; font-size: 13px; }
.txt { width: 100%; box-sizing: border-box; border: 0; resize: vertical; font: inherit; font-size: 16px; line-height: 1.65; background: transparent; padding: 6px 2px; } .txt:focus { outline: none; background: #fff; }
.chartp { cursor: pointer; } .media { display: flex; flex-direction: column; gap: 8px; padding: 10px; background: #fff; border: 1px dashed var(--c-rule-strong); } .media img { max-width: 100%; }
.rec { max-width: 760px; display: flex; flex-direction: column; gap: 12px; } .rec h2 { margin: 0; } .ty { display: flex; gap: 8px; } .ty input { flex: 1; } .chips { display: flex; gap: 6px; flex-wrap: wrap; } .chip { display: inline-flex; gap: 6px; align-items: center; background: var(--c-paper-2); padding: 5px 4px 5px 10px; font-size: 13px; } .chip.lists, .chip.stages { background: var(--c-signal-soft); color: var(--c-blue-deep); }
.chip button { background: none; border: 0; cursor: pointer; font-size: 16px; color: inherit; padding: 0 4px; } .cnt { font-size: 15px; margin: 4px 0; }
.pv { max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; } .hdr { padding: 0; } .hdr .r { display: flex; gap: 12px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--c-rule); } .hdr .r:last-child { border-bottom: 0; } .hdr span { width: 70px; color: var(--c-muted); font-size: 14px; } .hdr input, .hdr select { flex: 1; }
.pvbar { display: flex; justify-content: space-between; align-items: center; } .va { display: flex; gap: 8px; align-items: center; font-size: 14px; color: var(--c-muted); } .note { background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 10px 14px; font-size: 13.5px; margin: 0; } .frame { width: 100%; border: 1px solid var(--c-rule); background: #f4f3ef; display: block; }
.opens h3 { margin: 0 0 8px; } .li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .li em { font-style: normal; color: var(--c-muted); } .li b { font-weight: 400; color: var(--c-muted); } .okk { color: var(--c-ok) !important; }
.drawer { position: fixed; right: 0; top: 0; bottom: 0; width: 380px; background: #fff; border-left: 1px solid var(--c-rule); box-shadow: -10px 0 30px rgba(12,26,46,.08); z-index: 900; padding: 18px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; } .dh { display: flex; justify-content: space-between; align-items: center; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { flex: 1; background: #fff; border: 0; padding: 8px; font: inherit; cursor: pointer; } .seg .on { background: var(--c-navy); color: #fff; } .ml { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; } .lb { font-size: 13px; color: var(--c-ink-soft); }
label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } input, select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); } .cb { display: flex; gap: 6px; align-items: center; font-size: 13.5px; } .cb input { width: auto; }
.mut { color: var(--c-muted); font-size: 13px; margin: 0; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1000px) { .ed { grid-template-columns: 1fr; } .steps { flex-direction: row; overflow-x: auto; } .drawer { width: 100%; } }
.srcsel { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--c-muted); margin: 0 0 12px; } .srcsel select { font: inherit; font-size: 13.5px; padding: 6px 9px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
</style>
