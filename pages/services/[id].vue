<script setup lang="ts">
// A services job: what was ordered, the customer and their company, files, activity and billing.
import { intakeKindFor } from '~/shared/intake'
import { mdRender } from '~/shared/markdown'
import { US_STATES } from '~/shared/countries'
const id = useRoute().params.id as string
interface Job { codes?: string[]; id: string; title: string; service: string; description: string | null; status: string; priority: string; due_date: string | null; fee_usd: string | null; owner_id: string | null; company_id: string | null; created_at: string; link_active: boolean | null; client_token_expires: string | null; client_id: string; client: string; contact_name: string; email: string; phone: string | null; country: string | null; emails_muted?: boolean }
interface Ev { id: string; kind: string; body: string | null; from_status: string | null; to_status: string | null; visible_to_client: boolean; created_at: string; by_name: string | null; document_id: string | null; document_title: string | null; document_mime: string | null; document_size: number | null }
interface Person { id: string; name: string; email: string | null; role: string; ownership_pct: number | null; company: string | null }
interface Company { id: string; name: string; entity_type: string; jurisdiction: string | null; country: string | null; status: string | null; ein: string | null; formation_date: string | null; address: string | null; virtual_office: boolean | null }
interface Inv { id: string; number: string; currency: string; amount: string; tax_amount: string; status: string; paid_via: string | null; issue_date: string; overdue: boolean }
// Fetched together, not one after another (each wait is a round trip to the server).
const [__p1624_0, __p1624_1] = await Promise.all([
  useFetch<{ job: Job; events: Ev[]; companies: { id: string; name: string }[]; invoices: Inv[]; wallet: { currency: string; balance_minor: number } | null; people: Person[]; company: Company | null; items: { code: string; name: string; billing: string }[] }>('/api/services/' + id),
  useFetch<{ id: string; name: string }[]>('/api/pipeline/people')])
const { data, error, refresh } = __p1624_0
const { data: team } = __p1624_1
const fmtMoney = (v: number | string, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(v))
const SERVICES: Record<string, string> = { company_formation: 'Company formation', annual_compliance: 'Annual compliance', tax_filing: 'Tax filing', registered_agent: 'Registered agent', virtual_office: 'Virtual office', state_filing: 'State filing', legal_review: 'Legal review', trust_setup: 'Trust set-up', banking_setup: 'Banking set-up', other: 'Other' }
const STATUSES = [['new', 'New'], ['in_progress', 'In progress'], ['waiting_client', 'Waiting on client'], ['completed', 'Completed'], ['cancelled', 'Cancelled']] as const
const TYPES: Record<string, string> = { llc: 'LLC', c_corp: 'C-Corp', s_corp: 'S-Corp', ltd: 'Limited', plc: 'PLC', other: 'Other' }
const ROLES: Record<string, string> = { owner: 'Owner', director: 'Director', officer: 'Officer', contact: 'Contact', other: 'Other' }
const label = (s: string | null) => STATUSES.find(([k]) => k === s)?.[1] ?? s ?? ''
const job = computed(() => data.value!.job)
const isOrder = computed(() => !!data.value?.items.length)
const heading = computed(() => (isOrder.value ? (data.value?.company?.name ?? job.value.client) : job.value.title))
const kindLabel = computed(() => (isOrder.value ? 'Order' : SERVICES[job.value.service] ?? 'Job'))
// Order notes: the description without the lines already shown as service chips.
const notes = computed(() => (job.value.description ?? '').split('\n').filter((l) => !/^- /.test(l.trim())).join('\n').trim())
// The order description, read into parts for a clear layout (who placed it, the new company, owners, virtual office, notes).
const order = computed(() => {
  const o = { by: null as null | { name: string; email: string; client: boolean }, company: null as null | { name: string; type: string; place: string; check: string; backup: string }, owners: [] as { name: string; pct: number | null }[], vo: '', voAddr: '', notes: [] as string[], other: [] as string[] }
  let inNotes = false
  for (const raw of (job.value.description ?? '').split('\n')) {
    const l = raw.trim(); let m: RegExpMatchArray | null
    if (inNotes) { o.notes.push(raw); continue }
    if (!l || /^- /.test(l)) continue
    if ((m = l.match(/^(Logged in the services desk|Ordered in Finvry) by (.+?) \(([^()]+)\)$/))) o.by = { name: m[2]!, email: m[3]!, client: m[1]!.startsWith('Ordered') }
    else if ((m = l.match(/^New company: (.+?) \(([^)]*)\)(.*)$/))) { const p = m[2]!.split(', '); o.company = { name: m[1]!, type: p[0] ?? '', place: p.slice(1).join(', '), check: m[3]!.match(/name check: ([^;]+)/)?.[1]?.trim() ?? '', backup: m[3]!.match(/backup name:? ([^;]+)/)?.[1]?.trim() ?? '' } }
    else if ((m = l.match(/^Owners: (.+)$/))) o.owners = m[1]!.split(', ').map((x) => { const k = x.match(/^(.*?)(?: \((\d+(?:\.\d+)?)%\))?$/); return { name: (k?.[1] ?? x).trim(), pct: k?.[2] ? Number(k[2]) : null } })
    else if ((m = l.match(/^Virtual office location: (.+?)(?: — (.+))?$/))) { o.vo = m[1]!; o.voAddr = m[2] ?? '' }
    else if ((m = l.match(/^Notes: ?(.*)$/))) { inNotes = true; if (m[1]) o.notes.push(m[1]) }
    else o.other.push(raw)
  }
  return o
})
// Edit the order: the new company and the virtual office (state / address).
const hasVO = computed(() => !!order.value.vo || (job.value.codes ?? []).includes('virtual_office'))
const oe = reactive({ open: false, name: '', entity_type: 'llc', jurisdiction: '', country: 'United States', ein: '', status: 'forming', vo_country: 'United States', vo_state: '', vo_address: '' })
function editOrder() {
  const c = data.value?.company, vo = order.value.vo, ng = /nigeria/i.test(vo)
  const parts = vo.split(', ')
  Object.assign(oe, { open: true, name: c?.name ?? order.value.company?.name ?? '', entity_type: c?.entity_type ?? 'llc', jurisdiction: c?.jurisdiction ?? '', country: c?.country ?? 'United States', ein: c?.ein ?? '', status: c?.status ?? 'forming',
    vo_country: ng ? 'Nigeria' : 'United States', vo_state: ng ? '' : (parts.length > 1 ? parts.slice(0, -1).join(', ') : parts[0] ?? ''), vo_address: order.value.voAddr || c?.address || '' })
}
const saveOrder = () => run(async () => {
  await $fetch('/api/services/' + id + '/order-details', { method: 'POST', body: { ...(data.value?.company ? { company: { name: oe.name, entity_type: oe.entity_type, jurisdiction: oe.jurisdiction, country: oe.country, ein: oe.ein, status: oe.status } } : {}), ...(hasVO.value ? { vo: { country: oe.vo_country, state: oe.vo_state, address: oe.vo_address } } : {}) } })
  oe.open = false; ok.value = 'Order details updated.'
})
const CHECK: Record<string, string> = { available: 'Name looks available', taken: 'Name already taken', similar: 'Similar names exist', unknown: 'Check with the state', 'not checked': 'Name not checked yet' }
const hasIntake = computed(() => !!intakeKindFor(job.value.codes ?? [], job.value.service))
useHead({ title: () => (data.value ? heading.value : 'Job') })

