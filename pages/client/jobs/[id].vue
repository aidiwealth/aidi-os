<script setup lang="ts">
// A client's request: what they ordered, where it stands, the details they sent, updates and files from our team,
// billing, and a place to send documents or a message.
import { mdRender } from '~/shared/markdown'
const id = useRoute().params.id as string
interface Ev { id: string; kind: string; body: string | null; to_status: string | null; created_at: string; from_client: boolean; document_id: string | null; document: string | null }
interface Inv { id: string; number: string; currency: string; amount: string; status: string; paid_via: string | null; overdue: boolean; link: string }
interface D { invoices: Inv[]; items: { code: string; name: string }[]; job: { id: string; title: string; status: string; due_date: string | null; created_at: string; company: string | null; entity_type: string | null; jurisdiction: string | null; country: string | null }; events: Ev[] }
const { data, refresh } = await usePortalFetch<D>('/api/portal/jobs/' + id)
const job = computed(() => data.value!.job)
const isOrder = computed(() => !!data.value?.items.length)
const heading = computed(() => (isOrder.value && job.value.company ? job.value.company : job.value.title))
useHead({ title: () => (data.value ? heading.value : 'Request') })
const ST: Record<string, string> = { new: 'Received', in_progress: 'In progress', waiting_client: 'Waiting on you', completed: 'Completed', cancelled: 'Cancelled' }
const STEPS = [['new', 'Received'], ['in_progress', 'In progress'], ['completed', 'Completed']] as const
const stepAt = computed(() => (job.value.status === 'completed' ? 2 : job.value.status === 'new' ? 0 : 1))
const TYPES: Record<string, string> = { llc: 'LLC', c_corp: 'C-Corp', s_corp: 'S-Corp', ltd: 'Limited', plc: 'PLC' }

