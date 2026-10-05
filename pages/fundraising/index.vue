<script setup lang="ts">
// Fundraising: your data room and tracked links, the round and its investors, AI deal memos and SAFEs.
useHead({ title: 'Fundraising' })
interface F { id: string; title: string; folder: string; is_deck: boolean; size_bytes: number; mime_type: string }
interface L { id: string; slug: string | null; name: string; file_ids: string[]; require_email: boolean; allow_download: boolean; expires: string | null; revoked: boolean; views: number; last_viewed_at: string | null; seconds: number; viewers: number }
interface R { id: string; name: string; instrument: string; currency: string; target: number | null; valuation_cap: number | null; discount: number | null; pre_money: number | null; status: string; target_close: string | null }
interface I { id: string; name: string; firm: string | null; email: string | null; stage: string; amount: number | null; notes: string | null }
interface PL { id: string; name: string; currency: string; target: number | null; instrument: string; valuation_cap: number | null; discount: number | null; status: string; target_close: string | null; committed: number; closed: number; in_play: number }
interface ND { id: string; scope: string; name: string; email: string; company: string | null; signature: string; nda_text: string; signed_at: string }
interface D { handle: string | null; ndas: ND[]; company: string; currency: string; state: string; files: F[]; links: L[]; activity: { viewer_email: string | null; seconds: number; started_at: string; link: string; file: string | null }[]; pipelines: PL[]; memos: { id: string; title: string; updated_at: string }[]; safes: { id: string; investor_name: string; amount: number; currency: string; valuation_cap: number | null; discount: number | null; safe_date: string }[]; base: string }
const { data, refresh } = await useFetch<D>('/api/fundraising')
const route = useRoute(); const router = useRouter()
const TABS = [['overview', 'Overview'], ['round', 'Pipelines'], ['room', 'Data room'], ['memo', 'Deal memo'], ['safe', 'SAFEs'], ['nda', 'NDAs']] as const
const ndaView = ref<ND | null>(null)
const shortUrl = (l: { slug: string | null }) => (l.slug && data.value?.handle ? 'app.finvry.com/' + data.value.handle + '/' + l.slug : '')
const main = computed(() => data.value?.pipelines.find((p) => p.status === 'open') ?? data.value?.pipelines[0] ?? null)
const tab = computed(() => (TABS.find(([k]) => k === route.query.t)?.[0] ?? 'overview'))
const go = (t: string) => router.replace({ query: { t } })
const SYM: Record<string, string> = { USD: '$', NGN: '₦' }
const cur = computed(() => main.value?.currency ?? data.value?.currency ?? 'USD')
const money = (v: number | null | undefined, c = cur.value) => (v == null ? '—' : (SYM[c] ?? '') + Math.round(v).toLocaleString('en-US'))
const STAGES = [['contacted', 'Contacted'], ['meeting', 'Meeting'], ['diligence', 'Diligence'], ['committed', 'Committed'], ['signed', 'Signed'], ['wired', 'Wired'], ['passed', 'Passed']] as const
const committed = computed(() => main.value?.committed ?? 0); const closed = computed(() => main.value?.closed ?? 0)
const pct = (v: number, tg = main.value?.target) => (tg ? Math.min(100, Math.round((v / tg) * 100)) : 0)
const mins = (s: number) => (s < 60 ? s + 's' : Math.round(s / 60) + ' min')
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const msg = ref(''); const ok = ref(''); const busy = ref(false)

// data room: upload
const up = reactive({ open: false, folder: 'General', is_deck: false })
async function upload(ev: Event) { const files = Array.from((ev.target as HTMLInputElement).files ?? []); busy.value = true; msg.value = ''
  for (const f of files) { const fd = new FormData(); fd.append('file', f); fd.append('folder', up.folder); fd.append('is_deck', String(up.is_deck && files.length === 1)); try { await $fetch('/api/fundraising/files', { method: 'POST', body: fd }) } catch (e) { msg.value = f.name + ': ' + err(e) } }
  busy.value = false; up.open = false; await refresh() }