const busy = ref(false), msg = ref(''), ok = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function run(fn: () => Promise<unknown>) { busy.value = true; msg.value = ''; ok.value = ''; try { await fn(); await refresh() } catch (e) { msg.value = errText(e) } finally { busy.value = false } }

const tellClient = ref(true)
// Client emails on/off for this client (all their jobs). Off: updates still show on their job page, no email goes out.
const muted = computed(() => !!job.value.emails_muted)
// Agreements on this job: the SLA the client signed with the order, or one the team sends (back-dated if needed).
interface Ag { id: string; title: string; status: string; effective_date: string; signed_at: string | null; signer_name: string | null; signer_email: string | null; signature_kind: string | null; created_at: string }
const { data: ags, refresh: rags } = await useFetch<Ag[]>('/api/services/' + id + '/agreements', { default: () => [] })
const ag = reactive({ open: false, effective_date: '', scope: '', notes: '', email: true })
function openAgSend() { Object.assign(ag, { open: true, effective_date: (job.value.created_at ?? new Date().toISOString()).slice(0, 10), scope: '', notes: '', email: true }) }
const sendAg = () => run(async () => { const r = await $fetch<{ emailed: boolean }>('/api/services/' + id + '/agreements', { method: 'POST', body: { effective_date: ag.effective_date, scope: ag.scope, notes: ag.notes, email: ag.email } }); ag.open = false; ok.value = 'Agreement sent' + (r.emailed ? ' and emailed to the client.' : '. The client sees it on the request.'); await rags() })
const withdrawAg = async (a: Ag) => { if (await askConfirm('Withdraw this unsigned agreement?')) run(async () => { await $fetch('/api/services/agreements/' + a.id, { method: 'DELETE' }); await rags() }) }
async function openAg(aid: string) { const w = window.open('', '_blank'); try { const r = await $fetch<{ url: string }>('/api/services/agreements/' + aid + '/pdf'); if (w) w.location.href = r.url } catch { w?.close() } }
const toggleEmails = () => run(async () => { const m = !muted.value; await $fetch('/api/services/clients/' + job.value.client_id + '/emails', { method: 'POST', body: { muted: m } }); ok.value = m ? 'Emails to ' + (job.value.contact_name || job.value.client) + ' are off. Updates still appear on their job page.' : 'Emails to the client are back on.' })
const quiet = ' Saved to their job page — emails to this client are off.'
// Share a file with the client or make it team-only.
const setShared = (e: Ev, visible: boolean) => run(async () => { const r = await $fetch<{ emailed: boolean; muted: boolean }>('/api/services/' + id + '/files/' + e.id, { method: 'POST', body: { visible } }); ok.value = visible ? (r.muted ? '"' + e.document_title + '" is now visible to the client.' + quiet : r.emailed ? '"' + e.document_title + '" shared and the client emailed.' : '"' + e.document_title + '" shared; the email did not send.') : '"' + e.document_title + '" is now team only.' })
const setStatus = (s: string) => run(async () => {
  const note = s === 'waiting_client' ? await askPrompt('What do you need from the client? (sent to them)') ?? '' : ''
  const r = await $fetch<{ emailed: boolean }>('/api/services/' + id + '/events', { method: 'POST', body: { kind: 'status', status: s, body: note || undefined, visible_to_client: tellClient.value } })
  if (tellClient.value) ok.value = muted.value ? 'Status changed.' + quiet : r.emailed ? 'Status changed. Client emailed.' : 'Status changed; the client email did not send.'
})

