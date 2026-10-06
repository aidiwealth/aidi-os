<script setup lang="ts">
// Mail notices forwarded from Gmail: summary, deadline, action; mark done or turn into a compliance reminder.
useHead({ title: 'Notices' })
interface R { id: string; from_name: string | null; from_email: string | null; subject: string; received_at: string; status: string; summary: string | null; action: string | null; due_date: string | null; entity_id: string | null; entity: string | null; files: number }
interface N extends R { to_email: string | null; text_body: string | null; html_body: string | null; attachments: { doc_id: string; name: string; mime: string; size: number }[] }
const status = ref('new')
const { data, refresh } = await useFetch<{ rows: R[]; counts: { status: string; n: number }[]; webhook: string | null }>('/api/notices', { query: { status } })
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
const cnt = (s: string) => data.value?.counts.find((c) => c.status === s)?.n ?? 0
const open = ref<N | null>(null); const showHtml = ref(false)
async function view(r: R) { open.value = await $fetch<N>('/api/notices/' + r.id); showHtml.value = false; rm.title = r.subject.slice(0, 200); rm.entity_id = r.entity_id ?? ''; rm.due = r.due_date ?? '' }
async function setStatus(s: string) { if (!open.value) return; await $fetch('/api/notices/' + open.value.id, { method: 'POST', body: { status: s } }); open.value = null; await refresh() }
const rm = reactive({ title: '', entity_id: '', due: '', recurrence: 'none' }); const msg = ref('')
async function remind() { msg.value = ''; try { await $fetch('/api/notices/' + open.value!.id, { method: 'POST', body: { reminder: { ...rm } } }); open.value = null; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Choose an entity and a due date.' } }
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const days = (d: string | null) => (d ? Math.round((new Date(d + 'T00:00:00Z').getTime() - Date.now()) / 86400e3) : null)
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
async function copyScript() { await navigator.clipboard.writeText(script.value); copiedS.value = true; setTimeout(() => (copiedS.value = false), 1500) }
</script>
<template>
  <section v-if="data">
    <p class="label">Family Office</p>
    <div class="head"><div><h1>Notices</h1><p class="lead">Official and business emails forwarded from your inbox (registered agent, state filings, tax, banks), summarised with any deadline.</p></div><button class="btn secondary" @click="setup = true">Connect Gmail</button></div>
    <div class="chips"><button v-for="[k, l] in [['new', 'New'], ['done', 'Done'], ['archived', 'Archived'], ['all', 'All']]" :key="k" :class="{ on: status === k }" @click="status = k">{{ l }} <em v-if="k !== 'all'">{{ cnt(k) }}</em></button></div>
    <div v-if="data.rows.length" class="list">
      <button v-for="r in data.rows" :key="r.id" type="button" class="row" :class="{ unread: r.status === 'new' }" @click="view(r)">
        <span class="fr"><b>{{ r.from_name || r.from_email }}</b><em>{{ when(r.received_at) }}</em></span>
        <span class="sj">{{ r.subject }}</span><span v-if="r.summary" class="sm">{{ r.summary }}</span>
        <span class="tg"><span v-if="r.due_date" class="pill" :class="(days(r.due_date) ?? 99) < 0 ? 'red' : (days(r.due_date) ?? 99) <= 14 ? 'amber' : 'blue'">Due {{ r.due_date }}</span><span v-if="r.entity" class="pill">{{ r.entity }}</span><span v-if="r.action && !/no action/i.test(r.action)" class="pill act">{{ r.action }}</span><span v-if="r.files" class="pill">{{ r.files }} file{{ r.files === 1 ? '' : 's' }}</span></span>
      </button>
    </div>
    <EmptyState v-else card icon="cs_inbox" :title="status === 'new' ? 'No new notices' : 'Nothing here'" text="Label notices in Gmail (for example Bizee and state emails to company@aidiventures.com) and they appear here with a summary and deadline."><button class="btn" @click="setup = true">Connect Gmail</button></EmptyState>
    <AppModal :open="!!open" :title="open?.subject ?? ''" wide @close="open = null">
      <div v-if="open" class="nv"><p class="mt">From <b>{{ open.from_name }}</b> &lt;{{ open.from_email }}&gt; · {{ when(open.received_at) }}{{ open.to_email ? ' · to ' + open.to_email : '' }}</p>
        <div v-if="open.summary" class="sumc"><b>Summary</b><p>{{ open.summary }}</p><p v-if="open.action"><b>Action:</b> {{ open.action }}</p><p v-if="open.due_date"><b>Deadline:</b> {{ open.due_date }}</p></div>
        <div v-if="open.attachments.length" class="att"><a v-for="a in open.attachments" :key="a.doc_id" :href="'/api/notices/' + open.id + '/file/' + a.doc_id" target="_blank">📎 {{ a.name }}</a></div>
        <div class="bodyw"><div class="bt"><button :class="{ on: !showHtml }" @click="showHtml = false">Text</button><button v-if="open.html_body" :class="{ on: showHtml }" @click="showHtml = true">Original</button></div>
          <iframe v-if="showHtml && open.html_body" sandbox="" :srcdoc="open.html_body" title="Email" class="ifr" /><pre v-else class="txt">{{ open.text_body || '(no text)' }}</pre></div>
        <div class="card rmd"><b>Add a compliance reminder</b><div class="g3"><label class="label">Title<input v-model="rm.title" maxlength="200"></label><label class="label">Entity<select v-model="rm.entity_id"><option value="">Choose</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label><label class="label">Due<input v-model="rm.due" type="date"></label></div>
          <label class="label rec">Repeats<select v-model="rm.recurrence"><option value="none">Once</option><option value="annual">Every year</option><option value="quarterly">Every quarter</option><option value="monthly">Every month</option></select></label>
          <button class="btn sm" :disabled="!rm.entity_id || !rm.due" @click="remind">Add reminder and mark done</button><p v-if="msg" class="error">{{ msg }}</p></div></div>
      <template #foot><DeleteButton v-if="open" type="notice" :id="open.id" :name="open.subject" @deleted="open = null; refresh()" /><button v-if="open?.status !== 'archived'" class="btn secondary" @click="setStatus('archived')">Archive</button><button v-if="open?.status === 'new'" class="btn" @click="setStatus('done')">Mark done</button><button v-else class="btn secondary" @click="setStatus('new')">Mark as new</button></template>
    </AppModal>
    <AppModal :open="setup" title="Send notices from Gmail" wide @close="setup = false">
      <ol class="steps">
        <li><b>One-time setting in DigitalOcean:</b> add <code>NUXT_INBOUND_EMAIL_TOKEN</code> (any long random text) under App → Settings → Environment variables. <span v-if="!data.webhook" class="warn">Not set yet: add it, wait for the redeploy, then reopen this.</span></li>
        <li><b>In Gmail (company@aidiventures.com), create a filter:</b> Settings → <i>Filters and blocked addresses</i> → <i>Create a new filter</i> → From: <code>bizee.com OR incfile.com OR delaware.gov OR irs.gov OR sos.ca.gov</code> → <i>Create filter</i> → tick <i>Apply the label</i> → new label <code>Aidi notices</code>. Tick "Also apply to matching conversations" to send the existing ones too.</li>
        <li><b>Add the sender script</b> (Google's own Apps Script, free, runs inside your Google account): open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> while signed in as company@aidiventures.com, delete what's there, paste this, and save:
          <div class="code"><button class="btn secondary sm" @click="copyScript">{{ copiedS ? 'Copied' : 'Copy script' }}</button><pre>{{ script }}</pre></div></li>
        <li><b>Run it once</b> (choose <code>sendToAidi</code> → Run) and allow access when Google asks. Then add a trigger: <i>Triggers</i> (clock icon) → <i>Add trigger</i> → <code>sendToAidi</code> → Time-driven → Minutes timer → Every 10 minutes.</li>
        <li>That's it. Emails that get the <b>Aidi notices</b> label appear here within 10 minutes with a summary and deadline, and are relabelled <i>Aidi notices/sent</i> in Gmail.</li></ol>
    </AppModal>
  </section>
</template>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .head h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; max-width: 720px; }
.chips { display: flex; gap: 6px; margin: 16px 0; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); } .chips em { font-style: normal; opacity: .75; margin-left: 4px; }
.list { background: #fff; border: 1px solid var(--c-rule); } .row { display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--c-rule); padding: 14px 16px; font: inherit; cursor: pointer; } .row:last-child { border-bottom: 0; } .row:hover { background: #fbfaf7; } .row.unread { box-shadow: inset 3px 0 0 var(--c-navy); }
.fr { display: flex; justify-content: space-between; font-size: 13px; } .fr em { font-style: normal; color: var(--c-muted); } .sj { font-weight: 600; font-size: 14.5px; } .sm { font-size: 13px; color: var(--c-ink-soft); } .tg { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.pill { font-size: 11.5px; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); } .pill.red { background: rgba(180,35,24,.08); color: var(--c-danger); } .pill.amber { background: rgba(181,71,8,.09); color: var(--c-warn); } .pill.blue { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pill.act { background: #fff4e5; color: #8a4b00; }
.nv { display: flex; flex-direction: column; gap: 12px; } .mt { font-size: 13px; color: var(--c-muted); margin: 0; } .sumc { background: var(--c-signal-soft); padding: 12px 14px; font-size: 13.5px; } .sumc p { margin: 4px 0 0; } .att { display: flex; gap: 12px; flex-wrap: wrap; } .att a { font-size: 13px; color: var(--c-blue-deep); }
.bt { display: flex; gap: 4px; margin-bottom: 6px; } .bt button { background: #fff; border: 1px solid var(--c-rule); padding: 4px 10px; font: inherit; font-size: 12.5px; cursor: pointer; } .bt .on { background: var(--c-navy); color: #fff; } .ifr { width: 100%; height: 360px; border: 1px solid var(--c-rule); background: #fff; } .txt { white-space: pre-wrap; font-family: inherit; font-size: 13.5px; background: #fbfaf7; border: 1px solid var(--c-rule); padding: 12px; max-height: 360px; overflow: auto; margin: 0; }
.rmd { display: flex; flex-direction: column; gap: 8px; } .g3 { display: grid; grid-template-columns: 2fr 1.4fr 1fr; gap: 10px; } label.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } input, select { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; } .rec { max-width: 220px; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; align-self: flex-start; } .error { color: var(--c-danger); margin: 0; }
.steps { display: flex; flex-direction: column; gap: 12px; padding-left: 18px; font-size: 13.5px; line-height: 1.55; } .code { position: relative; margin-top: 8px; } .code pre { background: #0c1a2e; color: #e6edf6; padding: 12px; font-size: 11.5px; overflow-x: auto; max-height: 260px; margin: 0; } .code .btn { position: absolute; top: 6px; right: 6px; } .lnk { display: flex; gap: 8px; align-items: center; background: var(--c-signal-soft); padding: 8px; margin: 6px 0; } .lnk code { flex: 1; font-size: 12px; word-break: break-all; } code { background: var(--c-paper-2); padding: 1px 5px; font-size: 12.5px; } .warn { color: var(--c-warn); margin: 6px 0; }
@media (max-width: 800px) { .g3 { grid-template-columns: 1fr; } }
</style>
