<script setup lang="ts">
// The identity check, step by step. Client: what is done, the one thing left to do (pick the document, upload or take
// a photo), what we accept, and the history. Staff: the steps as status cards, each document beside what the AI read
// from it, and the decisions (accept, ask for another, mark verified, fail).
const props = defineProps<{ api: string; staff?: boolean; clientId?: string; preview?: boolean }>()
interface Step { key: string; label: string; state: string; detail: string; upload?: string }
interface Item { id: string; kind: string; doc_type: string | null; doc_label: string; document_id: string; status: string; note: string | null; added_by: string; created_at: string; reviewed_at: string | null; image: boolean; ai?: { doc_type: string; name_on_doc: string | null; address_on_doc: string | null; date_on_doc: string | null; expiry: string | null; checks: { name: string; result: string; detail: string }[]; summary: string } | null }
interface View { country: string; status: string; steps: Step[]; done: number; total: number; todo: number; items: Item[]; events: { text: string; actor?: string; created_at: string }[]; doc_types: { key: string; kind: string; label: string; note: string }[]; expected?: { name: string; address: string | null }; provider?: { status: string | null; account: string | null } | null; bvn_last4?: string | null; bvn_name?: string | null; accredited?: boolean; accredited_at?: string | null }
const { data, refresh } = await useFetch<View>(() => props.api, { key: 'id-' + props.api })
const msg = ref(''), ok = ref(''), busy = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not do that.'
// Upload: the step that needs a document decides the choices.
const want = computed(() => data.value?.steps.find((s) => s.upload && s.state === 'now')?.upload ?? (props.staff ? 'proof_of_address' : ''))
const upKind = ref(''); watchEffect(() => { if (!upKind.value || !data.value?.steps.some((s) => s.upload === upKind.value)) upKind.value = want.value })
const types = computed(() => (data.value?.doc_types ?? []).filter((t) => t.kind === upKind.value))
const dt = ref(''); watch(types, (t) => { if (!t.some((x) => x.key === dt.value)) dt.value = t[0]?.key ?? '' }, { immediate: true })
const file = ref<HTMLInputElement | null>(null), cam = ref<HTMLInputElement | null>(null)
async function upload(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return
  if (props.preview) { msg.value = 'Preview only.'; return }
  const fd = new FormData(); fd.append('doc_type', dt.value); fd.append('file', f)
  busy.value = 'up'; msg.value = ''; ok.value = ''
  try { data.value = await $fetch<View>(props.api, { method: 'POST', body: fd }); ok.value = props.staff ? 'Added. The AI has read it below.' : 'Thanks. We\'ll check it, usually within a working day.' } catch (e) { msg.value = err(e) } finally { busy.value = ''; (ev.target as HTMLInputElement).value = '' }
}
// Staff decisions.
const sel = ref(''); const cur = computed(() => data.value?.items.find((i) => i.id === sel.value) ?? data.value?.items.find((i) => i.status === 'to_review') ?? data.value?.items[0] ?? null)
const note = ref('')
async function act(action: string, extra: Record<string, unknown> = {}) {
  if ((action === 'reject' || action === 'fail') && !note.value.trim()) { msg.value = 'Write a line the client will see, then try again.'; return }
  if (action === 'fail' && !await askConfirm('Fail the identity check? The client is emailed.')) return
  busy.value = action; msg.value = ''; ok.value = ''
  try { data.value = await $fetch<View>(props.api, { method: 'POST', body: { action, note: note.value, ...extra } }); note.value = ''; ok.value = { accept: 'Accepted.', accept_verify: 'Accepted, and the identity check is complete.', reject: 'The client has been asked for another.', ask: 'The client has been asked by email and in their portal.', verify: 'Identity check complete.', fail: 'Marked as failed; the client has been emailed.', reopen: 'Reopened.', accredited: 'Confirmed as accredited.', not_accredited: 'Accredited status removed.' }[action] ?? 'Done.' } catch (e) { msg.value = err(e) } finally { busy.value = '' }
}
const bvn = ref('')
async function checkBvn() { busy.value = 'bvn'; msg.value = ''; try { const r = await $fetch<{ verified?: boolean; detail?: string }>('/api/wm/clients/' + props.clientId, { method: 'POST', body: { action: 'kyc_bvn', bvn: bvn.value } }); ok.value = r.verified ? 'BVN verified.' : 'The BVN could not be verified: ' + (r.detail ?? ''); bvn.value = ''; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const DOT: Record<string, string> = { done: '#1c547d', review: '#b54708', now: '#b54708', todo: '#9aa3ad', failed: '#b42318' }
const STATE: Record<string, string> = { done: 'Done', review: 'Being checked', now: 'To do', todo: 'Later', failed: 'Not passed' }
const RES: Record<string, string> = { match: 'Matches', check: 'Look yourself', mismatch: 'Does not match' }
const docUrl = (i: Item) => '/api/wm/doc/' + i.document_id
</script>
<template>
  <div v-if="data" class="idc">
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="okm">{{ ok }}</p>
    <!-- Client -->
    <template v-if="!staff">
      <section class="card sum">
        <div class="sl"><span class="tag" :class="data.status === 'verified' ? 'blue' : data.todo ? 'warn' : ''">{{ data.status === 'verified' ? 'Verified' : data.status === 'failed' ? 'Not passed' : data.todo ? data.todo + ' thing' + (data.todo === 1 ? '' : 's') + ' to do' : 'Being checked' }}</span><b class="big">{{ data.done }} of {{ data.total }} done</b><span class="pb"><i :style="{ width: (data.done / data.total) * 100 + '%' }" /></span><span class="mut sm">{{ data.status === 'verified' ? 'You\'re all set.' : 'Usually checked within a working day' }}</span></div>
        <ol class="steps"><li v-for="(s, i) in data.steps" :key="s.key" :class="s.state"><span class="nb">{{ s.state === 'done' ? '✓' : i + 1 }}</span><div><b>{{ s.label }}</b><em>{{ s.detail }}</em></div></li></ol>
      </section>
      <section v-if="want && data.status !== 'verified'" class="card up">
        <div class="ul"><b class="h">{{ want === 'id_document' ? 'Add your government ID' : 'Add your proof of address' }}</b><span class="mut sm">Pick what you have, then upload a file or take a photo.</span>
          <div class="dts"><button v-for="t in types" :key="t.key" type="button" :class="{ on: dt === t.key }" @click="dt = t.key"><b>{{ t.label }}</b><span>{{ t.note }}</span></button></div>
          <div class="drop"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" fill="none" stroke="#1c547d" stroke-width="1.6" /></svg><b>{{ busy === 'up' ? 'Uploading…' : 'Upload a file, or take a photo' }}</b><span class="mut sm">PDF or photo, up to 20 MB · all four corners visible</span>
            <div class="row"><button class="btn" :disabled="!!busy" @click="file?.click()">Choose a file</button><button class="btn secondary" :disabled="!!busy" @click="cam?.click()">Take a photo</button></div>
            <input ref="file" type="file" hidden accept=".pdf,image/png,image/jpeg,image/webp" @change="upload"><input ref="cam" type="file" hidden accept="image/*" capture="environment" @change="upload"></div></div>
        <div class="acc"><b>What we accept</b><template v-if="want === 'proof_of_address'"><span>✓ Dated in the last 3 months</span><span>✓ Your full name and home address</span><span>✓ The whole page, readable</span><span class="mut">Not accepted: screenshots of apps, mobile phone bills, envelopes.</span></template>
          <template v-else><span>✓ Not expired</span><span>✓ Your full name and photo clear</span><span>✓ All four corners, no glare</span><span class="mut">Not accepted: photocopies of photocopies, expired documents.</span></template>
          <span class="mut sep">Your documents are encrypted and seen only by our compliance team.</span></div>
      </section>
      <section v-if="data.items.length" class="card"><b class="h">Your documents</b><div v-for="i in data.items" :key="i.id" class="rw"><span>{{ i.doc_label }}<em>{{ when(i.created_at) }}</em></span><span class="tag" :class="{ blue: i.status === 'accepted', warn: i.status === 'rejected' }">{{ i.status === 'accepted' ? 'Accepted' : i.status === 'rejected' ? 'Please add another' : 'Being checked' }}</span></div></section>
      <section v-if="data.events.length" class="card"><b class="h">History</b><div class="ev"><template v-for="(e, k) in data.events" :key="k"><span class="mut">{{ when(e.created_at) }}</span><span>{{ e.text }}</span></template></div></section>
    </template>
    <!-- Staff -->
    <template v-else>
      <section class="card cards"><div v-for="s in data.steps" :key="s.key" class="sc"><span class="lbl">{{ s.label }}</span><b><i :style="{ background: DOT[s.state] }" />{{ STATE[s.state] }}</b><em>{{ s.detail }}</em></div></section>
      <div class="bar2"><span class="mut sm">Overall: <b>{{ data.status.replace('_', ' ') }}</b>{{ data.provider?.account ? ' · brokerage account ••' + String(data.provider.account).slice(-4) : '' }}</span>
        <span class="row"><button class="btn secondary sm" :disabled="!!busy" @click="act('ask', { kind: 'proof_of_address' })">Ask for proof of address</button><button class="btn secondary sm" :disabled="!!busy" @click="act('ask', { kind: 'id_document' })">Ask for an ID</button><button v-if="data.status !== 'verified'" class="btn sm" :disabled="!!busy" @click="act('verify')">Mark verified</button><button v-else class="lk" @click="act('reopen')">Reopen</button></span></div>
      <section class="card acr"><div><b class="h">Accredited investor</b><span class="mut sm">{{ data.accredited ? 'Confirmed' + (data.accredited_at ? ' on ' + new Date(data.accredited_at).toLocaleDateString('en-GB') : '') + '. The client sees pre-IPO deals up to their risk level.' : 'Not confirmed. Pre-IPO deals stay hidden from the client until you confirm it (income, net worth or a professional licence, checked by you).' }}</span></div><button v-if="!data.accredited" class="btn secondary sm" :disabled="!!busy" @click="act('accredited')">Confirm accredited</button><button v-else class="lk" @click="act('not_accredited')">Remove</button></section>
      <section v-if="data.country === 'NG'" class="card bvn"><b class="h">BVN</b><span class="mut sm">{{ data.bvn_name ? 'Verified: ' + data.bvn_name : data.bvn_last4 ? 'On file, ending ' + data.bvn_last4 + '. Check it with Prembly.' : 'Not given yet.' }}</span><span class="row"><input v-model="bvn" inputmode="numeric" maxlength="11" placeholder="BVN (11 digits)" aria-label="BVN"><button class="btn sm" :disabled="bvn.length !== 11 || !!busy" @click="checkBvn">Verify with Prembly</button></span></section>
      <section v-if="cur" class="card rv">
        <div class="vw"><div class="h2"><b>{{ cur.doc_label }}</b><span class="sm"><a :href="docUrl(cur)" target="_blank">Open full size</a></span></div>
          <img v-if="cur.image" :src="docUrl(cur)" :alt="cur.doc_label" class="doc"><iframe v-else :src="docUrl(cur)" :title="cur.doc_label" class="doc" />
          <div v-if="data.items.length > 1" class="its"><button v-for="i in data.items" :key="i.id" :class="{ on: cur.id === i.id }" @click="sel = i.id">{{ i.doc_label }} · {{ i.status === 'to_review' ? 'to review' : i.status }}</button></div></div>
        <div class="ck"><b class="h">Check against what we hold</b><span class="mut sm">{{ cur.ai ? 'AI read the document; confirm each line.' : 'The AI could not read this one; check it yourself.' }}</span>
          <template v-if="cur.ai"><div v-for="c in cur.ai.checks" :key="c.name" class="cl"><span>{{ c.name }}<em>{{ c.detail }}</em></span><span :class="c.result">{{ RES[c.result] }}</span></div><p class="mut sm">{{ cur.ai.summary }}</p></template>
          <div class="cl"><span>We hold<em>{{ data.expected?.name }}{{ data.expected?.address ? ' · ' + data.expected.address : '' }}</em></span></div>
          <template v-if="cur.status === 'to_review'"><button class="btn" :disabled="!!busy" @click="act(data.steps.filter((s) => s.state !== 'done').length <= 1 ? 'accept_verify' : 'accept', { item_id: cur.id })">{{ data.steps.filter((s) => s.state !== 'done').length <= 1 ? 'Accept and mark verified' : 'Accept' }}</button>
            <textarea v-model="note" rows="2" maxlength="500" placeholder="If not: a line the client will see, e.g. 'The bill is from June; we need one from the last 3 months.'" /><div class="g2"><button class="btn secondary" :disabled="!!busy" @click="act('reject', { item_id: cur.id })">Ask for another</button><button class="btn secondary red" :disabled="!!busy" @click="act('fail')">Fail the check</button></div><span class="mut sm">The client is told what to do next in their portal and by email.</span></template>
          <p v-else class="mut sm">{{ cur.status === 'accepted' ? 'Accepted' : 'Not accepted: ' + (cur.note ?? '') }}</p></div>
      </section>
      <section class="card upl"><b class="h">Add a document for the client</b><span class="row"><select v-model="upKind" aria-label="What for"><option value="id_document">Government ID</option><option value="proof_of_address">Proof of address</option></select><select v-model="dt" aria-label="Document type"><option v-for="t in types" :key="t.key" :value="t.key">{{ t.label }}</option></select><button class="btn secondary sm" :disabled="!!busy" @click="file?.click()">{{ busy === 'up' ? 'Uploading…' : 'Upload' }}</button><input ref="file" type="file" hidden accept=".pdf,image/png,image/jpeg,image/webp" @change="upload"></span></section>
      <section v-if="data.events.length" class="card"><b class="h">Activity</b><div class="ev3"><template v-for="(e, k) in data.events" :key="k"><span class="mut">{{ when(e.created_at) }}</span><span>{{ e.text }}</span><span class="mut">{{ e.actor === 'staff' ? 'Team' : e.actor === 'client' ? 'Client' : 'Automatic' }}</span></template></div></section>
    </template>
  </div>
</template>
<style scoped>
.idc { display: flex; flex-direction: column; gap: 12px; } .card { margin: 0; } .h { display: block; font-size: 15px; margin-bottom: 6px; } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; } .error { color: var(--c-danger); margin: 0; } .okm { color: var(--c-ok); margin: 0; }
.tag { align-self: flex-start; font-size: 12px; padding: 2px 8px; background: var(--c-paper-2); } .tag.blue { background: #e6ecf2; color: var(--c-blue-deep); } .tag.warn { background: #fff6e6; color: #7a4a06; }
.sum { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 24px; align-items: center; } .sl { display: flex; flex-direction: column; gap: 8px; } .big { font-size: 26px; font-weight: 600; } .pb { display: block; height: 8px; background: #e6ecf2; } .pb i { display: block; height: 100%; background: var(--c-blue-deep); }
.steps { list-style: none; margin: 0; padding: 0; } .steps li { display: flex; gap: 12px; padding: 11px 0; border-top: 1px solid var(--c-rule); } .steps li:first-child { border-top: 0; } .steps b { display: block; font-weight: 500; font-size: 14px; } .steps em { display: block; font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.nb { width: 22px; height: 22px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--c-rule-strong); font-size: 12px; color: var(--c-blue-deep); } li.done .nb { border-color: var(--c-blue-deep); } li.now .nb { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } li.review .nb { border-color: #b54708; color: #b54708; } li.failed .nb { border-color: var(--c-danger); color: var(--c-danger); }
.up { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 24px; } .ul { display: flex; flex-direction: column; gap: 10px; }
.dts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; } .dts button { font: inherit; text-align: left; padding: 12px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; } .dts button.on { border-color: var(--c-navy); background: #f7f9fb; } .dts b { display: block; font-weight: 500; font-size: 14px; } .dts span { font-size: 12px; color: var(--c-muted); }
.drop { border: 1px dashed var(--c-rule-strong); padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 6px; background: #fafaf8; text-align: center; } .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
.acc { background: #fafaf8; padding: 16px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; } .acc .sep { border-top: 1px solid var(--c-rule); padding-top: 10px; margin-top: 4px; }
.rw { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .rw em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); }
.ev { display: grid; grid-template-columns: 130px 1fr; gap: 6px 16px; font-size: 13px; } .ev3 { display: grid; grid-template-columns: 130px 1fr 90px; gap: 6px 16px; font-size: 13px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0; padding: 14px 0; } .sc { padding: 0 16px; border-left: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 4px; } .sc:first-child { border-left: 0; } .lbl { font-size: 12.5px; color: var(--c-muted); } .sc b { font-weight: 500; font-size: 14px; display: flex; align-items: center; gap: 6px; } .sc b i { width: 8px; height: 8px; } .sc em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.bar2 { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.acr { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .acr .h { margin-bottom: 2px; }
.bvn { display: flex; flex-direction: column; gap: 6px; } .bvn input { max-width: 200px; }
.rv { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 24px; } .vw { display: flex; flex-direction: column; gap: 10px; } .h2 { display: flex; justify-content: space-between; } .doc { width: 100%; height: 440px; border: 1px solid var(--c-rule); background: #e9ecef; object-fit: contain; }
.its { display: flex; gap: 6px; flex-wrap: wrap; } .its button { font: inherit; font-size: 12px; padding: 4px 8px; border: 1px solid var(--c-rule); background: #fff; cursor: pointer; } .its button.on { border-color: var(--c-navy); }
.ck { display: flex; flex-direction: column; gap: 8px; } .cl { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .cl em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .cl .match { color: var(--c-blue-deep); white-space: nowrap; } .cl .check { color: #b54708; white-space: nowrap; } .cl .mismatch { color: var(--c-danger); white-space: nowrap; }
textarea, input, select { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; box-sizing: border-box; } textarea { width: 100%; resize: vertical; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .red { color: var(--c-danger) !important; }
.upl { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; } .upl .h { margin: 0; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
@media (max-width: 900px) { .sum, .up, .rv { grid-template-columns: 1fr; } }
</style>
