<script setup lang="ts">
// A services job: what was ordered, the customer and their company, files, activity and billing.
import { intakeKindFor } from '~/shared/intake'
import { mdRender } from '~/shared/markdown'
const id = useRoute().params.id as string
interface Job { codes?: string[]; id: string; title: string; service: string; description: string | null; status: string; priority: string; due_date: string | null; fee_usd: string | null; owner_id: string | null; company_id: string | null; created_at: string; link_active: boolean | null; client_token_expires: string | null; client_id: string; client: string; contact_name: string; email: string; phone: string | null; country: string | null }
interface Ev { id: string; kind: string; body: string | null; from_status: string | null; to_status: string | null; visible_to_client: boolean; created_at: string; by_name: string | null; document_id: string | null; document_title: string | null; document_mime: string | null; document_size: number | null }
interface Person { id: string; name: string; email: string | null; role: string; ownership_pct: number | null; company: string | null }
interface Company { id: string; name: string; entity_type: string; jurisdiction: string | null; country: string | null; status: string | null; ein: string | null; formation_date: string | null }
interface Inv { id: string; number: string; currency: string; amount: string; tax_amount: string; status: string; paid_via: string | null; issue_date: string; overdue: boolean }
const { data, error, refresh } = await useFetch<{ job: Job; events: Ev[]; companies: { id: string; name: string }[]; invoices: Inv[]; wallet: { currency: string; balance_minor: number } | null; people: Person[]; company: Company | null; items: { code: string; name: string; billing: string }[] }>('/api/services/' + id)
const { data: team } = await useFetch<{ id: string; name: string }[]>('/api/pipeline/people')
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
const hasIntake = computed(() => !!intakeKindFor(job.value.codes ?? [], job.value.service))
useHead({ title: () => (data.value ? heading.value : 'Job') })

const busy = ref(false), msg = ref(''), ok = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function run(fn: () => Promise<unknown>) { busy.value = true; msg.value = ''; ok.value = ''; try { await fn(); await refresh() } catch (e) { msg.value = errText(e) } finally { busy.value = false } }