// Activity: message the client or leave an internal note, written in a rich editor (Markdown), with optional attachments.
// Drafts are kept in this browser per job, so a half-written message survives a refresh.
const ev = reactive({ kind: 'message' as 'message' | 'note', body: '', files: [] as File[] })
const draftKey = (k: string) => 'job-draft:' + id + ':' + k
const readDraft = (k: string) => { try { return localStorage.getItem(draftKey(k)) ?? '' } catch { return '' } }
onMounted(() => { ev.body = readDraft(ev.kind) })
watch(() => ev.kind, (k, prev) => { try { if (ev.body.trim()) localStorage.setItem(draftKey(prev), ev.body); else localStorage.removeItem(draftKey(prev)) } catch { /* private mode */ } ev.body = readDraft(k) })
watch(() => ev.body, (v) => { try { if (v.trim()) localStorage.setItem(draftKey(ev.kind), v); else localStorage.removeItem(draftKey(ev.kind)) } catch { /* private mode */ } })
const hasText = computed(() => ev.body.replace(/[\s\u00a0]|&nbsp;|<br\s*\/?>/g, '').length > 0)
const attachInput = ref<HTMLInputElement | null>(null)
function attach(list: FileList | null | undefined) { if (list) ev.files = [...ev.files, ...Array.from(list)].slice(0, 10); if (attachInput.value) attachInput.value.value = '' }
const addEvent = () => { if (!hasText.value && !ev.files.length) return; return run(async () => {
  const toClient = ev.kind === 'message'
  let emailed = false
  // Files first (no separate email when there is a message — the message mentions them), then the message.
  if (ev.files.length) {
    const fd = new FormData(); for (const f of ev.files) fd.append('file', f)
    fd.append('visible', toClient ? '1' : '0'); fd.append('notify', toClient && !hasText.value ? '1' : '0')
    emailed = (await $fetch<{ emailed: boolean }>('/api/services/' + id + '/upload', { method: 'POST', body: fd })).emailed
  }
  if (hasText.value) {
    const body = ev.body + (ev.files.length && toClient ? '\n\n_Attached: ' + ev.files.map((f) => f.name.replace(/[*_[\]]/g, '')).join(', ') + '_' : '')
    emailed = (await $fetch<{ emailed: boolean }>('/api/services/' + id + '/events', { method: 'POST', body: { kind: ev.kind, body: body.slice(0, 5000) } })).emailed
  }
  const n = ev.files.length
  ok.value = toClient ? (muted.value ? 'Message saved.' + quiet : emailed ? 'Sent to the client' + (n ? ' with ' + n + ' attachment' + (n === 1 ? '' : 's') : '') + '.' : 'Saved; the client email did not send.') : 'Note added' + (n ? ' with ' + n + ' file' + (n === 1 ? '' : 's') : '') + '.'
  try { localStorage.removeItem(draftKey(ev.kind)) } catch { /* private mode */ }
  ev.body = ''; ev.files = []
}) }
function composerKey(e: KeyboardEvent) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addEvent() } }
const rich = (s: string) => mdRender(s.includes('\n\n') || /^\s*([-*]|\d+\.|#|>)\s/m.test(s) ? s : s.replace(/\n/g, '  \n'))
const activity = computed(() => (data.value?.events ?? []).filter((e) => e.kind !== 'document' && e.kind !== 'client_document'))
const KIND: Record<string, string> = { note: 'Internal note', message: 'Message to client', status: 'Status', client_message: 'Client replied' }

// Files on this job: uploaded by the team (e.g. certificate, EIN letter) or by the client. Kept with the services desk only.
const files = computed(() => (data.value?.events ?? []).filter((e) => e.document_title))
const up = reactive({ files: [] as File[], note: '', share: true })
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
function pick(list: FileList | null | undefined) { if (list) up.files = [...up.files, ...Array.from(list)].slice(0, 10) }
const upload = () => run(async () => {
  const fd = new FormData()
  for (const f of up.files) fd.append('file', f)
  fd.append('note', up.note); fd.append('visible', up.share ? '1' : '0')
  const r = await $fetch<{ files: number; emailed: boolean }>('/api/services/' + id + '/upload', { method: 'POST', body: fd })
  ok.value = (r.files === 1 ? 'File uploaded' : r.files + ' files uploaded') + (up.share ? (muted.value ? ' and visible to the client.' + quiet : r.emailed ? ' and shared with the client.' : '; the client email did not send.') : '.')
  up.files = []; up.note = ''; if (fileInput.value) fileInput.value.value = ''
})
async function openDoc(docId: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + docId + '/download'); window.open(r.url, '_blank') } catch (e) { msg.value = errText(e) } }
const size = (b: number | null) => (b == null ? '' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')
const ext = (e: Ev) => (e.document_mime?.includes('pdf') ? 'PDF' : e.document_mime?.startsWith('image/') ? 'IMG' : e.document_mime?.includes('sheet') || e.document_mime?.includes('excel') || e.document_mime?.includes('csv') ? 'XLS' : e.document_mime?.includes('word') ? 'DOC' : 'FILE')

// Charge an unpaid invoice to the client's Finvry wallet.
const canCharge = (i: Inv) => !!data.value?.wallet && data.value.wallet.currency === i.currency && data.value.wallet.balance_minor >= Math.round(Number(i.amount) * 100)
const charge = async (i: Inv) => { if (!await askConfirm('Charge ' + fmtMoney(i.amount, i.currency) + ' for ' + i.number + ' to the client wallet? The client gets a receipt.')) return; return run(async () => { await $fetch('/api/services/invoices/' + i.id + '/action', { method: 'POST', body: { action: 'charge_wallet' } }); ok.value = i.number + ' paid from the client wallet. Receipt emailed.' }) }
const link = ref('')
const sendLink = () => run(async () => { const r = await $fetch<{ link: string; emailed: boolean }>('/api/services/' + id + '/link', { method: 'POST' }); link.value = r.link; ok.value = r.emailed ? 'Link emailed to ' + job.value.email + '.' : 'Link created; copy it below.' })

const fields = reactive({ owner_id: '', company_id: '', priority: 'normal', due_date: '', fee_usd: '' })
watch(() => data.value?.job, (j) => { if (!j) return; fields.owner_id = j.owner_id ?? ''; fields.company_id = j.company_id ?? ''; fields.priority = j.priority; fields.due_date = j.due_date ?? ''; fields.fee_usd = j.fee_usd ?? '' }, { immediate: true })
const saved = ref(false)
const save = () => run(async () => { await $fetch('/api/services/' + id, { method: 'PATCH', body: { owner_id: fields.owner_id || null, company_id: fields.company_id || null, priority: fields.priority, due_date: fields.due_date || null, fee_usd: fields.fee_usd ? Number(String(fields.fee_usd).replace(/[^0-9.]/g, '')) : null } }); saved.value = true; setTimeout(() => (saved.value = false), 2000) })
const assignee = computed(() => team.value?.find((p) => p.id === job.value.owner_id)?.name ?? null)

const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const day = (s: string) => new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
// Text from clients is escaped (quotes too) before links are added, so nothing they type can become markup.
const escH = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const linkify = (s: string) => escH(s).replace(/https?:\/\/[^\s<&]+(?:&amp;[^\s<&]+)*/g, (e) => { const u = e.replace(/&amp;/g, '&'); return '<a href="' + escH(u) + '" target="_blank" rel="noopener noreferrer">' + escH(u.length > 60 ? u.slice(0, 57) + '…' : u) + '</a>' })
const owners = computed(() => data.value?.people ?? [])
</script>

<template>
  <section v-if="data" class="job">
    <NuxtLink to="/services" class="back">← Jobs</NuxtLink>

    <header class="top">
      <div class="tl1">
        <p class="eyebrow"><span>{{ kindLabel }}</span><span class="dot">·</span><NuxtLink :to="'/services/clients/' + job.client_id">{{ job.client }}</NuxtLink><span class="pill" :data-s="job.status">{{ label(job.status) }}</span></p>
        <h1>{{ heading }}</h1>
        <div v-if="data.items.length" class="chips"><span v-for="i in data.items" :key="i.code" class="chip">{{ i.name }}</span></div>
        <p v-else-if="job.title !== heading" class="sub">{{ job.title }}</p>
        <dl class="meta">
          <div><dt>Opened</dt><dd>{{ day(job.created_at) }}</dd></div>
          <div><dt>Due</dt><dd>{{ job.due_date ? day(job.due_date) : '—' }}</dd></div>
          <div><dt>Priority</dt><dd class="cap">{{ job.priority }}</dd></div>
          <div><dt>Assigned to</dt><dd>{{ assignee ?? 'Unassigned' }}</dd></div>
        </dl>
      </div>
      <DeleteButton type="job" :id="id" :name="heading" to="/services" />
    </header>

    <div class="statusbar">
      <div class="stages" role="group" aria-label="Status">
        <button v-for="[k, l] in STATUSES" :key="k" type="button" :class="{ on: job.status === k }" :disabled="busy || job.status === k" @click="setStatus(k)">{{ l }}</button>
      </div>
      <label class="tell"><input v-model="tellClient" type="checkbox"> Show status changes to the client</label>
      <button type="button" class="mute" :class="{ off: muted }" :disabled="busy" :title="muted ? 'No emails go to this client. Click to turn emails back on.' : 'Click to stop emailing this client while you work.'" @click="toggleEmails"><span class="sw"><i /></span>Client emails {{ muted ? 'off' : 'on' }}</button>
    </div>
    <p v-if="msg" class="flash error" role="alert">{{ msg }}</p><p v-if="ok" class="flash ok" role="status">{{ ok }}</p>

    <div class="grid">
      <div class="col">
        <RaiseBrief v-if="job.codes?.includes('fundraising')" :job-id="id" />
        <div v-else-if="notes || oe.open" class="card od">
          <div class="odh"><h2>Order details</h2><span class="odr"><span v-if="order.by" class="src" :class="{ cl: order.by.client }">{{ order.by.client ? 'Ordered by the client' : 'Logged by the team' }}</span><button v-if="(data.company || hasVO) && !oe.open" type="button" class="lk2" @click="editOrder">Edit</button></span></div>
          <form v-if="oe.open" class="oef" @submit.prevent="saveOrder">
            <template v-if="data.company"><p class="oeh">Company</p>
              <label class="label w2">Company name<input v-model="oe.name" required maxlength="200"></label>
              <label class="label">Type<select v-model="oe.entity_type"><option value="llc">LLC</option><option value="c_corp">C-Corp</option><option value="s_corp">S-Corp</option><option value="ltd">Limited (Ltd)</option><option value="plc">PLC</option><option value="other">Other</option></select></label>
              <label class="label">Status<select v-model="oe.status"><option value="forming">Forming</option><option value="active">Active</option><option value="dissolved">Dissolved</option></select></label>
              <label class="label">Country<CountrySelect v-model="oe.country" /></label>
              <label class="label">State<select v-if="/^united states$/i.test(oe.country)" v-model="oe.jurisdiction"><option value="">—</option><option v-for="st in US_STATES" :key="st" :value="st">{{ st }}</option></select><input v-else v-model="oe.jurisdiction" maxlength="100" placeholder="State or region"></label>
              <label class="label">EIN<input v-model="oe.ein" maxlength="10" placeholder="12-3456789"></label></template>
            <template v-if="hasVO"><p class="oeh">Virtual office</p>
              <label class="label">Country<select v-model="oe.vo_country"><option>United States</option><option>Nigeria</option></select></label>
              <label class="label">State<select v-if="oe.vo_country === 'United States'" v-model="oe.vo_state"><option value="" disabled>Choose</option><option v-for="st in US_STATES" :key="st" :value="st">{{ st }}</option></select><input v-else value="Lagos" disabled></label>
              <label class="label w2">Street address<textarea v-model="oe.vo_address" rows="2" maxlength="500" placeholder="The address we assigned, e.g. 8 The Green, Suite B, Dover, DE 19901" /></label></template>
            <div class="w2 oea"><button type="button" class="btn secondary" @click="oe.open = false">Cancel</button><button class="btn" :disabled="busy">Save changes</button></div>
          </form>
          <p v-if="order.by" class="odby">{{ order.by.name }} · <a :href="'mailto:' + order.by.email">{{ order.by.email }}</a> · {{ day(job.created_at) }}</p>
          <div v-if="order.company" class="odco">
            <span class="mono">{{ initials(order.company.name) }}</span>
            <div class="odci"><span class="lbl">New company</span><b>{{ order.company.name }}</b>
              <div class="tags"><span v-if="order.company.type" class="tg">{{ order.company.type }}</span><span v-if="order.company.place" class="tg">{{ order.company.place }}</span>
                <span v-if="order.company.check" class="tg chk" :data-c="order.company.check">{{ CHECK[order.company.check] ?? 'Name check: ' + order.company.check }}</span></div>
              <span v-if="order.company.backup" class="bk">Backup name: {{ order.company.backup }}</span></div>
          </div>
          <dl class="odl">
            <template v-if="order.owners.length"><dt>Owners</dt><dd><ul class="own"><li v-for="w in order.owners" :key="w.name"><span class="av xs">{{ initials(w.name) }}</span><span class="on">{{ w.name }}</span><span v-if="w.pct != null" class="bar"><i :style="{ width: Math.min(100, w.pct) + '%' }" /></span><b v-if="w.pct != null">{{ w.pct }}%</b></li></ul></dd></template>
            <template v-if="order.vo"><dt>Virtual office</dt><dd class="vo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg><span>{{ order.vo }}<em v-if="order.voAddr" class="voa">{{ order.voAddr }}</em></span></dd></template>
            <template v-if="order.notes.length"><dt>Client notes</dt><dd><blockquote class="nq" v-html="linkify(order.notes.join('\n').trim())" /></dd></template>
            <template v-if="order.other.length"><dt>Also</dt><dd class="notes" v-html="linkify(order.other.join('\n').trim())" /></template>
          </dl>
        </div>
        <IntakeView v-if="hasIntake" :job-id="id" />

        <div class="card">
          <div class="ch"><h2>Files</h2><span class="muted small0">{{ files.length }} file{{ files.length === 1 ? '' : 's' }}</span></div>
          <p class="muted hint">Upload the work for this job — certificates, EIN letters, filed returns, agreements. Files stay with this client's job; they are not added to Documents.</p>
          <form class="upl" @submit.prevent="upload">
            <label class="drop" :class="{ over: dragging }" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dragging = false; pick($event.dataTransfer?.files)">
              <input ref="fileInput" type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.zip,.xlsx,.xls,.docx,.doc" @change="pick(($event.target as HTMLInputElement).files)">
              <span class="ico" aria-hidden="true">↑</span>
              <b>Drop files here or click to choose</b>
              <span class="muted">PDF, Word, Excel, CSV, images or ZIP · up to 25 MB each</span>
            </label>
            <template v-if="up.files.length">
              <ul class="queue"><li v-for="(f, k) in up.files" :key="k"><span>{{ f.name }}</span><em>{{ size(f.size) }}</em><button type="button" aria-label="Remove" @click="up.files.splice(k, 1)">×</button></li></ul>
              <textarea v-model="up.note" rows="2" maxlength="2000" placeholder="Note for the client (optional), e.g. Your certificate of formation is attached." />
              <div class="ur"><label class="chk"><input v-model="up.share" type="checkbox"> Share with the client{{ muted ? ' (no email — emails are off)' : ' and email them' }}</label>
                <button class="btn" type="submit" :disabled="busy">{{ busy ? 'Uploading…' : 'Upload ' + (up.files.length === 1 ? 'file' : up.files.length + ' files') }}</button></div>
            </template>
          </form>
          <ul v-if="files.length" class="files">
            <li v-for="f in files" :key="f.id">
              <FileBadge :name="f.document_title" :mime="f.document_mime" />
              <div class="fi"><button v-if="f.document_id" type="button" class="link" @click="openDoc(f.document_id)">{{ f.document_title }}</button><span v-else>{{ f.document_title }}</span>
                <span class="muted">{{ f.kind === 'client_document' ? 'From the client' : (f.by_name ?? 'Team') }} · {{ when(f.created_at) }}<template v-if="f.document_size"> · {{ size(f.document_size) }}</template></span>
                <span v-if="f.body" class="fnote">{{ f.body }}</span></div>
              <span v-if="f.kind === 'client_document'" class="tag cl">Client upload</span>
              <span v-else class="vis"><span class="tag" :class="{ int: !f.visible_to_client }">{{ f.visible_to_client ? 'Client and team' : 'Team only' }}</span><button type="button" class="vt" :disabled="busy" @click="setShared(f, !f.visible_to_client)">{{ f.visible_to_client ? 'Make team only' : 'Share with client' }}</button></span>
            </li>
          </ul>
        </div>

        <div class="card">
          <h2>Activity</h2>
          <form class="ev" :class="ev.kind" @submit.prevent="addEvent" @keydown="composerKey">
            <div class="tabs"><button v-for="k in (['message', 'note'] as const)" :key="k" type="button" :class="{ on: ev.kind === k }" @click="ev.kind = k">{{ k === 'message' ? 'Message client' : 'Internal note' }}</button></div>
            <p class="who2">{{ ev.kind === 'message' ? 'To ' + (job.contact_name || job.client) + ' · ' + job.email + (muted ? ' — shows on their job page; no email (client emails are off).' : ' — they see it on their job page and get an email.') : 'Only your team sees internal notes.' }}</p>
            <ClientOnly>
              <RichEditor v-model="ev.body" compact minimal :min-height="150" :max-length="5000" :placeholder="ev.kind === 'message' ? 'Write to the client… use the toolbar for bold, lists and links' : 'Write a note for the team…'" />
              <template #fallback><div class="edfb" /></template>
            </ClientOnly>
            <ul v-if="ev.files.length" class="queue"><li v-for="(f, k) in ev.files" :key="k"><span class="qn"><FileBadge :name="f.name" :mime="f.type" size="sm" />{{ f.name }}</span><em>{{ size(f.size) }}</em><button type="button" aria-label="Remove" @click="ev.files.splice(k, 1)">×</button></li></ul>
            <div class="evbar">
              <label class="att"><input ref="attachInput" type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.zip,.xlsx,.xls,.docx,.doc" @change="attach(($event.target as HTMLInputElement).files)">📎 Attach files</label>
              <span class="kbd">⌘ / Ctrl + Enter to {{ ev.kind === 'message' ? 'send' : 'save' }}</span>
              <button class="btn" type="submit" :disabled="busy || (!hasText && !ev.files.length)">{{ busy ? 'Sending…' : ev.kind === 'message' ? 'Send to client' : 'Add note' }}</button>
            </div>
          </form>
          <ul v-if="activity.length" class="tline">
            <li v-for="e in activity" :key="e.id" :data-kind="e.kind" :class="{ vis: e.visible_to_client }">
              <p class="h">{{ KIND[e.kind] ?? e.kind }}<template v-if="e.kind === 'status'">: {{ label(e.from_status) }} → <b>{{ label(e.to_status) }}</b></template>
                <span v-if="e.visible_to_client && e.kind !== 'client_message'" class="tag">Client sees this</span></p>
              <div v-if="e.body" class="b md" v-html="rich(e.body)" />
              <p class="m">{{ e.by_name ?? (e.kind.startsWith('client') ? job.contact_name : 'System') }} · {{ when(e.created_at) }}</p>
            </li>
          </ul>
          <p v-else class="muted empty">No activity yet. Messages, notes and status changes show here.</p>
        </div>
      </div>

      <aside class="col">
        <div class="card cust">
          <h2>Customer</h2>
          <div class="who"><span class="av">{{ initials(job.contact_name || job.client) }}</span>
            <div><b>{{ job.contact_name || job.client }}</b><span v-if="job.contact_name && job.contact_name !== job.client" class="muted">{{ job.client }}</span></div></div>
          <ul class="kv">
            <li><span>Email</span><a :href="'mailto:' + job.email">{{ job.email }}</a></li>
            <li v-if="job.phone"><span>Phone</span><a :href="'tel:' + job.phone">{{ job.phone }}</a></li>
            <li v-if="job.country"><span>Country</span>{{ job.country }}</li>
          </ul>
          <template v-if="data.company">
            <h3 class="h3e">Company<button type="button" class="lk2" @click="editOrder">Edit</button></h3>
            <ul class="kv">
              <li><span>Name</span><b>{{ data.company.name }}</b></li>
              <li><span>Type</span>{{ TYPES[data.company.entity_type] ?? data.company.entity_type }}</li>
              <li><span>Registered in</span>{{ [data.company.jurisdiction, data.company.country].filter(Boolean).join(', ') || '—' }}</li>
              <li v-if="data.company.status"><span>Status</span><span class="cap">{{ data.company.status }}</span></li>
              <li v-if="data.company.ein"><span>EIN</span>{{ data.company.ein }}</li>
              <li v-if="data.company.address"><span>{{ data.company.virtual_office ? 'Business address' : 'Address' }}</span><span class="pre">{{ data.company.address }}</span></li>
            </ul>
          </template>
          <h3>Owners</h3>
          <ul v-if="owners.length" class="owners">
            <li v-for="p in owners" :key="p.id"><span class="av sm">{{ initials(p.name) }}</span><div><b>{{ p.name }}</b><span class="muted">{{ ROLES[p.role] ?? p.role }}<template v-if="p.email"> · {{ p.email }}</template></span></div><em v-if="p.ownership_pct != null">{{ p.ownership_pct }}%</em></li>
          </ul>
          <p v-else class="muted small0">No owners added yet.</p>
          <NuxtLink class="more" :to="{ path: '/services/clients/' + job.client_id, query: { tab: 'people' } }">{{ owners.length ? 'Edit owners' : 'Add owners' }} →</NuxtLink>
          <div class="cl">
            <button class="btn secondary sm" type="button" :disabled="busy" @click="sendLink">{{ job.link_active ? 'Re-send client link' : 'Send client link' }}</button>
            <input v-if="link" :value="link" readonly class="linkbox" aria-label="Client link" @focus="($event.target as HTMLInputElement).select()">
          </div>
        </div>

        <div class="card agc">
          <div class="agh"><h2>Agreements</h2><button type="button" class="lk" @click="openAgSend">+ Send agreement</button></div>
          <div v-for="a in ags ?? []" :key="a.id" class="agr" :class="a.status"><FileBadge name="a.pdf" size="sm" /><span><button v-if="a.status === 'signed'" type="button" class="lk" @click="openAg(a.id)">{{ a.title }}</button><b v-else>{{ a.title }}</b>
            <em>{{ a.status === 'signed' ? 'Signed by ' + a.signer_name + ' · ' + day(a.signed_at!.slice(0, 10)) : a.status === 'pending' ? 'Waiting for the client · effective ' + day(a.effective_date) : 'Withdrawn' }}</em></span>
            <button v-if="a.status === 'pending'" type="button" class="lk red" @click="withdrawAg(a)">Withdraw</button></div>
          <p v-if="!(ags ?? []).length" class="muted small0">No agreement on file. Send the client our Service Level Agreement to sign, dated when the work started.</p>
        </div>
        <div class="card bill">
          <h2>Billing</h2>
          <div v-for="i in data.invoices" :key="i.id" class="bw">
            <NuxtLink :to="'/services/invoices/' + i.id" class="bi">
              <div><b>{{ i.number }}</b><span class="muted">{{ day(i.issue_date) }}</span></div>
              <div class="r"><b>{{ fmtMoney(i.amount, i.currency) }}</b><em :class="i.overdue ? 'overdue' : i.status">{{ i.overdue ? 'Overdue' : i.status === 'sent' ? 'Unpaid' : i.status === 'paid' ? 'Paid' + (i.paid_via === 'wallet' ? ' from wallet' : '') : i.status }}</em></div>
            </NuxtLink>
            <button v-if="(i.status === 'sent' || i.status === 'draft') && data.wallet" type="button" class="chg" :disabled="busy || !canCharge(i)" :title="canCharge(i) ? '' : data.wallet.currency !== i.currency ? 'Wallet is in ' + data.wallet.currency : 'Not enough in the wallet'" @click="charge(i)">Charge wallet</button>
          </div>
          <p v-if="!data.invoices.length" class="muted small0">Not invoiced yet.</p>
          <p v-if="data.wallet" class="muted small0">Client wallet · <b>{{ fmtMoney(data.wallet.balance_minor / 100, data.wallet.currency) }}</b></p>
          <NuxtLink class="btn secondary sm" :to="{ path: '/services/invoices/new', query: { client: job.client_id, job: job.id, company: job.company_id ?? undefined } }">{{ data.invoices.length ? 'Create another invoice' : 'Create invoice' }}</NuxtLink>
        </div>

        <form class="card facts" @submit.prevent="save">
          <h2>Job settings</h2>
          <label>Assigned to<select v-model="fields.owner_id"><option value="">Unassigned</option><option v-for="p in team ?? []" :key="p.id" :value="p.id">{{ p.name }}</option></select><small>The team member handling this job.</small></label>
          <label>Company<select v-model="fields.company_id"><option value="">—</option><option v-for="c in data.companies" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
          <div class="two"><label>Priority<select v-model="fields.priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
            <label>Due<input v-model="fields.due_date" type="date"></label></div>
          <label>Internal fee (USD)<input v-model="fields.fee_usd" inputmode="decimal" placeholder="Optional"></label>
          <button class="btn" type="submit" :disabled="busy">{{ saved ? 'Saved ✓' : 'Save' }}</button>
        </form>
      </aside>
    </div>
    <AppModal :open="ag.open" title="Send a service agreement" @close="ag.open = false">
      <form id="agf" class="agf" @submit.prevent="sendAg">
        <p class="muted">The client signs our Service Level Agreement for this job from the request in Finvry, or from the job link if they are not on Finvry. The services on this job and their prices are filled in from the price list.</p>
        <label>Agreement date<input v-model="ag.effective_date" type="date" required :max="new Date().toISOString().slice(0, 10)"><small>Back-date it to when the work started so the agreement covers the whole job.</small></label>
        <label>Extra scope (optional)<textarea v-model="ag.scope" rows="3" maxlength="5000" placeholder="e.g. Includes preparing and filing the 2025 Delaware franchise tax report." /></label>
        <label>Notes (optional)<textarea v-model="ag.notes" rows="2" maxlength="2000" placeholder="Shown in the agreement under client notes" /></label>
        <label class="chk"><input v-model="ag.email" type="checkbox"> Email the client a link to sign</label>
      </form>
      <template #foot><button type="button" class="btn secondary" @click="ag.open = false">Cancel</button><button type="submit" form="agf" class="btn" :disabled="busy">{{ busy ? 'Sending…' : 'Send for signature' }}</button></template>
    </AppModal>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Job not found.' : 'Could not load this job.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 14px; color: var(--c-muted); text-decoration: none; font-size: 14px; }