const folders = computed(() => { const m = new Map<string, F[]>(); for (const f of data.value?.files ?? []) m.set(f.is_deck ? 'Pitch deck' : f.folder, [...(m.get(f.is_deck ? 'Pitch deck' : f.folder) ?? []), f]); return [...m.entries()] })
// links
const lk = reactive({ open: false, id: '', name: '', slug: '', short: '', all: true, file_ids: [] as string[], require_email: true, allow_download: false, days: 30, url: '' })
function newLink() { Object.assign(lk, { open: true, id: '', name: '', slug: '', short: '', all: true, file_ids: [], require_email: true, allow_download: false, days: 30, url: '' }) }
async function saveLink() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ url?: string; short?: string | null }>('/api/fundraising/links', { method: 'POST', body: { id: lk.id || undefined, name: lk.name, slug: lk.slug, file_ids: lk.all ? [] : lk.file_ids, require_email: lk.require_email, allow_download: lk.allow_download, days: lk.days } }); lk.url = r.short || r.url || ''; lk.short = r.short ?? ''; if (!r.url) lk.open = false; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function revoke(l: L, revoked: boolean) { try { await $fetch('/api/fundraising/links', { method: 'POST', body: { id: l.id, name: l.name, file_ids: l.file_ids, require_email: l.require_email, allow_download: l.allow_download, days: 0, revoked } }); await refresh() } catch (e) { msg.value = err(e) } }
const copied = ref(''); async function copy(u: string) { await navigator.clipboard.writeText(u); copied.value = u; setTimeout(() => (copied.value = ''), 1500) }
// round
const rd = reactive({ open: false, id: '', name: 'Pre-seed', instrument: 'safe', currency: 'USD', target: '' as string | number, valuation_cap: '' as string | number, discount: '' as string | number, pre_money: '' as string | number, status: 'open', target_close: '' })
function editRound() { const r = null as R | null; Object.assign(rd, r ? { open: true, id: r.id, name: r.name, instrument: r.instrument, currency: r.currency, target: r.target ?? '', valuation_cap: r.valuation_cap ?? '', discount: r.discount ?? '', pre_money: r.pre_money ?? '', status: r.status, target_close: r.target_close ?? '' } : { open: true, id: '', currency: data.value?.currency ?? 'USD' }) }
async function saveRound() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/crm/pipelines', { method: 'POST', body: { ...rd, id: rd.id || undefined } }); rd.open = false; await navigateTo('/fundraising/pipelines/' + r.id) } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const inv = reactive({ open: false, id: '', name: '', firm: '', email: '', stage: 'contacted', amount: '' as string | number, notes: '' })
function editInv(i?: I) { Object.assign(inv, i ? { open: true, id: i.id, name: i.name, firm: i.firm ?? '', email: i.email ?? '', stage: i.stage, amount: i.amount ?? '', notes: i.notes ?? '' } : { open: true, id: '', name: '', firm: '', email: '', stage: 'contacted', amount: '', notes: '' }) }
async function saveInv() { busy.value = true; msg.value = ''; try { inv.open = false } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function moveStage(i: I, stage: string) { void i; void stage }
// memo
async function newMemo() { try { const r = await $fetch<{ id: string }>('/api/fundraising/memo', { method: 'POST', body: { title: (data.value?.company ?? 'Company') + ': investment memo' } }); await navigateTo('/fundraising/memo/' + r.id) } catch (e) { msg.value = err(e) } }
// SAFE flow
const sf = reactive({ open: false, step: 1, investor_name: '', investor_email: '', amount: '' as string | number, currency: 'USD', valuation_cap: '' as string | number, discount: '' as string | number, mfn: false, pro_rata: false, company_name: '', company_state: 'Delaware', signatory_name: '', signatory_title: 'Chief Executive Officer', safe_date: new Date().toISOString().slice(0, 10) })
function newSafe(i?: I) { Object.assign(sf, { open: true, step: 1, investor_name: i?.name ?? '', investor_email: i?.email ?? '', amount: i?.amount ?? '', currency: cur.value, valuation_cap: main.value?.valuation_cap ?? '', discount: main.value?.discount ?? '', mfn: false, pro_rata: false, company_name: data.value?.company ?? '', company_state: data.value?.state && data.value.state !== 'Other US state' ? data.value.state : 'Delaware' }) }
function safeFromInv() { const i = undefined as I | undefined; inv.open = false; newSafe(i) }
async function saveSafe() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/fundraising/safes', { method: 'POST', body: { ...sf } }); sf.open = false; await navigateTo('/fundraising/safe/' + r.id) } catch (e) { msg.value = err(e) } finally { busy.value = false } }
</script>

<template>
  <section v-if="data">
    <p class="label">Investors</p>
    <div class="hd"><h1>Fundraising</h1><div class="row"><button class="btn secondary" @click="go('room'); newLink()">Share data room</button><button class="btn" @click="newSafe()">Create a SAFE</button></div></div>
    <nav class="tabs"><button v-for="[k, l] in TABS" :key="k" :class="{ on: tab === k }" @click="go(k)">{{ l }}</button></nav>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>

    <template v-if="tab === 'overview'">
      <div v-if="main" class="card rh"><div><span class="mut">{{ main.name }} · {{ main.instrument === 'safe' ? 'SAFE' : main.instrument === 'priced' ? 'Priced round' : 'Convertible note' }}{{ main.valuation_cap ? ' · ' + money(main.valuation_cap) + ' post-money cap' : '' }}</span>
        <h2>{{ money(committed) }} <em>committed of {{ money(main.target) }}</em></h2><div class="bar"><i class="c" :style="{ width: pct(committed) + '%' }" /><i class="w" :style="{ width: pct(closed) + '%' }" /></div><span class="mut">{{ money(closed) }} closed · {{ pct(committed) }}% committed{{ main.target_close ? ' · target close ' + new Date(main.target_close + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '' }}</span></div>
        <NuxtLink :to="'/fundraising/pipelines/' + main.id" class="btn secondary">Open pipeline</NuxtLink></div>
      <div v-else class="card cta"><b>Set up your round</b><p>Track your target, who you're talking to, what's committed and what's in the bank.</p><button class="btn" @click="editRound()">Set up round</button></div>
      <div class="kp"><div class="k"><span>Investors in play</span><b>{{ main?.in_play ?? 0 }}</b></div><div class="k"><span>Data room files</span><b>{{ data.files.length }}</b></div>
        <div class="k"><span>Data room views</span><b>{{ data.links.reduce((t, l) => t + l.views, 0) }}</b></div><div class="k"><span>Time spent</span><b>{{ mins(data.links.reduce((t, l) => t + l.seconds, 0)) }}</b></div></div>
      <div class="two"><div class="card"><h3>Recent data room activity</h3><div v-for="(a, i) in data.activity.slice(0, 8)" :key="i" class="li"><span><b>{{ a.viewer_email ?? 'Someone' }}</b> opened {{ a.file ?? 'the room' }}<em> · via {{ a.link }}</em></span><span class="mut">{{ when(a.started_at) }}{{ a.seconds ? ' · ' + mins(a.seconds) : '' }}</span></div><p v-if="!data.activity.length" class="mut">No views yet. Share your data room to start tracking.</p></div>
        <div class="card"><h3>Next steps</h3><button class="nx" @click="go('room'); up.open = true"><b>Upload your deck</b><span>Then share tracked links with investors</span></button><button class="nx" @click="newMemo()"><b>Write your deal memo with AI</b><span>From your numbers and a few notes</span></button><button class="nx" @click="newSafe()"><b>Create a SAFE</b><span>Post-money cap, discount, MFN</span></button></div></div>
    </template>

    <template v-else-if="tab === 'room'">
      <div class="bar2"><span class="mut">{{ data.files.length }} file{{ data.files.length === 1 ? '' : 's' }} · investors only see what each link shares</span><div class="row"><button class="btn secondary" @click="up.open = true">Upload files</button><button class="btn" :disabled="!data.files.length" @click="newLink()">Create tracked link</button></div></div>
      <div class="two"><div><h3>Files</h3><div v-for="[fo, list] in folders" :key="fo" class="card fold"><span class="fl">{{ fo }}</span><div v-for="f in list" :key="f.id" class="fi"><span class="ic">{{ f.title.split('.').pop()?.toUpperCase().slice(0, 4) }}</span><span class="ft">{{ f.title }}<em>{{ (f.size_bytes / 1e6).toFixed(1) }} MB</em></span><DeleteButton type="dr_file" :id="f.id" :name="f.title" link @deleted="refresh()" /></div></div>
          <div v-if="!data.files.length" class="card cta"><b>Your data room is empty</b><p>Upload your deck, financials, cap table and legal documents.</p><button class="btn" @click="up.open = true">Upload files</button></div></div>
        <div><h3>Tracked links</h3><div v-for="l in data.links" :key="l.id" class="card lnk" :class="{ dead: l.revoked }"><div class="lh"><b>{{ l.name }}</b><span class="pill" :class="{ off: l.revoked }">{{ l.revoked ? 'Off' : 'Live' }}</span></div>
          <span v-if="shortUrl(l)" class="su">{{ shortUrl(l) }}</span><span class="mut">{{ l.file_ids.length ? l.file_ids.length + ' files' : 'Whole room' }} · {{ l.require_email ? 'email required' : 'no email' }} · {{ l.allow_download ? 'downloads on' : 'view only' }}{{ l.expires ? ' · until ' + l.expires : '' }}</span>
          <div class="ls"><span><b>{{ l.views }}</b> views</span><span><b>{{ l.viewers }}</b> people</span><span><b>{{ mins(l.seconds) }}</b> spent</span></div>
          <div class="row"><button class="link" @click="revoke(l, !l.revoked)">{{ l.revoked ? 'Turn on' : 'Turn off' }}</button><DeleteButton type="dr_link" :id="l.id" :name="l.name" link @deleted="refresh()" /></div></div>
          <p v-if="!data.links.length" class="mut">Create a link for each investor or firm to see exactly who looks at what.</p></div></div>
    </template>

    <template v-else-if="tab === 'round'">
      <div class="bar2"><span class="mut">A pipeline for each raise or target group. Track every investor from first contact to money in the bank.</span><button class="btn" @click="editRound()">New pipeline</button></div>
      <div class="plg"><NuxtLink v-for="p in data.pipelines" :key="p.id" :to="'/fundraising/pipelines/' + p.id" class="card plc"><div class="lh"><b>{{ p.name }}</b><span class="pill" :class="{ off: p.status !== 'open' }">{{ p.status === 'open' ? 'Open' : 'Closed' }}</span></div>
        <span class="am2">{{ money(p.committed, p.currency) }} <em>of {{ money(p.target, p.currency) }}</em></span><div class="bar"><i class="c" :style="{ width: pct(p.committed, p.target) + '%' }" /><i class="w" :style="{ width: pct(p.closed, p.target) + '%' }" /></div><span class="mut">{{ p.in_play }} investors in play · {{ money(p.closed, p.currency) }} closed</span></NuxtLink></div>
      <div v-if="!data.pipelines.length" class="card cta"><b>No pipelines yet</b><p>Create one for your raise, set the target, then add investors as conversations start.</p><button class="btn" @click="editRound()">New pipeline</button></div>
    </template>

    <template v-else-if="tab === 'memo'">
      <div class="bar2"><span class="mut">An investment memo investors can read before or after your meeting.</span><button class="btn" @click="newMemo()">New memo</button></div>
      <div v-for="m in data.memos" :key="m.id" class="card mm"><NuxtLink :to="'/fundraising/memo/' + m.id" class="mt"><b>{{ m.title }}</b></NuxtLink><span class="mut">Edited {{ when(m.updated_at) }}</span><DeleteButton type="memo" :id="m.id" :name="m.title" link @deleted="refresh()" /></div>
      <div v-if="!data.memos.length" class="card cta"><b>Write your deal memo with AI</b><p>Add a few notes on the problem, product, market and team. We combine them with your financials into a clear memo you can edit and share.</p><button class="btn" @click="newMemo()">Start a memo</button></div>
    </template>

    <template v-else-if="tab === 'nda'">
      <div class="bar2"><span class="mut">Everyone who signed your NDA before viewing your page, data room or updates. Turn the NDA on or off in Settings → Sharing &amp; branding.</span><NuxtLink to="/settings?s=sharing" class="btn secondary">NDA settings</NuxtLink></div>
      <div class="box"><table v-if="data.ndas.length"><thead><tr><th style="text-align:left;padding:10px 14px;font-weight:400;color:var(--c-muted);font-size:12.5px">Signed by</th><th style="text-align:left;font-weight:400;color:var(--c-muted);font-size:12.5px">For</th><th style="text-align:left;font-weight:400;color:var(--c-muted);font-size:12.5px">Signed</th><th /></tr></thead><tbody><tr v-for="n in data.ndas" :key="n.id"><td><b>{{ n.name }}</b><span class="mut" style="display:block">{{ n.email }}{{ n.company ? ' · ' + n.company : '' }}</span></td><td class="mut">{{ n.scope === 'room' ? 'Data room' : n.scope === 'page' ? 'Investor page' : 'Updates' }}</td><td class="mut">{{ when(n.signed_at) }}</td><td class="n"><button class="link" @click="ndaView = n">View signed NDA</button> · <DeleteButton type="nda_sig" :id="n.id" :name="'the NDA signed by ' + n.name" link @deleted="refresh()" /></td></tr></tbody></table>
        <p v-else class="none">No NDAs signed yet.</p></div>
    </template>
    <template v-else>
      <div class="bar2"><span class="mut">SAFE term sheets based on the post-money SAFE structure.</span><button class="btn" @click="newSafe()">Create a SAFE</button></div>
      <div class="box"><table v-if="data.safes.length"><tbody><tr v-for="s in data.safes" :key="s.id"><td><NuxtLink :to="'/fundraising/safe/' + s.id" class="t">{{ s.investor_name }}</NuxtLink><span class="mut">{{ s.safe_date }}</span></td><td>{{ money(s.amount, s.currency) }}</td><td class="mut">{{ s.valuation_cap ? money(s.valuation_cap, s.currency) + ' cap' : '' }}{{ s.discount ? ' · ' + s.discount + '% discount' : '' }}</td><td class="n"><DeleteButton type="safe" :id="s.id" :name="'SAFE for ' + s.investor_name" link @deleted="refresh()" /></td></tr></tbody></table>
        <p v-else class="none">No SAFEs yet.</p></div>
    </template>

    <AppModal :open="!!ndaView" title="Signed NDA" wide @close="ndaView = null"><div v-if="ndaView" class="ndv"><div class="ndt" v-html="renderMarkdown(ndaView.nda_text)" /><div class="sg"><span>Signed electronically by</span><b class="sig">{{ ndaView.signature }}</b><span>{{ ndaView.name }} · {{ ndaView.email }}{{ ndaView.company ? ' · ' + ndaView.company : '' }} · {{ new Date(ndaView.signed_at).toLocaleString('en-GB') }}</span></div></div></AppModal>
    <AppModal :open="up.open" title="Upload to the data room" @close="up.open = false">
      <div class="frm"><label class="label">Folder<select v-model="up.folder"><option v-for="f in ['General', 'Financials', 'Legal', 'Product', 'Team', 'Customers', 'Cap table']" :key="f">{{ f }}</option></select></label>
        <label class="chk"><input v-model="up.is_deck" type="checkbox"> This is our pitch deck</label>
        <DropZone multiple accept=".pdf,.pptx,.xlsx,.docx,.csv,.png,.jpg,.jpeg" :disabled="busy" :label="busy ? 'Uploading…' : ''" hint="PDF, PowerPoint, Excel, Word, CSV or images · or click to choose" @change="upload" /><p class="mut">PDF works best for viewing in the browser. Up to 50 MB per file.</p></div>
    </AppModal>
    <AppModal :open="lk.open" :title="lk.url ? 'Your link is ready' : 'Create a tracked link'" @close="lk.open = false">
      <div v-if="lk.url" class="frm"><p>Send this to {{ lk.name }}. You'll see each time they open a file and how long they spend.</p><div class="cp"><input :value="lk.url" readonly><button class="btn" @click="copy(lk.url)">{{ copied === lk.url ? 'Copied' : 'Copy' }}</button></div></div>
      <form v-else id="lkf" class="frm" @submit.prevent="saveLink"><label class="label">Who is it for?<input v-model="lk.name" required maxlength="200" placeholder="e.g. Amara at Ventures Africa"></label>
        <label class="label">Short address (optional)<span class="sa"><span>{{ data.handle ? 'app.finvry.com/' + data.handle + '/' : 'Set your address in Settings → Sharing & branding' }}</span><input v-model="lk.slug" :disabled="!data.handle" maxlength="41" placeholder="bridge-deck"></span></label>
        <label class="label">What it shares<select v-model="lk.all"><option :value="true">The whole data room</option><option :value="false">Chosen files only</option></select></label>
        <div v-if="!lk.all" class="pick"><label v-for="f in data.files" :key="f.id" class="chk"><input v-model="lk.file_ids" type="checkbox" :value="f.id"> {{ f.title }}</label></div>
        <label class="label">Link expires<select v-model.number="lk.days"><option :value="7">In 7 days</option><option :value="30">In 30 days</option><option :value="90">In 90 days</option><option :value="0">Never</option></select></label>
        <label class="chk"><input v-model="lk.require_email" type="checkbox"> Ask for the viewer's email</label><label class="chk"><input v-model="lk.allow_download" type="checkbox"> Allow downloads</label></form>
      <template #foot><template v-if="!lk.url"><button class="btn secondary" @click="lk.open = false">Cancel</button><button class="btn" type="submit" form="lkf" :disabled="busy">Create link</button></template><button v-else class="btn" @click="lk.open = false">Done</button></template>
    </AppModal>
    <AppModal :open="rd.open" :title="rd.id ? 'Edit pipeline' : 'New pipeline'" @close="rd.open = false">
      <form id="rdf" class="frm g2" @submit.prevent="saveRound"><label class="label">Pipeline name<input v-model="rd.name" required maxlength="120" list="pln"><datalist id="pln"><option v-for="n in ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Bridge', 'Angel round', 'Strategic investors']" :key="n" :value="n" /></datalist></label>
        <label class="label">Instrument<select v-model="rd.instrument"><option value="safe">SAFE</option><option value="priced">Priced round</option><option value="convertible_note">Convertible note</option></select></label>
        <label class="label">Currency<select v-model="rd.currency"><option value="USD">US dollar</option><option value="NGN">Naira</option></select></label>
        <label class="label">Target amount<input v-model="rd.target" inputmode="decimal" placeholder="e.g. 750000"></label>
        <label v-if="rd.instrument !== 'priced'" class="label">Post-money valuation cap<input v-model="rd.valuation_cap" inputmode="decimal"></label><label v-else class="label">Pre-money valuation<input v-model="rd.pre_money" inputmode="decimal"></label>
        <label v-if="rd.instrument !== 'priced'" class="label">Discount (%)<select v-model="rd.discount"><option value="">None</option><option v-for="d in [10, 15, 20, 25]" :key="d" :value="d">{{ d }}%</option></select></label>
        <label class="label">Target close<input v-model="rd.target_close" type="date"></label><label class="label">Status<select v-model="rd.status"><option value="open">Open</option><option value="closed">Closed</option></select></label></form>
      <template #foot><button class="btn secondary" @click="rd.open = false">Cancel</button><button class="btn" type="submit" form="rdf" :disabled="busy">Save</button></template>
    </AppModal>
    <AppModal :open="inv.open" :title="inv.id ? inv.name : 'Add an investor'" @close="inv.open = false">
      <form id="invf" class="frm g2" @submit.prevent="saveInv"><label class="label">Name<input v-model="inv.name" required maxlength="200"></label><label class="label">Firm<input v-model="inv.firm" maxlength="200"></label>
        <label class="label">Email<input v-model="inv.email" type="email" maxlength="254"></label><label class="label">Stage<select v-model="inv.stage"><option v-for="[s, l] in STAGES" :key="s" :value="s">{{ l }}</option></select></label>
        <label class="label">Amount<input v-model="inv.amount" inputmode="decimal"></label><span />
        <label class="label w">Notes<textarea v-model="inv.notes" rows="3" maxlength="2000" /></label></form>
      <template #foot><button v-if="false" class="btn secondary" @click="safeFromInv">Create their SAFE</button><span class="sp" /><button class="btn secondary" @click="inv.open = false">Cancel</button><button class="btn" type="submit" form="invf" :disabled="busy">Save</button></template>
    </AppModal>
    <AppModal :open="sf.open" title="Create a SAFE" @close="sf.open = false">
      <ol class="st"><li v-for="(s, i) in ['Investor', 'Terms', 'Company', 'Review']" :key="s" :class="{ on: sf.step === i + 1, ok: sf.step > i + 1 }"><span>{{ sf.step > i + 1 ? '✓' : i + 1 }}</span>{{ s }}</li></ol>
      <div v-if="sf.step === 1" class="frm"><label class="label">Investor name<input v-model="sf.investor_name" required maxlength="200" placeholder="Person or fund"></label><label class="label">Investor email<input v-model="sf.investor_email" type="email"></label>
        <div class="g2"><label class="label">Amount<input v-model="sf.amount" inputmode="decimal"></label><label class="label">Currency<select v-model="sf.currency"><option value="USD">US dollar</option><option value="NGN">Naira</option></select></label></div></div>
      <div v-else-if="sf.step === 2" class="frm"><div class="g2"><label class="label">Post-money valuation cap<input v-model="sf.valuation_cap" inputmode="decimal" placeholder="e.g. 8000000"></label><label class="label">Discount<select v-model="sf.discount"><option value="">None</option><option v-for="d in [10, 15, 20, 25]" :key="d" :value="d">{{ d }}%</option></select></label></div>
        <label class="chk"><input v-model="sf.mfn" type="checkbox"> Most favoured nation (MFN)</label><label class="chk"><input v-model="sf.pro_rata" type="checkbox"> Pro rata rights side letter</label>
        <p v-if="sf.valuation_cap && sf.amount" class="hint">The investor would own about <b>{{ Math.round((Number(sf.amount) / Number(sf.valuation_cap)) * 10000) / 100 }}%</b> at conversion (amount ÷ post-money cap), before later SAFEs and the new round.</p></div>
      <div v-else-if="sf.step === 3" class="frm"><label class="label">Company legal name<input v-model="sf.company_name" required maxlength="200"></label><label class="label">State of incorporation<select v-model="sf.company_state"><option>Delaware</option><option>Wyoming</option><option>California</option><option>New York</option><option>Other</option></select></label>
        <div class="g2"><label class="label">Signed by<input v-model="sf.signatory_name" required maxlength="200"></label><label class="label">Title<select v-model="sf.signatory_title"><option>Chief Executive Officer</option><option>President</option><option>Founder</option><option>Managing Member</option></select></label></div><label class="label">Date<input v-model="sf.safe_date" type="date"></label></div>
      <div v-else class="frm"><div class="rv"><span>Investor</span><b>{{ sf.investor_name }}</b><span>Amount</span><b>{{ money(Number(sf.amount), sf.currency) }}</b><span>Valuation cap</span><b>{{ sf.valuation_cap ? money(Number(sf.valuation_cap), sf.currency) + ' post-money' : 'None' }}</b><span>Discount</span><b>{{ sf.discount ? sf.discount + '%' : 'None' }}</b><span>MFN / pro rata</span><b>{{ sf.mfn ? 'MFN' : 'No MFN' }} · {{ sf.pro_rata ? 'Pro rata side letter' : 'No pro rata' }}</b><span>Company</span><b>{{ sf.company_name }} ({{ sf.company_state }})</b></div>
        <p class="hint">This creates a SAFE term sheet and signature page based on the post-money SAFE. It is not legal advice; have a lawyer review it, and sign the official form.</p></div>
      <template #foot><button v-if="sf.step > 1" class="btn secondary" @click="sf.step--">Back</button><span class="sp" /><button v-if="sf.step < 4" class="btn" :disabled="(sf.step === 1 && (!sf.investor_name || !sf.amount)) || (sf.step === 3 && (!sf.company_name || !sf.signatory_name))" @click="sf.step++">Continue</button><button v-else class="btn" :disabled="busy" @click="saveSafe">Create SAFE</button></template>
    </AppModal>
  </section>
</template>

<style scoped>
.hd { display: flex; justify-content: space-between; align-items: end; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 0; } .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 14px 0 16px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.rh { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; } .rh > div:first-child { flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 6px; } .rh h2 { margin: 0; font-size: 34px; } .rh h2 em { font-style: normal; font-size: 15px; color: var(--c-muted); font-family: var(--font-body); }
.bar { height: 8px; background: var(--c-paper-2); position: relative; } .bar i { position: absolute; left: 0; top: 0; bottom: 0; } .bar i.c { background: #9fb6d9; } .bar i.w { background: var(--c-navy); }
.kp { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; } .k span { font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 24px; font-weight: 600; }
.two { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; } h3 { margin: 0 0 10px; font-size: 18px; } .li { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .li em { font-style: normal; color: var(--c-muted); }
.nx { display: flex; flex-direction: column; gap: 2px; text-align: left; width: 100%; background: var(--c-paper-2); border: 0; padding: 12px 14px; margin-bottom: 8px; font: inherit; cursor: pointer; } .nx:hover { background: var(--c-signal-soft); } .nx span { font-size: 12.5px; color: var(--c-muted); }
.cta { text-align: center; padding: 28px; margin-bottom: 12px; } .cta p { color: var(--c-ink-soft); max-width: 480px; margin: 6px auto 14px; }
.bar2 { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; } .fold { margin-bottom: 10px; padding: 12px 14px; } .fl { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--c-muted); }
.fi { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--c-rule); } .fi:last-child { border-bottom: 0; } .ic { width: 34px; height: 38px; display: grid; place-items: center; background: var(--c-signal-soft); color: var(--c-blue-deep); font-size: 10px; font-weight: 700; flex: none; } .ft { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 14px; } .ft em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.lnk { margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px; } .lnk.dead { opacity: .6; } .lh { display: flex; justify-content: space-between; gap: 8px; } .ls { display: flex; gap: 16px; font-size: 13px; color: var(--c-ink-soft); } .ls b { color: var(--c-ink); }
.pill { font-size: 12px; padding: 2px 8px; background: rgba(31,122,77,.1); color: var(--c-ok); } .pill.off { background: var(--c-paper-2); color: var(--c-muted); }
.pipe { display: grid; grid-template-columns: repeat(7, minmax(150px, 1fr)); gap: 8px; overflow-x: auto; padding-bottom: 6px; } .col { background: var(--c-paper-2); padding: 8px; min-height: 200px; } .ch { display: block; font-size: 12px; font-weight: 600; color: var(--c-ink-soft); margin-bottom: 8px; } .ch em { font-style: normal; color: var(--c-muted); font-weight: 400; }
.ic2 { padding: 10px; margin-bottom: 6px; display: flex; flex-direction: column; gap: 3px; cursor: pointer; } .ic2:hover { border-color: var(--c-navy); } .am { font-size: 13px; font-weight: 600; } .am em { font-style: normal; font-weight: 400; color: var(--c-muted); } .ic2 select { font: inherit; font-size: 12px; padding: 3px; border: 1px solid var(--c-rule); margin-top: 4px; }
.plg { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; } .plc { display: flex; flex-direction: column; gap: 8px; text-decoration: none; color: var(--c-ink); } .plc:hover { border-color: var(--c-navy); } .am2 { font-size: 22px; font-weight: 600; } .am2 em { font-style: normal; font-size: 13px; color: var(--c-muted); font-weight: 400; }
.sa { display: flex; align-items: center; border: 1px solid var(--c-rule-strong); } .sa span { padding: 0 8px; font-size: 12.5px; color: var(--c-muted); background: var(--c-paper-2); align-self: stretch; display: flex; align-items: center; } .sa input { border: 0; flex: 1; } .su { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; color: var(--c-blue-deep); }
.ndv .ndt :deep(p) { margin: 0 0 8px; } .ndv .ndt { font-family: inherit; font-size: 13.5px; line-height: 1.6; background: var(--c-paper-2); padding: 14px; max-height: 50vh; overflow-y: auto; } .sg { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; } .sg span { font-size: 12.5px; color: var(--c-muted); } .sig { font-family: 'Brush Script MT', cursive; font-size: 30px; font-weight: 400; color: var(--c-navy); }
.mm .mt { flex: 1; color: var(--c-ink); text-decoration: none; } .mm { align-items: center; gap: 14px; }
.mm { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 8px; text-decoration: none; color: var(--c-ink); } .mm:hover { border-color: var(--c-navy); }
.box { background: #fff; border: 1px solid var(--c-rule); } table { width: 100%; border-collapse: collapse; } td { padding: 12px 14px; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .t { font-weight: 600; display: block; } .n { text-align: right; } .none { padding: 18px; color: var(--c-muted); margin: 0; }
.frm { display: flex; flex-direction: column; gap: 12px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .w { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 6px; }
input, select, textarea { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .chk { display: flex; gap: 8px; align-items: center; font-size: 14px; } .chk input { width: auto; }
.upl { position: relative; overflow: hidden; align-self: flex-start; } .upl input { position: absolute; inset: 0; opacity: 0; cursor: pointer; } .pick { max-height: 180px; overflow-y: auto; border: 1px solid var(--c-rule); padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.cp { display: flex; gap: 8px; } .cp input { flex: 1; } .st { display: flex; gap: 16px; list-style: none; padding: 0; margin: 0 0 16px; font-size: 13px; color: var(--c-muted); } .st li { display: flex; gap: 6px; align-items: center; } .st span { width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid var(--c-rule-strong); font-size: 12px; } .st .on { color: var(--c-navy); font-weight: 500; } .st .on span { background: var(--c-navy); color: #fff; border-color: var(--c-navy); } .st .ok span { color: var(--c-ok); border-color: var(--c-ok); }
.rv { display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; font-size: 14px; } .rv span { color: var(--c-muted); } .rv b { font-weight: 500; } .hint { font-size: 13px; color: var(--c-ink-soft); background: var(--c-paper-2); padding: 10px 12px; margin: 0; } .sp { flex: 1; }
.mut { color: var(--c-muted); font-size: 13px; } .link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1000px) { .two, .kp, .g2 { grid-template-columns: 1fr; } }
</style>