const tellClient = ref(true)
const setStatus = (s: string) => run(async () => {
  const note = s === 'waiting_client' ? prompt('What do you need from the client? (sent to them)') ?? '' : ''
  const r = await $fetch<{ emailed: boolean }>('/api/services/' + id + '/events', { method: 'POST', body: { kind: 'status', status: s, body: note || undefined, visible_to_client: tellClient.value } })
  if (tellClient.value) ok.value = r.emailed ? 'Status changed. Client emailed.' : 'Status changed; the client email did not send.'
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
  ok.value = toClient ? (emailed ? 'Sent to the client' + (n ? ' with ' + n + ' attachment' + (n === 1 ? '' : 's') : '') + '.' : 'Saved; the client email did not send.') : 'Note added' + (n ? ' with ' + n + ' file' + (n === 1 ? '' : 's') : '') + '.'
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
  ok.value = (r.files === 1 ? 'File uploaded' : r.files + ' files uploaded') + (up.share ? (r.emailed ? ' and shared with the client.' : '; the client email did not send.') : '.')
  up.files = []; up.note = ''; if (fileInput.value) fileInput.value.value = ''
})
async function openDoc(docId: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + docId + '/download'); window.open(r.url, '_blank') } catch (e) { msg.value = errText(e) } }
const size = (b: number | null) => (b == null ? '' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')
const ext = (e: Ev) => (e.document_mime?.includes('pdf') ? 'PDF' : e.document_mime?.startsWith('image/') ? 'IMG' : e.document_mime?.includes('sheet') || e.document_mime?.includes('excel') || e.document_mime?.includes('csv') ? 'XLS' : e.document_mime?.includes('word') ? 'DOC' : 'FILE')

// Charge an unpaid invoice to the client's Finvry wallet.
const canCharge = (i: Inv) => !!data.value?.wallet && data.value.wallet.currency === i.currency && data.value.wallet.balance_minor >= Math.round(Number(i.amount) * 100)
const charge = (i: Inv) => { if (!confirm('Charge ' + fmtMoney(i.amount, i.currency) + ' for ' + i.number + ' to the client wallet? The client gets a receipt.')) return; return run(async () => { await $fetch('/api/services/invoices/' + i.id + '/action', { method: 'POST', body: { action: 'charge_wallet' } }); ok.value = i.number + ' paid from the client wallet. Receipt emailed.' }) }
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
const linkify = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/(https?:\/\/[^\s<]+)/g, (u) => '<a href="' + u + '" target="_blank" rel="noopener">' + (u.length > 60 ? u.slice(0, 57) + '…' : u) + '</a>')
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
      <label class="tell"><input v-model="tellClient" type="checkbox"> Email the client when the status changes</label>
    </div>
    <p v-if="msg" class="flash error" role="alert">{{ msg }}</p><p v-if="ok" class="flash ok" role="status">{{ ok }}</p>

    <div class="grid">
      <div class="col">
        <RaiseBrief v-if="job.codes?.includes('fundraising')" :job-id="id" />
        <div v-else-if="notes" class="card">
          <h2>Order details</h2>
          <p class="notes" v-html="linkify(notes)" />
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
              <div class="ur"><label class="chk"><input v-model="up.share" type="checkbox"> Share with the client and email them</label>
                <button class="btn" type="submit" :disabled="busy">{{ busy ? 'Uploading…' : 'Upload ' + (up.files.length === 1 ? 'file' : up.files.length + ' files') }}</button></div>
            </template>
          </form>
          <ul v-if="files.length" class="files">
            <li v-for="f in files" :key="f.id">
              <span class="ft" :data-t="ext(f)">{{ ext(f) }}</span>
              <div class="fi"><button v-if="f.document_id" type="button" class="link" @click="openDoc(f.document_id)">{{ f.document_title }}</button><span v-else>{{ f.document_title }}</span>
                <span class="muted">{{ f.kind === 'client_document' ? 'From the client' : (f.by_name ?? 'Team') }} · {{ when(f.created_at) }}<template v-if="f.document_size"> · {{ size(f.document_size) }}</template></span>
                <span v-if="f.body" class="fnote">{{ f.body }}</span></div>
              <span v-if="f.kind === 'client_document'" class="tag cl">Client upload</span><span v-else-if="f.visible_to_client" class="tag">Shared</span><span v-else class="tag int">Team only</span>
            </li>
          </ul>
        </div>

        <div class="card">
          <h2>Activity</h2>
          <form class="ev" :class="ev.kind" @submit.prevent="addEvent" @keydown="composerKey">
            <div class="tabs"><button v-for="k in (['message', 'note'] as const)" :key="k" type="button" :class="{ on: ev.kind === k }" @click="ev.kind = k">{{ k === 'message' ? 'Message client' : 'Internal note' }}</button></div>
            <p class="who2">{{ ev.kind === 'message' ? 'To ' + (job.contact_name || job.client) + ' · ' + job.email + ' — they see it on their job page and get an email.' : 'Only your team sees internal notes.' }}</p>
            <ClientOnly>
              <RichEditor v-model="ev.body" compact minimal :min-height="150" :max-length="5000" :placeholder="ev.kind === 'message' ? 'Write to the client… use the toolbar for bold, lists and links' : 'Write a note for the team…'" />
              <template #fallback><div class="edfb" /></template>
            </ClientOnly>
            <ul v-if="ev.files.length" class="queue"><li v-for="(f, k) in ev.files" :key="k"><span>📎 {{ f.name }}</span><em>{{ size(f.size) }}</em><button type="button" aria-label="Remove" @click="ev.files.splice(k, 1)">×</button></li></ul>
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
              <p v-if="e.body && e.kind === 'client_message'" class="b">{{ e.body }}</p>
              <div v-else-if="e.body" class="b md" v-html="rich(e.body)" />
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
            <h3>Company</h3>
            <ul class="kv">
              <li><span>Name</span><b>{{ data.company.name }}</b></li>
              <li><span>Type</span>{{ TYPES[data.company.entity_type] ?? data.company.entity_type }}</li>
              <li><span>Registered in</span>{{ [data.company.jurisdiction, data.company.country].filter(Boolean).join(', ') || '—' }}</li>
              <li v-if="data.company.status"><span>Status</span><span class="cap">{{ data.company.status }}</span></li>
              <li v-if="data.company.ein"><span>EIN</span>{{ data.company.ein }}</li>
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
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Job not found.' : 'Could not load this job.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 14px; color: var(--c-muted); text-decoration: none; font-size: 14px; }
.top { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }
.tl1 { min-width: 0; flex: 1; }
.eyebrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 6px; font-size: 13px; color: var(--c-muted); }
.eyebrow a { color: var(--c-muted); text-decoration: none; } .eyebrow a:hover { color: var(--c-navy); text-decoration: underline; } .dot { opacity: .6; }
.pill { margin-left: 6px; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--c-paper-2); color: var(--c-ink-soft); }
.pill[data-s="new"] { background: #eef4ff; color: #2c5cc5; } .pill[data-s="in_progress"] { background: #fff6e6; color: #a5650b; } .pill[data-s="waiting_client"] { background: #fdecef; color: #b4234a; } .pill[data-s="completed"] { background: #e9f6ee; color: #23784a; } .pill[data-s="cancelled"] { background: var(--c-paper-2); color: var(--c-muted); }
h1 { margin: 0; font-size: clamp(24px, 2.6vw, 32px); line-height: 1.15; letter-spacing: -.02em; }
.sub { margin: 6px 0 0; color: var(--c-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; } .chip { font-size: 13px; padding: 5px 11px; border: 1px solid var(--c-rule-strong); border-radius: 999px; background: #fff; color: var(--c-ink); }
.meta { display: flex; flex-wrap: wrap; gap: 6px 32px; margin: 16px 0 0; } .meta div { display: flex; flex-direction: column; gap: 2px; } .meta dt { font-size: 12px; color: var(--c-muted); } .meta dd { margin: 0; font-size: 14px; font-weight: 500; }
.cap { text-transform: capitalize; }
.statusbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 20px; margin: 22px 0 6px; padding: 12px 0; border-top: 1px solid var(--c-rule); border-bottom: 1px solid var(--c-rule); }
.stages { display: flex; flex-wrap: wrap; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 8px; overflow: hidden; }
.stages button { font: inherit; font-size: 13px; padding: 8px 14px; background: #fff; border: 0; border-right: 1px solid var(--c-rule); cursor: pointer; color: var(--c-ink-soft); }
.stages button:last-child { border-right: 0; } .stages button.on { background: var(--c-navy); color: #fff; } .stages button:disabled { cursor: default; } .stages button:not(:disabled):hover { background: var(--c-paper-2); }
.tell { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--c-muted); } .tell input { width: auto; }
.flash { margin: 10px 0 0; font-size: 14px; }
.grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr); gap: 20px; align-items: start; margin-top: 18px; }
.col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.card { border-radius: 10px; } h2 { margin: 0 0 12px; font-size: 17px; } h3 { margin: 18px 0 8px; font-size: 13px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; letter-spacing: .04em; }
.ch { display: flex; justify-content: space-between; align-items: baseline; } .ch h2 { margin-bottom: 4px; }
.notes { margin: 0; white-space: pre-wrap; line-height: 1.6; color: var(--c-ink-soft); } .notes :deep(a) { color: var(--c-blue-deep); word-break: break-all; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; border-radius: 6px; }
textarea { resize: vertical; }
.muted { color: var(--c-muted); } .small0 { font-size: 13px; margin: 0; } .hint { font-size: 13px; margin: 0 0 12px; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
.upl { display: flex; flex-direction: column; gap: 10px; }
.drop { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 22px; border: 1.5px dashed var(--c-rule-strong); border-radius: 10px; cursor: pointer; text-align: center; background: var(--c-paper-2); transition: border-color .15s, background .15s; }
.drop:hover, .drop.over { border-color: var(--c-blue-deep); background: #f2f7fc; } .drop .ico { width: 34px; height: 34px; border-radius: 50%; background: #fff; border: 1px solid var(--c-rule); display: grid; place-items: center; font-weight: 700; color: var(--c-blue-deep); margin-bottom: 4px; } .drop .muted { font-size: 12.5px; }
.queue { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; } .queue li { display: flex; gap: 10px; align-items: center; font-size: 13.5px; padding: 6px 10px; background: var(--c-paper-2); border-radius: 6px; } .queue span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .queue em { font-style: normal; color: var(--c-muted); font-size: 12px; } .queue button { background: none; border: 0; font-size: 18px; color: var(--c-muted); cursor: pointer; }
.ur { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .chk input { width: auto; }
.files { list-style: none; margin: 16px 0 0; padding: 0; border-top: 1px solid var(--c-rule); }
.files li { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--c-rule); }
.ft { flex: none; width: 40px; height: 44px; border-radius: 6px; display: grid; place-items: center; font-size: 10.5px; font-weight: 700; letter-spacing: .03em; color: #fff; background: #7b8794; }
.ft[data-t="PDF"] { background: #d0473d; } .ft[data-t="DOC"] { background: #2f6fd6; } .ft[data-t="XLS"] { background: #23854f; } .ft[data-t="IMG"] { background: #8a5cd1; }
.fi { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 14px; } .fi .muted { font-size: 12.5px; } .fnote { font-size: 13px; color: var(--c-ink-soft); white-space: pre-wrap; }
.link { background: none; border: 0; padding: 0; font: inherit; font-weight: 500; color: var(--c-blue-deep); cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; }
.tag { flex: none; font-size: 11px; font-weight: 600; color: var(--c-blue-deep); background: #eef4f9; padding: 2px 8px; border-radius: 999px; } .tag.int { color: var(--c-muted); background: var(--c-paper-2); } .tag.cl { color: #0e7490; background: #e6f6fa; }
.ev { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--c-rule); }
.ev.note :deep(.re) { background: #fffbeb; } .ev.note :deep(.re .ProseMirror) { background: #fffbeb; }
.who2 { margin: 0; font-size: 12.5px; color: var(--c-muted); }
.edfb { height: 190px; border: 1px solid var(--c-rule-strong); border-radius: 6px; background: #fff; }
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
.bi { display: flex; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--c-rule); border-radius: 8px; text-decoration: none; color: var(--c-ink); transition: border-color .15s; } .bi:hover { border-color: var(--c-blue-deep); }
.bw { display: flex; flex-direction: column; gap: 6px; } .chg { align-self: flex-end; background: none; border: 0; padding: 0; font: inherit; font-size: 13px; font-weight: 500; color: var(--c-blue-deep); cursor: pointer; } .chg:disabled { color: var(--c-muted); cursor: default; }
.bi div { display: flex; flex-direction: column; gap: 2px; font-size: 14px; } .bi .muted { font-size: 12px; } .bi .r { align-items: flex-end; }
.bi em { font-style: normal; font-size: 12px; font-weight: 600; color: var(--c-blue-deep); text-transform: capitalize; } .bi em.paid { color: var(--c-ok); } .bi em.overdue { color: var(--c-danger); }
.facts { display: flex; flex-direction: column; gap: 12px; } .facts h2 { margin: 0; } .facts label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); } .facts small { font-size: 12px; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .top { flex-direction: column; } .stages button { padding: 8px 10px; font-size: 12.5px; } }
</style>
