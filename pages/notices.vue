<script setup lang="ts">
// Mail notices forwarded from Gmail: summary, deadline, action; mark done or turn into a compliance reminder.
useHead({ title: 'Notices' })
interface R { id: string; from_name: string | null; from_email: string | null; subject: string; received_at: string; status: string; summary: string | null; action: string | null; due_date: string | null; entity_id: string | null; entity: string | null; files: number; needs_action?: boolean }
interface N extends R { to_email: string | null; text_body: string | null; html_body: string | null; attachments: { doc_id: string; name: string; mime: string; size: number }[] }
const route = useRoute(), router = useRouter()
const status = ref(String(route.query.status ?? 'new')), q = ref(String(route.query.q ?? '')), entity = ref(String(route.query.entity ?? '')), need = ref(String(route.query.need ?? ''))
const page = ref(Number(route.query.page) || 1), size = ref(25)
const qd = ref(q.value); let qt: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => { clearTimeout(qt); qt = setTimeout(() => { qd.value = v.trim(); page.value = 1 }, 300) })
watch([status, entity, need, size], () => { page.value = 1; sel.value = [] })
watch([status, qd, entity, need, page], () => router.replace({ query: { status: status.value !== 'new' ? status.value : undefined, q: qd.value || undefined, entity: entity.value || undefined, need: need.value || undefined, page: page.value > 1 ? page.value : undefined } }))
const { data, refresh, pending } = await useFetch<{ rows: R[]; total: number; page: number; pages: number; size: number; counts: { status: string; n: number }[]; open: { overdue: number; soon: number; action: number }; webhook: string | null; settings: { mailboxes: string[]; senders: string[] }; can_edit: boolean }>('/api/notices', { query: { status, q: qd, entity, need, page, size } })
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
const cnt = (s: string) => data.value?.counts.find((c) => c.status === s)?.n ?? 0
const filtered = computed(() => !!(qd.value || entity.value || need.value))
function clearFilters() { q.value = ''; qd.value = ''; entity.value = ''; need.value = '' }
function focusNeed(n: string) { status.value = 'new'; need.value = need.value === n ? '' : n }
const from = computed(() => (data.value ? (data.value.page - 1) * data.value.size + 1 : 0)), to = computed(() => (data.value ? Math.min(data.value.total, data.value.page * data.value.size) : 0))
// Selection and bulk actions (this page only).
const sel = ref<string[]>([])
const allOn = computed(() => !!data.value?.rows.length && data.value.rows.every((r) => sel.value.includes(r.id)))
function toggleAll() { sel.value = allOn.value ? [] : (data.value?.rows ?? []).map((r) => r.id) }
const okMsg = ref('')
async function bulk(s: string) { const n = sel.value.length; await $fetch('/api/notices/bulk', { method: 'POST', body: { ids: sel.value, status: s } }); sel.value = []; okMsg.value = n + ' notice' + (n === 1 ? '' : 's') + (s === 'done' ? ' marked done.' : s === 'archived' ? ' archived.' : ' moved back to New.'); await refresh() }
// One notice.
const open = ref<N | null>(null); const showHtml = ref(false); const saving = ref('')
async function view(r: R) { open.value = await $fetch<N>('/api/notices/' + r.id); showHtml.value = false; rmOpen.value = false; Object.assign(rm, { title: r.subject.slice(0, 200), recurrence: 'none' }); det.entity_id = r.entity_id ?? ''; det.due = r.due_date ?? ''; msg.value = '' }
const det = reactive({ entity_id: '', due: '' })
async function saveDet(k: 'entity_id' | 'due_date') { if (!open.value) return; saving.value = k; try { await $fetch('/api/notices/' + open.value.id, { method: 'POST', body: k === 'entity_id' ? { entity_id: det.entity_id || null } : { due_date: det.due } }); await refresh() } finally { saving.value = '' } }
async function setStatus(s: string) { if (!open.value) return; await $fetch('/api/notices/' + open.value.id, { method: 'POST', body: { status: s } }); open.value = null; await refresh() }
const rm = reactive({ title: '', recurrence: 'none' }); const rmOpen = ref(false); const msg = ref('')
async function remind() { msg.value = ''; try { await $fetch('/api/notices/' + open.value!.id, { method: 'POST', body: { reminder: { title: rm.title, recurrence: rm.recurrence, entity_id: det.entity_id, due: det.due } } }); open.value = null; okMsg.value = 'Reminder added under Compliance; the notice is marked done.'; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Choose a company and a due date.' } }
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const shortDate = (s: string) => { const d = new Date(s), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) }
const dueLabel = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const days = (d: string | null) => (d ? Math.round((new Date(d + 'T00:00:00Z').getTime() - Date.now()) / 86400e3) : null)
const dueTone = (d: string) => { const n = days(d) ?? 99; return n < 0 ? 'red' : n <= 14 ? 'amber' : '' }
const dueNote = (d: string) => { const n = days(d) ?? 0; return n < 0 ? Math.abs(n) + (n === -1 ? ' day' : ' days') + ' overdue' : n === 0 ? 'today' : 'in ' + n + ' day' + (n === 1 ? '' : 's') }
// The email text, readable: links shortened to their site, everything else escaped.
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const bodyHtml = computed(() => {
  const t = (open.value?.text_body || '(no text)').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
  return esc(t).replace(/&lt;(https?:\/\/[^\s&]+(?:&amp;[^\s&]+)*)&gt;|(https?:\/\/[^\s<]+)/g, (_m, a: string, b2: string) => { const url = (a || b2).replace(/&amp;/g, '&'); let host = url; try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep */ } return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(host) + ' ↗</a>' })
})
const setup = ref(false); const copiedS = ref(false)
const script = computed(() => `// Sends Gmail messages labelled "Aidi notices" to Aidi → Notices. Runs every 10 minutes.
const WEBHOOK = '${data.value?.webhook ?? 'PASTE-THE-AIDI-WEBHOOK-URL'}'
const LABEL = 'Aidi notices'
function sendToAidi() {
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL)
  const sent = GmailApp.getUserLabelByName(LABEL + '/sent') || GmailApp.createLabel(LABEL + '/sent')
  label.getThreads(0, 20).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      const from = m.getFrom(), email = (from.match(/<([^>]+)>/) || [null, from])[1], name = from.replace(/<.*>/, '').replace(/"/g, '').trim()
      const files = m.getAttachments({ includeInlineImages: false }).filter(function (a) { return a.getSize() < 10e6 }).slice(0, 10)
        .map(function (a) { return { filename: a.getName(), contentType: a.getContentType(), content: Utilities.base64Encode(a.getBytes()) } })
      const res = UrlFetchApp.fetch(WEBHOOK, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ message_id: m.getId(), from: email, from_name: name, to: m.getTo(), subject: m.getSubject(), text: m.getPlainBody(), html: m.getBody(), attachments: files }) })
      if (res.getResponseCode() >= 300) throw new Error('Aidi said ' + res.getResponseCode() + ': ' + res.getContentText())
    })
    thread.removeLabel(label); thread.addLabel(sent)
  })
}`)
// Mailboxes and senders (admins can change them; everything below uses what is saved).
const cfg = reactive({ mailboxes: [] as string[], senders: [] as string[], mb: '', sd: '', busy: false, msg: '', ok: false })
watchEffect(() => { if (data.value?.settings && !cfg.mailboxes.length && !cfg.senders.length) { cfg.mailboxes = [...data.value.settings.mailboxes]; cfg.senders = [...data.value.settings.senders] } })
const filterQuery = computed(() => (data.value?.settings.senders ?? []).join(' OR '))
const mailboxText = computed(() => { const m = data.value?.settings.mailboxes ?? []; return m.length > 1 ? m.slice(0, -1).join(', ') + ' and ' + m[m.length - 1] : m[0] ?? 'your mailbox' })
const dirty = computed(() => JSON.stringify(cfg.mailboxes) !== JSON.stringify(data.value?.settings.mailboxes) || JSON.stringify(cfg.senders) !== JSON.stringify(data.value?.settings.senders))
function addTo(list: 'mailboxes' | 'senders') {
  const raw = (list === 'mailboxes' ? cfg.mb : cfg.sd).split(/[\s,;]+/).map((x) => x.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)
  for (const x of raw) if (!cfg[list].includes(x)) cfg[list].push(x)
  if (list === 'mailboxes') cfg.mb = ''; else cfg.sd = ''
  cfg.ok = false
}
async function saveCfg() {
  cfg.busy = true; cfg.msg = ''; cfg.ok = false
  try { await $fetch('/api/notices/settings', { method: 'POST', body: { mailboxes: cfg.mailboxes, senders: cfg.senders } }); await refresh(); cfg.ok = true }
  catch (e) { cfg.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { cfg.busy = false }
}
async function copyFilter() { await navigator.clipboard.writeText(filterQuery.value); copiedF.value = true; setTimeout(() => (copiedF.value = false), 1500) }
const copiedF = ref(false)
async function copyScript() { await navigator.clipboard.writeText(script.value); copiedS.value = true; setTimeout(() => (copiedS.value = false), 1500) }
</script>
<template>
  <section v-if="data" class="nt">
    <p class="label">Family Office</p>
    <div class="head"><div><h1>Notices</h1><p class="lead">Official emails from your inbox (registered agent, state, tax, banks), summarised with any deadline. Turn the ones that matter into compliance reminders.</p></div><button class="btn secondary" @click="setup = true">Gmail setup</button></div>
    <div class="fx-stats">
      <StatTile label="New" :value="cnt('new')" icon="inbox" tone="n" clickable :on="status === 'new' && !need" @click="status = 'new'; need = ''" />
      <StatTile label="Overdue" :value="data.open.overdue" icon="alert" tone="r" :red="data.open.overdue > 0" note="Deadline passed, still open" clickable :on="need === 'overdue'" @click="focusNeed('overdue')" />
      <StatTile label="Due in 14 days" :value="data.open.soon" icon="calendar" tone="a" note="Open notices with a deadline" clickable :on="need === 'soon'" @click="focusNeed('soon')" />
      <StatTile label="Need action" :value="data.open.action" icon="check" tone="b" note="Open notices asking for something" clickable :on="need === 'action'" @click="focusNeed('action')" />
    </div>
    <nav class="tabs"><button v-for="[k, l] in [['new', 'New'], ['done', 'Done'], ['archived', 'Archived'], ['all', 'All']]" :key="k" :class="{ on: status === k }" @click="status = k">{{ l }}<em v-if="k !== 'all'">{{ cnt(k) }}</em></button></nav>
    <div class="tools">
      <div class="srch"><input v-model="q" type="search" placeholder="Search sender, subject or summary" aria-label="Search notices"><button v-if="q" type="button" class="clr" aria-label="Clear search" @click="q = ''">×</button></div>
      <select v-model="entity" aria-label="Company"><option value="">All companies</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select>
      <select v-model="need" aria-label="Show"><option value="">All notices</option><option value="action">Needs action</option><option value="due">Has a deadline</option><option value="soon">Due in 14 days</option><option value="overdue">Overdue</option></select>
      <span class="rc">{{ data.total ? from + '–' + to + ' of ' + data.total : '' }}<button v-if="filtered" class="lk" @click="clearFilters">Clear filters</button></span>
    </div>
    <p v-if="okMsg" class="okm">{{ okMsg }}</p>
    <div v-if="sel.length" class="bulk"><b>{{ sel.length }} selected</b><button class="btn secondary sm" @click="bulk('done')">Mark done</button><button class="btn secondary sm" @click="bulk('archived')">Archive</button><button v-if="status !== 'new'" class="btn secondary sm" @click="bulk('new')">Move to New</button><button class="lk" @click="sel = []">Clear</button></div>
    <div v-if="data.rows.length" class="box" :class="{ dim: pending }">
      <table data-nosearch><thead><tr><th class="ck"><input type="checkbox" :checked="allOn" aria-label="Select all on this page" @change="toggleAll"></th><th>From and subject</th><th class="co">Company</th><th class="du">Deadline</th><th class="rd">Received</th></tr></thead>
        <tbody><tr v-for="r in data.rows" :key="r.id" :class="{ unread: r.status === 'new' }" @click="view(r)">
          <td class="ck" @click.stop><input v-model="sel" type="checkbox" :value="r.id" :aria-label="'Select ' + r.subject"></td>
          <td class="mn"><span class="fr"><i v-if="r.status === 'new'" class="dot" aria-label="New" />{{ r.from_name || r.from_email }}<span v-if="r.files" class="fc">· {{ r.files }} file{{ r.files === 1 ? '' : 's' }}</span></span>
            <span class="sj">{{ r.subject }}</span><span v-if="r.summary" class="sm">{{ r.summary }}</span>
            <span v-if="r.needs_action" class="ac">Action: {{ r.action }}</span></td>
          <td class="co">{{ r.entity ?? '—' }}</td>
          <td class="du"><template v-if="r.due_date"><span class="dd" :class="dueTone(r.due_date)">{{ dueLabel(r.due_date) }}</span><em>{{ dueNote(r.due_date) }}</em></template><span v-else class="mut">—</span></td>
          <td class="rd">{{ shortDate(r.received_at) }}</td></tr></tbody></table>
      <div v-if="data.total > 25" class="pg"><span>{{ from }}–{{ to }} of {{ data.total }}</span><label>Show <select v-model.number="size"><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></label>
        <button class="btn secondary sm" :disabled="data.page <= 1" @click="page = data.page - 1">‹ Prev</button><span>Page {{ data.page }} of {{ data.pages }}</span><button class="btn secondary sm" :disabled="data.page >= data.pages" @click="page = data.page + 1">Next ›</button></div>
    </div>
    <EmptyState v-else-if="filtered" card icon="empty" title="No notices match" text="Try another search or filter."><button class="btn secondary" @click="clearFilters">Clear filters</button></EmptyState>
    <EmptyState v-else card icon="cs_inbox" :title="status === 'new' ? 'No new notices' : 'Nothing here'" :text="'Label notices in Gmail (emails from ' + (data.settings.senders.slice(0, 3).join(', ') || 'your registered agent and state') + ' and others to ' + mailboxText + ') and they appear here with a summary and deadline.'"><button class="btn" @click="setup = true">Gmail setup</button></EmptyState>

    <AppModal :open="!!open" xl @close="open = null">
      <template #head><div v-if="open" class="mh"><span class="mf"><b>{{ open.from_name || open.from_email }}</b><span>{{ open.from_email }} · {{ when(open.received_at) }}{{ open.to_email ? ' · to ' + open.to_email : '' }}</span></span><h2>{{ open.subject }}</h2></div></template>
      <div v-if="open" class="nv">
        <div class="nm">
          <div v-if="open.summary" class="sumc"><span class="k">Summary</span><p>{{ open.summary }}</p>
            <dl><template v-if="open.action"><dt>Action</dt><dd>{{ open.action }}</dd></template><template v-if="open.due_date"><dt>Deadline</dt><dd>{{ dueLabel(open.due_date) }} ({{ dueNote(open.due_date) }})</dd></template></dl></div>
          <div v-if="open.attachments.length" class="att"><span class="k">Attachments</span><a v-for="a in open.attachments" :key="a.doc_id" :href="'/api/notices/' + open.id + '/file/' + a.doc_id" target="_blank" class="fa"><FileBadge :name="a.name" size="sm" /><span>{{ a.name }}</span></a></div>
          <div class="em"><nav class="tabs sm"><button :class="{ on: !showHtml }" @click="showHtml = false">Email text</button><button v-if="open.html_body" :class="{ on: showHtml }" @click="showHtml = true">Original layout</button></nav>
            <iframe v-if="showHtml && open.html_body" sandbox="" :srcdoc="open.html_body" title="Email" class="ifr" /><div v-else class="txt" v-html="bodyHtml" /></div>
        </div>
        <aside class="ns">
          <div class="sb"><span class="k">Status</span><b>{{ open.status === 'new' ? 'New' : open.status === 'done' ? 'Done' : 'Archived' }}</b></div>
          <label class="sb"><span class="k">Company</span><select v-model="det.entity_id" :disabled="saving === 'entity_id'" @change="saveDet('entity_id')"><option value="">Not set</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
          <label class="sb"><span class="k">Deadline</span><input v-model="det.due" type="date" :disabled="saving === 'due_date'" @change="saveDet('due_date')"></label>
          <div class="rmd">
            <button v-if="!rmOpen" class="btn secondary full" type="button" @click="rmOpen = true">Add a compliance reminder</button>
            <template v-else><span class="k">Compliance reminder</span><label class="sb"><span class="k2">Title</span><input v-model="rm.title" maxlength="200"></label>
              <label class="sb"><span class="k2">Repeats</span><select v-model="rm.recurrence"><option value="none">Once</option><option value="annual">Every year</option><option value="quarterly">Every quarter</option><option value="monthly">Every month</option></select></label>
              <p class="mut">Uses the company and deadline above{{ !det.entity_id || !det.due ? ': set both first' : '' }}. Reminders go out 14 days before.</p>
              <div class="rb"><button class="btn sm" :disabled="!det.entity_id || !det.due || !rm.title.trim()" @click="remind">Add and mark done</button><button class="lk" @click="rmOpen = false">Cancel</button></div><p v-if="msg" class="error">{{ msg }}</p></template>
          </div>
        </aside>
      </div>
      <template #foot><DeleteButton v-if="open" type="notice" :id="open.id" :name="open.subject" link @deleted="open = null; refresh()" /><span class="sp" /><button v-if="open?.status !== 'archived'" class="btn secondary" @click="setStatus('archived')">Archive</button><button v-if="open?.status === 'new'" class="btn" @click="setStatus('done')">Mark done</button><button v-else class="btn secondary" @click="setStatus('new')">Move to New</button></template>
    </AppModal>
    <AppModal :open="setup" title="Send notices from Gmail" wide @close="setup = false">
      <div class="cfg">
        <div class="cf"><b>Mailboxes that send notices</b><span class="mut">Each one runs the steps below once.</span>
          <div class="tags"><span v-for="(m, i) in cfg.mailboxes" :key="m" class="tg2">{{ m }}<button v-if="data.can_edit && cfg.mailboxes.length > 1" type="button" :aria-label="'Remove ' + m" @click="cfg.mailboxes.splice(i, 1); cfg.ok = false">×</button></span></div>
          <form v-if="data.can_edit" class="addr" @submit.prevent="addTo('mailboxes')"><input v-model="cfg.mb" type="text" placeholder="name@company.com (several: separate with commas)" aria-label="Add mailbox"><button class="btn secondary sm" :disabled="!cfg.mb.trim()">Add</button></form></div>
        <div class="cf"><b>Senders that count as notices</b><span class="mut">Domains (irs.gov also covers notices.irs.gov) or full addresses. They make up the Gmail filter in step 2.</span>
          <div class="tags"><span v-for="(x, i) in cfg.senders" :key="x" class="tg2">{{ x }}<button v-if="data.can_edit && cfg.senders.length > 1" type="button" :aria-label="'Remove ' + x" @click="cfg.senders.splice(i, 1); cfg.ok = false">×</button></span></div>
          <form v-if="data.can_edit" class="addr" @submit.prevent="addTo('senders')"><input v-model="cfg.sd" type="text" placeholder="e.g. ftb.ca.gov, notices@mercury.com" aria-label="Add sender"><button class="btn secondary sm" :disabled="!cfg.sd.trim()">Add</button></form></div>
        <div v-if="data.can_edit" class="sv"><button class="btn sm" :disabled="cfg.busy || !dirty" @click="saveCfg">{{ cfg.busy ? 'Saving…' : 'Save mailboxes and senders' }}</button><span v-if="cfg.ok" class="mut">Saved. Update the Gmail filter in each mailbox if you changed senders.</span><span v-else-if="dirty" class="mut">Not saved yet.</span><span v-if="cfg.msg" class="error">{{ cfg.msg }}</span></div>
        <p v-else class="mut">Only admins can change these.</p>
      </div>
      <ol class="steps">
        <li><b>One-time setting in DigitalOcean:</b> add <code>NUXT_INBOUND_EMAIL_TOKEN</code> (any long random text) under App → Settings → Environment variables. <span v-if="!data.webhook" class="warn">Not set yet: add it, wait for the redeploy, then reopen this.</span></li>
        <li><b>In Gmail ({{ mailboxText }}), create a filter:</b> Settings → <i>Filters and blocked addresses</i> → <i>Create a new filter</i> → From: <code class="fq">{{ filterQuery }}</code> <button class="lk" type="button" @click="copyFilter">{{ copiedF ? 'Copied' : 'Copy' }}</button> → <i>Create filter</i> → tick <i>Apply the label</i> → new label <code>Aidi notices</code>. Tick "Also apply to matching conversations" to send the existing ones too.</li>
        <li><b>Add the sender script</b> (Google's own Apps Script, free, runs inside your Google account): open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> while signed in to {{ data.settings.mailboxes.length > 1 ? 'each mailbox in turn' : mailboxText }}, delete what's there, paste this, and save:
          <div class="code"><button class="btn secondary sm" @click="copyScript">{{ copiedS ? 'Copied' : 'Copy script' }}</button><pre>{{ script }}</pre></div></li>
        <li><b>Run it once</b> (choose <code>sendToAidi</code> → Run) and allow access when Google asks. Then add a trigger: <i>Triggers</i> (clock icon) → <i>Add trigger</i> → <code>sendToAidi</code> → Time-driven → Minutes timer → Every 10 minutes.</li>
        <li>That's it. Emails that get the <b>Aidi notices</b> label appear here within 10 minutes with a summary and deadline, and are relabelled <i>Aidi notices/sent</i> in Gmail.</li></ol>
    </AppModal>
  </section>
</template>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .head h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; max-width: 720px; }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 0 0 12px; } .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 0; font: inherit; font-size: 14px; color: var(--c-muted); cursor: pointer; } .tabs button.on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .tabs em { font-style: normal; font-size: 12px; margin-left: 6px; color: var(--c-muted); }
.tabs.sm { gap: 18px; margin-bottom: 0; } .tabs.sm button { padding: 8px 0; font-size: 13px; }
.tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; } .srch { position: relative; flex: 1; min-width: 240px; max-width: 420px; } .srch input { width: 100%; padding-right: 30px; } .clr { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: 0; font-size: 18px; color: var(--c-muted); cursor: pointer; }
.rc { margin-left: auto; font-size: 13px; color: var(--c-muted); display: flex; gap: 12px; align-items: center; }
.bulk { display: flex; gap: 10px; align-items: center; background: var(--c-paper-2); padding: 8px 12px; margin-bottom: 8px; font-size: 13.5px; } .okm { font-size: 13.5px; margin: 0 0 8px; }
.box { background: #fff; border: 1px solid var(--c-rule); } .box.dim { opacity: .6; } table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; } td { padding: 12px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } tbody tr { cursor: pointer; } tbody tr:hover { background: #fafaf8; } tbody tr:last-child td { border-bottom: 0; }
.ck { width: 34px; } .co { width: 190px; color: var(--c-ink-soft); } .du { width: 150px; } .rd { width: 90px; text-align: right; color: var(--c-muted); white-space: nowrap; } th.rd { text-align: right; }
.mn { display: flex; flex-direction: column; gap: 3px; min-width: 0; } .fr { font-size: 13px; color: var(--c-ink-soft); display: flex; align-items: center; gap: 6px; } .fc { color: var(--c-muted); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c-navy); display: inline-block; flex: none; }
.sj { font-size: 14px; color: var(--c-ink); } tr.unread .sj { font-weight: 600; }
.sm { font-size: 13px; color: var(--c-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.45; } .ac { font-size: 12.5px; color: var(--c-ink); }
.dd { display: block; font-size: 13px; } .dd.red { color: var(--c-danger); } .dd.amber { color: var(--c-warn); } .du em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.pg { display: flex; gap: 12px; align-items: center; justify-content: flex-end; padding: 10px 14px; border-top: 1px solid var(--c-rule); font-size: 13px; color: var(--c-ink-soft); } .pg select { padding: 4px 6px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .mut { font-size: 12.5px; color: var(--c-muted); margin: 0; } .sp { flex: 1; }
input, select { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; } .error { color: var(--c-danger); margin: 0; font-size: 13px; }
/* The notice */
.mh { display: flex; flex-direction: column; gap: 6px; min-width: 0; } .mh h2 { margin: 0; font-size: 22px; line-height: 1.25; } .mf { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 13px; } .mf span { color: var(--c-muted); }
.nv { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 24px; align-items: start; }
.nm { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.k { display: block; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); margin-bottom: 6px; } .k2 { font-size: 12.5px; color: var(--c-muted); }
.sumc { border: 1px solid var(--c-rule); background: #fbfaf7; padding: 14px 16px; } .sumc p { margin: 0; font-size: 14.5px; line-height: 1.55; } .sumc dl { display: grid; grid-template-columns: 80px 1fr; gap: 6px 12px; margin: 12px 0 0; font-size: 13.5px; } .sumc dt { color: var(--c-muted); } .sumc dd { margin: 0; }
.att { display: flex; flex-direction: column; gap: 6px; } .fa { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--c-blue-deep); text-decoration: none; }
.em { border: 1px solid var(--c-rule); } .em .tabs { padding: 0 14px; } .ifr { width: 100%; height: 520px; border: 0; background: #fff; display: block; }
.txt { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.6; padding: 16px 18px; max-height: 520px; overflow: auto; color: var(--c-ink); } .txt :deep(a) { color: var(--c-blue-deep); text-decoration: none; border-bottom: 1px solid var(--c-rule-strong); white-space: nowrap; }
.ns { display: flex; flex-direction: column; gap: 14px; border-left: 1px solid var(--c-rule); padding-left: 20px; position: sticky; top: 0; } .sb { display: flex; flex-direction: column; gap: 4px; } .sb b { font-weight: 500; font-size: 14px; } .sb input, .sb select { width: 100%; }
.rmd { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--c-rule); padding-top: 14px; } .btn.full { width: 100%; } .rb { display: flex; gap: 12px; align-items: center; }
@media (max-width: 860px) { .nv { grid-template-columns: 1fr; } .ns { border-left: 0; padding-left: 0; border-top: 1px solid var(--c-rule); padding-top: 14px; position: static; } .co, .du { display: none; } }
.steps { display: flex; flex-direction: column; gap: 12px; padding-left: 18px; font-size: 13.5px; line-height: 1.55; } .code { position: relative; margin-top: 8px; } .code pre { background: #0c1a2e; color: #e6edf6; padding: 12px; font-size: 11.5px; overflow-x: auto; max-height: 260px; margin: 0; } .code .btn { position: absolute; top: 6px; right: 6px; } .lnk { display: flex; gap: 8px; align-items: center; background: var(--c-signal-soft); padding: 8px; margin: 6px 0; } .lnk code { flex: 1; font-size: 12px; word-break: break-all; } code { background: var(--c-paper-2); padding: 1px 5px; font-size: 12.5px; } .warn { color: var(--c-warn); margin: 6px 0; }
@media (max-width: 800px) { .g3 { grid-template-columns: 1fr; } }
.cfg { display: flex; flex-direction: column; gap: 14px; border: 1px solid var(--c-rule); background: #fbfaf7; padding: 14px 16px; margin-bottom: 14px; } .cf { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; } .mut { font-size: 12.5px; color: var(--c-muted); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; } .tg2 { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid var(--c-rule-strong); padding: 3px 8px; font-size: 13px; } .tg2 button { background: none; border: 0; padding: 0; font: inherit; font-size: 15px; line-height: 1; color: var(--c-muted); cursor: pointer; } .tg2 button:hover { color: var(--c-danger); }
.addr { display: flex; gap: 8px; } .addr input { flex: 1; } .sv { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; } .fq { word-break: break-word; }
</style>
