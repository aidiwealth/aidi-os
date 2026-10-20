<script setup lang="ts">
import { mdRender } from '~/shared/markdown'
// Services desk: the wording of every agreement (edit it; each save is a new version for everything signed from then
// on) and every agreement signed or waiting: job SLAs and the Terms and Privacy Agreement each Finvry sign-up signs.
useHead({ title: 'Agreements' })
interface T { code: string; title: string; body: string; version: number; custom: boolean; updated_at: string | null; label: string; fields: string[] }
interface S { id: string; code: string; title: string; version: number; status: string; effective_date: string; signed_at: string | null; signer_name: string | null; signer_email: string | null; signature_kind: string | null; job_id: string | null; client_id: string | null; organization_id: string | null; created_at: string; party: string | null; job: string | null }
const { data, refresh } = await useFetch<{ templates: T[]; signatures: S[] }>('/api/services/agreements')
const tab = ref<'signed' | 'wording'>('signed'); const code = ref('sla')
const cur = computed(() => data.value?.templates.find((t) => t.code === code.value) ?? null)
const ed = reactive({ title: '', body: '' }); const preview = ref(false)
watch(cur, (t) => { if (t) { ed.title = t.title; ed.body = t.body } }, { immediate: true })
const dirty = computed(() => !!cur.value && (ed.title !== cur.value.title || ed.body !== cur.value.body))
const msg = ref(''); const ok = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function save(reset = false) {
  if (reset && !await askConfirm('Reset the wording of "' + cur.value?.label + '" to the Finvry default? This saves a new version.')) return
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/services/agreements/template', { method: 'POST', body: reset ? { code: code.value, reset: true } : { code: code.value, title: ed.title, body: ed.body } }); await refresh(); ok.value = (reset ? 'Reset to the default' : 'Saved') + ' — version ' + cur.value?.version + ' is used from now on. Signed agreements keep the wording they were signed with.' }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const KIND: Record<string, string> = { sla: 'Service Level Agreement', terms_us: 'Terms (US)', terms_ng: 'Terms (Nigeria)', privacy_us: 'Privacy (US)', privacy_ng: 'Privacy (Nigeria)' }
const f = ref<'all' | 'sla' | 'signup' | 'pending'>('all')
const rows = computed(() => (data.value?.signatures ?? []).filter((s) => f.value === 'all' || (f.value === 'sla' ? s.code === 'sla' : f.value === 'pending' ? s.status === 'pending' : s.code !== 'sla')))
const n = computed(() => { const l = data.value?.signatures ?? []; return { signed: l.filter((s) => s.status === 'signed').length, pending: l.filter((s) => s.status === 'pending').length, sla: l.filter((s) => s.code === 'sla' && s.status === 'signed').length, signup: l.filter((s) => s.code !== 'sla').length } })
const day = (d: string) => new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
async function openPdf(id: string) { const w = window.open('', '_blank'); try { const r = await $fetch<{ url: string }>('/api/services/agreements/' + id + '/pdf'); if (w) w.location.href = r.url } catch (e) { w?.close(); msg.value = err(e) } }
</script>
<template>
  <section v-if="data">
    <CsNav />
    <div class="hd"><div><p class="eyebrow">Services desk</p><h1>Agreements</h1><p class="lead">The Service Level Agreement clients sign with each order, and the Terms of Service and Data Privacy Agreement every Finvry sign-up signs. Nigerian clients get Nigerian-law versions; everyone else California and US federal law.</p></div></div>
    <div class="fx-stats">
      <StatTile icon="check" tone="g" label="Signed" :value="n.signed" :note="n.sla + ' job agreements · ' + n.signup + ' sign-up'" />
      <StatTile clickable icon="clock" :tone="n.pending ? 'a' : 'g'" label="Waiting for signature" :value="n.pending" :on="tab === 'signed' && f === 'pending'" @click="tab = 'signed'; f = 'pending'" />
      <StatTile icon="doc" tone="b" label="SLA version" :value="'v' + (data.templates.find((t) => t.code === 'sla')?.version ?? 1)" :note="data.templates.find((t) => t.code === 'sla')?.custom ? 'Edited by your team' : 'Finvry default'" />
    </div>
    <nav class="tabs"><button :class="{ on: tab === 'signed' }" @click="tab = 'signed'">Signed and sent</button><button :class="{ on: tab === 'wording' }" @click="tab = 'wording'">Wording</button></nav>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>

    <template v-if="tab === 'signed'">
      <div class="chips"><button v-for="[k, l] in ([['all', 'All'], ['sla', 'Job agreements'], ['signup', 'Sign-up'], ['pending', 'Waiting']] as const)" :key="k" :class="{ on: f === k }" @click="f = k">{{ l }}</button></div>
      <div class="box"><table v-if="rows.length"><thead><tr><th>Agreement</th><th>Client / workspace</th><th>Signed by</th><th>Date</th><th>Status</th></tr></thead>
        <tbody><tr v-for="s in rows" :key="s.id"><td><span class="an"><FileBadge name="a.pdf" size="sm" /><span><button v-if="s.status === 'signed'" type="button" class="lk" @click="openPdf(s.id)">{{ s.title }}</button><b v-else>{{ s.title }}</b><em>{{ KIND[s.code] ?? s.code }} · v{{ s.version }}</em></span></span></td>
          <td>{{ s.party ?? '—' }}<NuxtLink v-if="s.job_id" :to="'/services/' + s.job_id" class="sub">{{ s.job?.replace(/^Order: /, '') ?? 'Job' }}</NuxtLink></td>
          <td>{{ s.signer_name ?? '—' }}<span class="sub">{{ s.signer_email }}{{ s.signature_kind ? ' · ' + s.signature_kind : '' }}</span></td>
          <td>{{ s.signed_at ? day(s.signed_at) : '—' }}<span class="sub">Effective {{ day(s.effective_date) }}</span></td>
          <td><span class="fx-pill" :class="s.status === 'signed' ? 'g' : 'amber'">{{ s.status === 'signed' ? 'Signed' : 'Waiting' }}</span></td></tr></tbody></table>
        <EmptyState v-else icon="documents" title="No agreements yet" text="Agreements appear here when clients sign them with an order or at sign-up, or when you send one from a job." /></div>
    </template>

    <div v-else class="wd">
      <aside class="tl"><button v-for="t in data.templates" :key="t.code" type="button" :class="{ on: code === t.code }" @click="code = t.code"><b>{{ t.label }}</b><em>v{{ t.version }} · {{ t.custom ? 'edited ' + (t.updated_at ? day(t.updated_at) : '') : 'Finvry default' }}</em></button></aside>
      <div v-if="cur" class="card ed">
        <label class="label">Title<input v-model="ed.title" maxlength="200"></label>
        <div class="eh"><span class="label">Wording</span><button type="button" class="lk" @click="preview = !preview">{{ preview ? 'Edit' : 'Preview' }}</button></div>
        <div v-if="preview" class="pv mdb" v-html="mdRender(ed.body)" />
        <ClientOnly v-else><RichEditor v-model="ed.body" :min-height="460" :max-length="100000" /></ClientOnly>
        <p class="hint">Fields filled in when it is signed: <code v-for="x in cur.fields" :key="x" v-text="'{{' + x + '}}'" /></p>
        <div class="row"><button type="button" class="btn" :disabled="busy || !dirty" @click="save()">{{ busy ? 'Saving…' : 'Save as version ' + (cur.version + 1) }}</button><button type="button" class="btn secondary" :disabled="busy || !dirty" @click="ed.title = cur.title; ed.body = cur.body">Discard changes</button><span class="sp" /><button type="button" class="lk" :disabled="busy" @click="save(true)">Reset to Finvry default</button></div>
        <p class="hint">These are templates, not legal advice. Have your counsel review them before relying on them.</p>
      </div>
    </div>
  </section>
</template>
<style scoped>
.hd h1 { margin: 0; } .eyebrow { margin: 0 0 4px; font-size: 13px; color: var(--c-muted); } .lead { margin: 6px 0 0; color: var(--c-muted); font-size: 14.5px; max-width: 820px; }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin-bottom: 14px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; }
.an { display: flex; gap: 10px; align-items: center; } .an > span { display: flex; flex-direction: column; } .an em { font-style: normal; font-size: 12px; color: var(--c-muted); } .an b { font-weight: 500; }
.sub { display: block; font-size: 12px; color: var(--c-muted); text-decoration: none; } a.sub { color: var(--c-blue-deep); }
.lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; text-align: left; } .lk:disabled { opacity: .5; }
.wd { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 16px; align-items: start; } .tl { display: flex; flex-direction: column; background: #fff; border: 1px solid var(--c-rule); } .tl button { background: none; border: 0; border-bottom: 1px solid var(--c-rule); padding: 12px 14px; text-align: left; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 2px; } .tl button.on { background: var(--c-signal-soft); box-shadow: inset 3px 0 0 var(--c-navy); } .tl b { font-size: 14px; font-weight: 500; } .tl em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.ed { display: flex; flex-direction: column; gap: 12px; } .ed .label { display: flex; flex-direction: column; gap: 6px; } .ed input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .eh { display: flex; justify-content: space-between; align-items: baseline; }
.pv { border: 1px solid var(--c-rule); padding: 16px 20px; max-height: 620px; overflow-y: auto; font-size: 14px; line-height: 1.6; } .pv :deep(h2), .pv :deep(h3) { font-size: 16px; margin: 16px 0 6px; }
.hint { font-size: 12.5px; color: var(--c-muted); margin: 0; } .hint code { font-size: 11.5px; background: var(--c-paper-2); padding: 1px 5px; margin: 0 4px 4px 0; display: inline-block; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .sp { flex: 1; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 900px) { .wd { grid-template-columns: 1fr; } }
</style>