const text = ref(''); const hasText = computed(() => text.value.replace(/[\s\u00a0]|&nbsp;|<br\s*\/?>/g, '').length > 0); const note = ref(''); const msg = ref(''); const ok = ref(''); const busy = ref(false)
async function send() { busy.value = true; msg.value = ''; ok.value = ''; try { await $fetch('/api/portal/jobs/' + id + '/message', { method: 'POST', body: { body: text.value } }); text.value = ''; ok.value = 'Message sent. We will reply here and by email.'; await refresh() } catch (e) { msg.value = portalErr(e) } finally { busy.value = false } }
async function upload(ev: Event) {
  const input = ev.target as HTMLInputElement
  let n = 0
  for (const f of Array.from(input.files ?? [])) { busy.value = true; msg.value = ''; ok.value = ''; const fd = new FormData(); fd.append('file', f); fd.append('note', note.value); try { await $fetch('/api/portal/jobs/' + id + '/upload', { method: 'POST', body: fd }); n++ } catch (e) { msg.value = f.name + ': ' + portalErr(e) } }
  if (n) ok.value = n === 1 ? 'File sent to our team.' : n + ' files sent to our team.'
  busy.value = false; input.value = ''; note.value = ''; await refresh()
}
// Agreements for this request: sign one the team sent, or open a signed copy.
interface Ag { id: string; title: string; status: string; effective_date: string; signed_at: string | null; signer_name: string | null; body: string | null }
const { data: ags, refresh: rags } = await useFetch<Ag[]>('/api/portal/agreements', { query: { job: id }, default: () => [] })
const pending = computed(() => (ags.value ?? []).filter((a) => a.status === 'pending'))
const signing = ref<Ag | null>(null); const sv = ref({ name: '', kind: 'typed' as 'typed' | 'drawn' | 'uploaded', png: '', agree: false }); const sBusy = ref(false); const sErr = ref('')
const sReady = computed(() => sv.value.name.trim().length > 1 && !!sv.value.png && sv.value.agree)
async function signAg() { if (!signing.value) return; sBusy.value = true; sErr.value = ''; try { await $fetch('/api/portal/agreements/' + signing.value.id + '/sign', { method: 'POST', body: sv.value }); signing.value = null; ok.value = 'Signed. A copy is in your email and on this request.'; await Promise.all([rags(), refresh()]) } catch (e) { sErr.value = portalErr(e) } finally { sBusy.value = false } }
async function openAg(aid: string) { const w = window.open('', '_blank'); try { const r = await $fetch<{ url: string }>('/api/portal/agreements/' + aid + '/pdf'); if (w) w.location.href = r.url } catch (e) { w?.close(); msg.value = portalErr(e) } }
async function openDoc(docId: string) { try { const r = await $fetch<{ url: string }>('/api/portal/documents/' + docId); window.open(r.url, '_blank') } catch (e) { msg.value = portalErr(e) } }
const { data: wal, refresh: rwal } = await useFetch<{ currency: string; balance_minor: number } | null>('/api/portal/wallet', { key: 'portal:wallet' })
const paying = ref('')
const walletCovers = (i: Inv) => !!wal.value && wal.value.currency === i.currency && wal.value.balance_minor >= Math.round(Number(i.amount) * 100)
async function payWallet(i: Inv) { if (!await askConfirm('Pay ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: i.currency }).format(Number(i.amount)) + ' from your wallet?')) return; paying.value = i.id; msg.value = ''; try { await $fetch('/api/portal/invoices/' + i.id + '/pay-wallet', { method: 'POST' }); ok.value = 'Paid from your wallet. Your receipt is on its way.'; await refresh(); await rwal() } catch (e) { msg.value = portalErr(e) } finally { paying.value = '' } }
async function delJob() { if (!data.value || !await askConfirm('Delete this request? This removes the request and its messages.')) return; try { await $fetch('/api/portal/jobs/' + data.value.job.id, { method: 'DELETE' }); await navigateTo('/client') } catch (e) { notify((e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not delete.') } }

const files = computed(() => (data.value?.events ?? []).filter((e) => e.document_id))
const updates = computed(() => (data.value?.events ?? []).filter((e) => !e.document_id || e.body))
const label = (e: Ev) => e.kind === 'status' ? 'Status: ' + (ST[e.to_status ?? ''] ?? e.to_status) : e.kind === 'document' ? 'Shared a document' : e.kind === 'client_document' ? 'You sent a document' : e.from_client ? 'You wrote' : 'Message from our team'
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const day = (d: string) => new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fname = (e: Ev) => (e.document ?? 'Document').split(' — ').pop()!
const ext = (n: string) => { const e = (n.split('.').pop() ?? '').toLowerCase(); return e === 'pdf' ? 'PDF' : ['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(e) ? 'IMG' : ['xls', 'xlsx', 'csv'].includes(e) ? 'XLS' : ['doc', 'docx'].includes(e) ? 'DOC' : 'FILE' }
const money = (v: string, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(v))
const rich = (s: string) => mdRender(s.includes('\n\n') || /^\s*([-*]|\d+\.|#|>)\s/m.test(s) ? s : s.replace(/\n/g, '  \n'))
</script>

<template>
  <section v-if="data" class="cj">
    <NuxtLink to="/client" class="back">← Home</NuxtLink>
    <header class="top">
      <div class="tl1">
        <p class="eyebrow"><span>{{ isOrder ? 'Your order' : 'Your request' }}</span><span class="pill" :data-s="job.status">{{ ST[job.status] }}</span></p>
        <h1>{{ heading }}</h1>
        <div v-if="data.items.length" class="chips"><span v-for="i in data.items" :key="i.code" class="chip">{{ i.name }}</span></div>
        <p v-else-if="job.title !== heading" class="sub">{{ job.title }}</p>
        <dl class="meta">
          <div><dt>Placed</dt><dd>{{ day(job.created_at) }}</dd></div>
          <div v-if="job.due_date"><dt>Target date</dt><dd>{{ day(job.due_date) }}</dd></div>
          <div v-if="job.company"><dt>Company</dt><dd>{{ job.company }}<template v-if="job.entity_type"> · {{ TYPES[job.entity_type] ?? job.entity_type }}</template><template v-if="job.jurisdiction"> · {{ job.jurisdiction }}</template></dd></div>
        </dl>
      </div>
      <button v-if="job.status !== 'completed'" type="button" class="del" @click="delJob">Delete request</button>
    </header>

    <ol v-if="job.status !== 'cancelled'" class="steps">
      <li v-for="([k, l], i) in STEPS" :key="k" :class="{ done: i < stepAt || job.status === 'completed', now: i === stepAt && job.status !== 'completed' }"><span class="dot">{{ i < stepAt || job.status === 'completed' ? '✓' : i + 1 }}</span><b>{{ l }}</b></li>
    </ol>
    <div v-if="job.status === 'waiting_client'" class="need"><b>We need something from you.</b> Please read the latest message from our team below, then send what is needed.</div>
    <ServiceNotice v-else-if="job.status !== 'completed'" compact />
    <div v-for="a in pending" :key="a.id" class="sign"><div><b>Please sign: {{ a.title }}</b><span>Effective {{ day(a.effective_date) }}. Our agreement for this request: service levels, fees and refunds.</span></div><button type="button" class="btn" @click="signing = a; sErr = ''">Review and sign</button></div>
    <p v-if="ok" class="flash ok" role="status">{{ ok }}</p><p v-if="msg" class="flash error" role="alert">{{ msg }}</p>

    <div class="grid">
      <div class="col">
        <IntakeForm :job-id="job.id" />

        <div v-if="files.length" class="card">
          <div class="ch"><h2>Files</h2><span class="muted">{{ files.length }}</span></div>
          <ul class="files"><li v-for="f in files" :key="f.id"><FileBadge :name="fname(f)" />
            <div class="fi"><button type="button" class="link" @click="openDoc(f.document_id!)">{{ fname(f) }}</button><span class="muted">{{ f.kind === 'client_document' ? 'You sent this' : 'From our team' }} · {{ when(f.created_at) }}</span></div>
            <button type="button" class="dlb" @click="openDoc(f.document_id!)">Download</button></li></ul>
        </div>

        <div class="card">
          <h2>Updates</h2>
          <ul v-if="updates.length" class="tline">
            <li v-for="e in updates" :key="e.id" :data-kind="e.kind" :class="{ me: e.from_client }">
              <p class="h">{{ label(e) }}<span class="m">{{ when(e.created_at) }}</span></p>
              <div v-if="e.body" class="b md" v-html="rich(e.body)" />
              <button v-if="e.document_id" type="button" class="doc" @click="openDoc(e.document_id)"><FileBadge :name="fname(e)" size="sm" />{{ fname(e) }}</button>
            </li>
          </ul>
          <p v-else class="muted">No updates yet. We will post every step here and email you.</p>
        </div>
      </div>

      <aside class="col">
        <div v-if="(ags ?? []).some((a) => a.status === 'signed')" class="card"><div class="ch"><h2>Agreements</h2></div>
          <button v-for="a in (ags ?? []).filter((x) => x.status === 'signed')" :key="a.id" type="button" class="agr" @click="openAg(a.id)"><FileBadge name="a.pdf" size="sm" /><span><b>{{ a.title }}</b><em>Signed by {{ a.signer_name }} · {{ day(a.signed_at!) }}</em></span></button></div>
        <div class="card bill">
          <div class="ch"><h2>Billing</h2><NuxtLink to="/client/invoices" class="more">All invoices →</NuxtLink></div>
          <div v-for="i in data.invoices" :key="i.id" class="bi">
            <a :href="i.link" class="bt"><div><b>{{ i.number }}</b><span class="muted">{{ i.status === 'paid' ? 'Paid' + (i.paid_via === 'wallet' ? ' from wallet' : '') : i.overdue ? 'Overdue' : 'To pay' }}</span></div><b class="amt" :class="i.overdue ? 'over' : i.status">{{ money(i.amount, i.currency) }}</b></a>
            <div v-if="i.status === 'sent'" class="pay"><button v-if="walletCovers(i)" type="button" class="btn sm" :disabled="paying === i.id" @click="payWallet(i)">{{ paying === i.id ? 'Paying…' : 'Pay from wallet' }}</button><a :href="i.link" class="btn sm" :class="{ secondary: walletCovers(i) }">{{ walletCovers(i) ? 'Card or transfer' : 'Pay now' }}</a></div>
          </div>
          <p v-if="!data.invoices.length" class="muted">No invoice for this request yet.</p>
        </div>
        <div class="card">
          <h2>Send documents</h2>
          <label class="label">What are they? (optional)<input v-model="note" maxlength="1000" placeholder="e.g. 2025 bank statements"></label>
          <DropZone multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xlsx,.xls,.docx" :disabled="busy" :label="busy ? 'Uploading…' : ''" @change="upload" />
        </div>
        <form class="card" @submit.prevent="send">
          <h2>Message our team</h2>
          <div @keydown.meta.enter.prevent="send" @keydown.ctrl.enter.prevent="send"><ClientOnly><RichEditor v-model="text" compact minimal :min-height="110" :max-length="5000" placeholder="Ask a question or tell us something about this request" /><template #fallback><textarea rows="4" disabled /></template></ClientOnly></div>
          <button class="btn" type="submit" :disabled="busy || !hasText">Send message</button>
        </form>
      </aside>
    </div>
    <AppModal :open="!!signing" :title="signing?.title ?? ''" wide @close="signing = null">
      <AgreementSign v-if="signing" v-model="sv" :title="signing.title" :md="signing.body ?? ''" /><p v-if="sErr" class="error">{{ sErr }}</p>
      <template #foot><button type="button" class="btn secondary" @click="signing = null">Cancel</button><button type="button" class="btn" :disabled="!sReady || sBusy" @click="signAg">{{ sBusy ? 'Signing…' : 'Sign agreement' }}</button></template>
    </AppModal>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 14px; color: var(--c-muted); text-decoration: none; font-size: 14px; }
.top { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; } .tl1 { min-width: 0; flex: 1; }
.eyebrow { display: flex; align-items: center; gap: 10px; margin: 0 0 6px; font-size: 13px; color: var(--c-muted); }
.pill { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 0; background: var(--c-paper-2); color: var(--c-ink-soft); }
.pill[data-s="new"] { background: #eef4ff; color: #2c5cc5; } .pill[data-s="in_progress"] { background: #fff6e6; color: #a5650b; } .pill[data-s="waiting_client"] { background: #fdecef; color: #b4234a; } .pill[data-s="completed"] { background: #e8f0f8; color: #235278; }
h1 { margin: 0; font-size: clamp(24px, 2.6vw, 32px); line-height: 1.15; letter-spacing: -.02em; } .sub { margin: 6px 0 0; color: var(--c-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; } .chip { font-size: 13px; padding: 5px 11px; border: 1px solid var(--c-rule-strong); border-radius: 0; background: #fff; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 32px; margin: 16px 0 0; } .meta div { display: flex; flex-direction: column; gap: 2px; } .meta dt { font-size: 12px; color: var(--c-muted); } .meta dd { margin: 0; font-size: 14px; font-weight: 500; }
.del { background: none; border: 0; color: var(--c-danger); font: inherit; font-size: 13px; cursor: pointer; padding: 0; white-space: nowrap; }
.steps { list-style: none; display: flex; margin: 22px 0 14px; padding: 0; counter-reset: s; }
.steps li { flex: 1; display: flex; align-items: center; gap: 10px; position: relative; font-size: 14px; color: var(--c-muted); }
.steps li:not(:last-child)::after { content: ''; flex: 1; height: 2px; background: var(--c-rule); margin: 0 12px; } .steps li.done:not(:last-child)::after { background: var(--c-ok); }
.steps .dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 600; background: #fff; border: 2px solid var(--c-rule-strong); flex: none; }
.steps li.done .dot { background: var(--c-ok); border-color: var(--c-ok); color: #fff; } .steps li.done b { color: var(--c-ink); font-weight: 500; }
.steps li.now .dot { border-color: var(--c-navy); color: var(--c-navy); box-shadow: 0 0 0 4px rgba(12,26,46,.08); } .steps li.now b { color: var(--c-navy); font-weight: 600; }
.need { background: #fdecef; color: #8f1d3b; padding: 12px 16px; border-radius: 0; font-size: 14px; margin-bottom: 4px; } .need b { color: #b4234a; }
.flash { margin: 10px 0 0; font-size: 14px; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
.grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); gap: 20px; align-items: start; margin-top: 18px; }
.col { display: flex; flex-direction: column; gap: 20px; min-width: 0; } .card { border-radius: 0; display: flex; flex-direction: column; gap: 10px; }
h2 { margin: 0; font-size: 17px; } .ch { display: flex; justify-content: space-between; align-items: baseline; } .muted { color: var(--c-muted); font-size: 13px; } .more { font-size: 13px; color: var(--c-blue-deep); text-decoration: none; }
.files { list-style: none; margin: 0; padding: 0; } .files li { display: flex; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--c-rule); }
.ft { flex: none; width: 36px; height: 40px; border-radius: 0; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: #fff; background: #7b8794; } .ft[data-t="PDF"] { background: #d0473d; } .ft[data-t="IMG"] { background: #8a5cd1; } .ft[data-t="XLS"] { background: #235985; } .ft[data-t="DOC"] { background: #2f6fd6; }
.fi { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .link { background: none; border: 0; padding: 0; font: inherit; font-weight: 500; color: var(--c-ink); cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .link:hover { color: var(--c-blue-deep); }
.dlb { background: none; border: 1px solid var(--c-rule-strong); border-radius: 0; padding: 5px 10px; font: inherit; font-size: 12.5px; cursor: pointer; color: var(--c-blue-deep); }
.tline { list-style: none; padding: 0; margin: 4px 0 0; }
.tline li { position: relative; padding: 0 0 16px 20px; border-left: 2px solid var(--c-rule); margin-left: 5px; } .tline li:last-child { padding-bottom: 0; }
.tline li::before { content: ''; position: absolute; left: -6px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid var(--c-blue); }
.tline li.me::before { border-color: var(--c-cyan); background: var(--c-cyan); } .tline li[data-kind="status"]::before { background: var(--c-navy); border-color: var(--c-navy); }
.h { margin: 0; font-weight: 500; font-size: 14px; color: var(--c-navy); display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; } .h .m { font-size: 12px; font-weight: 400; color: var(--c-muted); }
.b { margin: 4px 0 0; white-space: pre-wrap; font-size: 14px; } .b.md { white-space: normal; line-height: 1.55; }
.md :deep(p) { margin: 0 0 8px; } .md :deep(p:last-child) { margin-bottom: 0; } .md :deep(ul), .md :deep(ol) { margin: 4px 0 8px; padding-left: 20px; } .md :deep(a) { color: var(--c-blue-deep); } .md :deep(blockquote) { margin: 0 0 8px; padding-left: 12px; border-left: 3px solid var(--c-rule-strong); }
.doc { margin-top: 8px; background: var(--c-paper-2); border: 0; border-radius: 0; padding: 6px 10px; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.bill .bi { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--c-rule); border-radius: 0; }
.bt { display: flex; justify-content: space-between; align-items: center; gap: 10px; text-decoration: none; color: var(--c-ink); } .bt div { display: flex; flex-direction: column; } .bt .muted { font-size: 12px; }
.amt { font-variant-numeric: tabular-nums; } .amt.paid { color: var(--c-ok); } .amt.over { color: var(--c-danger); }
.pay { display: flex; gap: 8px; flex-wrap: wrap; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; display: inline-flex; align-items: center; text-decoration: none; }
label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); }
input, textarea { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); border-radius: 0; background: #fff; color: var(--c-ink); } textarea { resize: vertical; } form .btn { align-self: flex-start; }
@media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .top { flex-direction: column; } .steps b { display: none; } }
.sign { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; background: #eef4ff; border: 1px solid #c9d8f5; padding: 14px 18px; margin: 0 0 16px; } .sign div { display: flex; flex-direction: column; gap: 2px; } .sign span { font-size: 13.5px; color: var(--c-ink-soft); }
.agr { display: flex; gap: 10px; align-items: center; width: 100%; background: none; border: 0; border-top: 1px solid var(--c-rule); padding: 10px 0; font: inherit; text-align: left; cursor: pointer; } .agr span { display: flex; flex-direction: column; } .agr b { font-weight: 500; } .agr em { font-style: normal; font-size: 12px; color: var(--c-muted); } .agr:hover b { color: var(--c-blue-deep); }
</style>