.top { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }
.tl1 { min-width: 0; flex: 1; }
.eyebrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 6px; font-size: 13px; color: var(--c-muted); }
.eyebrow a { color: var(--c-muted); text-decoration: none; } .eyebrow a:hover { color: var(--c-navy); text-decoration: underline; } .dot { opacity: .6; }
.pill { margin-left: 6px; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 0; background: var(--c-paper-2); color: var(--c-ink-soft); }
.pill[data-s="new"] { background: #eef4ff; color: #2c5cc5; } .pill[data-s="in_progress"] { background: #fff6e6; color: #a5650b; } .pill[data-s="waiting_client"] { background: #fdecef; color: #b4234a; } .pill[data-s="completed"] { background: #e8f0f8; color: #235278; } .pill[data-s="cancelled"] { background: var(--c-paper-2); color: var(--c-muted); }
h1 { margin: 0; font-size: clamp(24px, 2.6vw, 32px); line-height: 1.15; letter-spacing: -.02em; }
.sub { margin: 6px 0 0; color: var(--c-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; } .chip { font-size: 13px; padding: 5px 11px; border: 1px solid var(--c-rule-strong); border-radius: 0; background: #fff; color: var(--c-ink); }
.meta { display: flex; flex-wrap: wrap; gap: 6px 32px; margin: 16px 0 0; } .meta div { display: flex; flex-direction: column; gap: 2px; } .meta dt { font-size: 12px; color: var(--c-muted); } .meta dd { margin: 0; font-size: 14px; font-weight: 500; }
.cap { text-transform: capitalize; }
.statusbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 20px; margin: 22px 0 6px; padding: 12px 0; border-top: 1px solid var(--c-rule); border-bottom: 1px solid var(--c-rule); }
.stages { display: flex; flex-wrap: wrap; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 0; overflow: hidden; }
.stages button { font: inherit; font-size: 13px; padding: 8px 14px; background: #fff; border: 0; border-right: 1px solid var(--c-rule); cursor: pointer; color: var(--c-ink-soft); }
.stages button:last-child { border-right: 0; } .stages button.on { background: var(--c-navy); color: #fff; } .stages button:disabled { cursor: default; } .stages button:not(:disabled):hover { background: var(--c-paper-2); }
.tell { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--c-muted); } .tell input { width: auto; }
.flash { margin: 10px 0 0; font-size: 14px; }
.grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr); gap: 20px; align-items: start; margin-top: 18px; }
.col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.card { border-radius: 0; } h2 { margin: 0 0 12px; font-size: 17px; } h3 { margin: 18px 0 8px; font-size: 13px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; letter-spacing: .04em; }
.ch { display: flex; justify-content: space-between; align-items: baseline; } .ch h2 { margin-bottom: 4px; }
.notes { margin: 0; white-space: pre-wrap; line-height: 1.6; color: var(--c-ink-soft); } .notes :deep(a) { color: var(--c-blue-deep); word-break: break-all; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; border-radius: 0; }
textarea { resize: vertical; }
.muted { color: var(--c-muted); } .small0 { font-size: 13px; margin: 0; } .hint { font-size: 13px; margin: 0 0 12px; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
.upl { display: flex; flex-direction: column; gap: 10px; }
.drop { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 22px; border: 1.5px dashed var(--c-rule-strong); border-radius: 0; cursor: pointer; text-align: center; background: var(--c-paper-2); transition: border-color .15s, background .15s; }
.drop:hover, .drop.over { border-color: var(--c-blue-deep); background: #f2f7fc; } .drop .ico { width: 34px; height: 34px; border-radius: 50%; background: #fff; border: 1px solid var(--c-rule); display: grid; place-items: center; font-weight: 700; color: var(--c-blue-deep); margin-bottom: 4px; } .drop .muted { font-size: 12.5px; }
.queue { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; } .queue li { display: flex; gap: 10px; align-items: center; font-size: 13.5px; padding: 6px 10px; background: var(--c-paper-2); border-radius: 0; } .queue span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .queue em { font-style: normal; color: var(--c-muted); font-size: 12px; } .queue button { background: none; border: 0; font-size: 18px; color: var(--c-muted); cursor: pointer; }
.ur { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .chk input { width: auto; }
.files { list-style: none; margin: 16px 0 0; padding: 0; border-top: 1px solid var(--c-rule); }
.files li { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--c-rule); }
.ft { flex: none; width: 40px; height: 44px; border-radius: 0; display: grid; place-items: center; font-size: 10.5px; font-weight: 700; letter-spacing: .03em; color: #fff; background: #7b8794; }
.ft[data-t="PDF"] { background: #d0473d; } .ft[data-t="DOC"] { background: #2f6fd6; } .ft[data-t="XLS"] { background: #235985; } .ft[data-t="IMG"] { background: #8a5cd1; }
.fi { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 14px; } .fi .muted { font-size: 12.5px; } .fnote { font-size: 13px; color: var(--c-ink-soft); white-space: pre-wrap; }
.link { background: none; border: 0; padding: 0; font: inherit; font-weight: 500; color: var(--c-blue-deep); cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; }
.tag { flex: none; font-size: 11px; font-weight: 600; color: var(--c-blue-deep); background: #eef4f9; padding: 2px 8px; border-radius: 0; } .tag.int { color: var(--c-muted); background: var(--c-paper-2); } .tag.cl { color: #0e7490; background: #e6f6fa; }
.ev { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--c-rule); }
.ev.note :deep(.re) { background: #fffbeb; } .ev.note :deep(.re .ProseMirror) { background: #fffbeb; }
.who2 { margin: 0; font-size: 12.5px; color: var(--c-muted); }
.edfb { height: 190px; border: 1px solid var(--c-rule-strong); border-radius: 0; background: #fff; }
.evbar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; } .evbar .btn { margin-left: auto; }
.att { font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; } .att:hover { text-decoration: underline; } .kbd { font-size: 12px; color: var(--c-muted); }
.md :deep(p) { margin: 0 0 8px; } .md :deep(p:last-child) { margin-bottom: 0; } .md :deep(ul), .md :deep(ol) { margin: 4px 0 8px; padding-left: 20px; } .md :deep(a) { color: var(--c-blue-deep); } .md :deep(blockquote) { margin: 0 0 8px; padding-left: 12px; border-left: 3px solid var(--c-rule-strong); color: var(--c-ink-soft); } .md :deep(h2), .md :deep(h3), .md :deep(h4) { font-size: 15px; margin: 6px 0; }
.tabs { display: flex; gap: 16px; border-bottom: 1px solid var(--c-rule); } .tabs button { font: inherit; font-size: 14px; background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 0; margin-bottom: -1px; cursor: pointer; color: var(--c-muted); } .tabs button.on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.tline { list-style: none; padding: 0; margin: 0; }
.tline li { position: relative; padding: 0 0 16px 20px; border-left: 2px solid var(--c-rule); margin-left: 5px; } .tline li:last-child { padding-bottom: 0; }
.tline li::before { content: ''; position: absolute; left: -6px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid var(--c-rule-strong); }
.tline li.vis::before { border-color: var(--c-blue); } .tline li[data-kind="client_message"]::before { background: var(--c-cyan); border-color: var(--c-cyan); } .tline li[data-kind="status"]::before { background: var(--c-navy); border-color: var(--c-navy); }
.h { margin: 0; font-weight: 500; font-size: 14px; color: var(--c-navy); } .h .tag { margin-left: 8px; } .b { margin: 4px 0 0; white-space: pre-wrap; font-size: 14px; } .b.md { white-space: normal; line-height: 1.55; } .m { margin: 4px 0 0; font-size: 12px; color: var(--c-muted); }
.empty { font-size: 13.5px; margin: 0; }
.who { display: flex; gap: 12px; align-items: center; } .who div { display: flex; flex-direction: column; } .who b { font-size: 15px; } .who .muted { font-size: 13px; }
.av { flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--c-navy); color: #fff; display: grid; place-items: center; font-weight: 600; font-size: 14px; } .av.sm { width: 32px; height: 32px; font-size: 12px; background: var(--c-blue-deep); }
.kv { list-style: none; margin: 12px 0 0; padding: 0; } .kv li { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; text-align: right; } .kv li:last-child { border-bottom: 0; } .kv span:first-child { color: var(--c-muted); text-align: left; flex: none; } .kv a { color: var(--c-blue-deep); text-decoration: none; word-break: break-all; }
.owners { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; } .owners li { display: flex; gap: 10px; align-items: center; } .owners div { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 14px; } .owners .muted { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .owners em { font-style: normal; font-weight: 600; font-size: 14px; }
.more { display: inline-block; margin-top: 10px; font-size: 13.5px; color: var(--c-blue-deep); text-decoration: none; }
.cl { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 8px; } .linkbox { font-size: 12px; }
.btn.sm { font-size: 13.5px; padding: 8px 12px; text-align: center; text-decoration: none; }
.bill { display: flex; flex-direction: column; gap: 10px; } .bill h2 { margin: 0 0 2px; }
.bi { display: flex; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--c-rule); border-radius: 0; text-decoration: none; color: var(--c-ink); transition: border-color .15s; } .bi:hover { border-color: var(--c-blue-deep); }
.bw { display: flex; flex-direction: column; gap: 6px; } .chg { align-self: flex-end; background: none; border: 0; padding: 0; font: inherit; font-size: 13px; font-weight: 500; color: var(--c-blue-deep); cursor: pointer; } .chg:disabled { color: var(--c-muted); cursor: default; }
.bi div { display: flex; flex-direction: column; gap: 2px; font-size: 14px; } .bi .muted { font-size: 12px; } .bi .r { align-items: flex-end; }
.bi em { font-style: normal; font-size: 12px; font-weight: 600; color: var(--c-blue-deep); text-transform: capitalize; } .bi em.paid { color: var(--c-ok); } .bi em.overdue { color: var(--c-danger); }
.facts { display: flex; flex-direction: column; gap: 12px; } .facts h2 { margin: 0; } .facts label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); } .facts small { font-size: 12px; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .top { flex-direction: column; } .stages button { padding: 8px 10px; font-size: 12.5px; } }
.mute { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; font: inherit; font-size: 13px; background: #fff; border: 1px solid var(--c-rule-strong); border-radius: 0; padding: 5px 12px 5px 6px; cursor: pointer; color: var(--c-ink); }
.mute .sw { width: 30px; height: 18px; border-radius: 0; background: var(--c-ok); position: relative; transition: background .15s; } .mute .sw i { position: absolute; top: 2px; left: 14px; width: 14px; height: 14px; border-radius: 0; background: #fff; transition: left .15s; }
.mute.off { color: var(--c-danger); border-color: rgba(180,35,24,.35); background: #fff7f6; } .mute.off .sw { background: #c9c5ba; } .mute.off .sw i { left: 2px; }
.vis { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; } .vt { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; } .vt:disabled { color: var(--c-muted); }
.od .odh { display: flex; justify-content: space-between; align-items: center; gap: 10px; } .od .odh h2 { margin: 0; }
.src { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 0; background: #eef4ff; color: #2c5cc5; } .src.cl { background: #e6f6fa; color: #0e7490; }
.odby { margin: 6px 0 16px; font-size: 13px; color: var(--c-muted); } .odby a { color: var(--c-blue-deep); text-decoration: none; }
.odco { display: flex; gap: 14px; align-items: flex-start; padding: 14px; background: var(--c-paper-2); border-radius: 0; margin-bottom: 14px; }
.mono { flex: none; width: 44px; height: 44px; border-radius: 0; background: var(--c-navy); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 15px; }
.odci { display: flex; flex-direction: column; gap: 4px; min-width: 0; } .odci .lbl { font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--c-muted); font-weight: 600; } .odci b { font-size: 17px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; } .tg { font-size: 12px; padding: 3px 9px; border-radius: 0; background: #fff; border: 1px solid var(--c-rule); color: var(--c-ink-soft); }
.tg.chk { border-color: transparent; background: #f1f0ec; color: var(--c-muted); } .tg.chk[data-c="available"] { background: #e8f0f8; color: #235278; } .tg.chk[data-c="taken"] { background: #fdecef; color: #b4234a; } .tg.chk[data-c="similar"], .tg.chk[data-c="unknown"] { background: #fff6e6; color: #a5650b; }
.bk { font-size: 12.5px; color: var(--c-muted); }
.odl { display: grid; grid-template-columns: 130px 1fr; gap: 12px 16px; margin: 0; } .odl dt { font-size: 13px; color: var(--c-muted); padding-top: 4px; } .odl dd { margin: 0; font-size: 14px; }
.own { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; } .own li { display: grid; grid-template-columns: 28px minmax(0, 1fr) 120px 44px; gap: 10px; align-items: center; } .on { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.av.xs { width: 28px; height: 28px; font-size: 11px; background: var(--c-blue-deep); } .bar { height: 6px; border-radius: 0; background: var(--c-paper-2); overflow: hidden; } .bar i { display: block; height: 100%; background: var(--c-blue-deep); border-radius: 0; } .own b { text-align: right; font-variant-numeric: tabular-nums; }
.vo { display: flex; gap: 6px; align-items: center; } .vo svg { width: 16px; height: 16px; color: var(--c-blue-deep); flex: none; }
.nq { margin: 0; padding: 8px 12px; border-left: 3px solid var(--c-rule-strong); background: #fbfaf7; white-space: pre-wrap; color: var(--c-ink-soft); line-height: 1.55; }
@media (max-width: 640px) { .odl { grid-template-columns: 1fr; gap: 4px; } .odl dd { margin-bottom: 10px; } .own li { grid-template-columns: 28px 1fr 44px; } .own .bar { display: none; } }
.odr { display: flex; gap: 10px; align-items: center; } .lk2 { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.oef { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; margin: 12px 0 16px; padding: 14px; border: 1px solid var(--c-rule); border-radius: 0; background: #fbfaf7; } .oef .w2 { grid-column: 1 / -1; } .oef .label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--c-muted); }
.oeh { grid-column: 1 / -1; margin: 4px 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--c-muted); } .oea { display: flex; justify-content: flex-end; gap: 8px; }
.voa { display: block; font-style: normal; font-size: 13px; color: var(--c-muted); margin-top: 2px; } .vo { align-items: flex-start; } .h3e { display: flex; justify-content: space-between; align-items: baseline; } .pre { white-space: pre-line; }
.agc { display: flex; flex-direction: column; gap: 6px; } .agh { display: flex; justify-content: space-between; align-items: baseline; } .agh h2 { margin: 0; } .agr { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--c-rule); } .agr > span { flex: 1; display: flex; flex-direction: column; min-width: 0; } .agr b { font-weight: 500; font-size: 14px; } .agr em { font-style: normal; font-size: 12px; color: var(--c-muted); } .agr.pending em { color: #a5650b; }
.agc .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; text-align: left; } .agc .lk.red { color: var(--c-danger); font-size: 12.5px; }
.agf { display: flex; flex-direction: column; gap: 12px; } .agf label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .agf input, .agf textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .agf small { color: var(--c-muted); font-size: 12px; } .agf .chk { flex-direction: row; align-items: center; gap: 8px; } .agf .chk input { width: auto; } .agf .muted { margin: 0; font-size: 13px; }
</style>
