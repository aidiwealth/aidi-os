<script setup lang="ts">
// Drop the lawyer's cap table, pro forma, SAFEs, notes, certificates and grant letters together; AI reads them into
// one cap table; the founder checks it (totals cross-checked against the documents) and saves.
import { table, type Data } from '~/shared/captable'
const props = defineProps<{ open: boolean; hasData: boolean; initial?: File[]; ct?: string; ctName?: string }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()
type Kind = 'founder' | 'employee' | 'advisor' | 'investor' | 'other'
interface Prop { as_of: string | null; currency: string
  classes: { name: string; kind: 'common' | 'preferred'; liq_pref: number; participating: boolean; seniority: number; issue_price: number | null; source: string }[]
  holders: { name: string; email: string | null; kind: Kind }[]
  issuances: { holder: string; class: string; shares: number; price: number | null; issued_on: string | null; certificate: string | null; source: string }[]
  plans: { name: string; reserved: number; source: string }[]
  grants: { plan: string; holder: string; kind: 'option' | 'rsu' | 'restricted'; shares: number; strike: number | null; granted_on: string | null; vest_start: string | null; vest_months: number | null; cliff_months: number | null; exercised: number; source: string }[]
  convertibles: { holder: string; kind: 'safe' | 'note'; amount: number; valuation_cap: number | null; discount_pct: number | null; post_money: boolean; mfn: boolean; interest_pct: number | null; issued_on: string | null; maturity_on: string | null; source: string }[]
  stated: { issued: number | null; fully_diluted: number | null; pool_available: number | null }; notes: string[] }
const files = ref<File[]>([]), keep = ref(true), busy = ref(false), msg = ref(''), p = ref<Prop | null>(null), read = ref<string[]>([]), mode = ref<'replace' | 'add' | 'new'>(props.hasData ? 'add' : 'replace'), newName = ref(''), step = ref<'files' | 'review'>('files')
watch(() => props.open, (o) => { if (o) { files.value = [...(props.initial ?? [])]; p.value = null; step.value = 'files'; msg.value = ''; mode.value = props.hasData ? 'add' : 'replace'; newName.value = 'Imported ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) } })
const MAX = 10
function add(ev: Event) { const list = Array.from(((ev.target as HTMLInputElement).files ?? []) as ArrayLike<File>); for (const f of list) if (!files.value.some((x) => x.name === f.name && x.size === f.size)) files.value.push(f); if (files.value.length > MAX) { files.value = files.value.slice(0, MAX); msg.value = 'Up to ' + MAX + ' files at a time.' } }
const size = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
async function readDocs() {
  busy.value = true; msg.value = ''
  const fd = new FormData(); for (const f of files.value) fd.append('files', f, f.name); fd.append('keep', keep.value ? '1' : '0')
  try { const r = await $fetch<{ proposal: Prop; files: string[] }>('/api/equity/read-docs', { method: 'POST', body: fd }); p.value = r.proposal; read.value = r.files; step.value = 'review' }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
// Preview the proposal with the same maths the cap table uses.
const today = new Date().toISOString().slice(0, 10)
const asData = computed<Data | null>(() => { const x = p.value; if (!x) return null; const on = x.as_of ?? today
  return { classes: x.classes.map((c) => ({ id: 'c:' + c.name, name: c.name, kind: c.kind, liq_pref: c.liq_pref, participating: c.participating, seniority: c.seniority })),
    holders: x.holders.map((h) => ({ id: 'h:' + h.name, name: h.name, kind: h.kind })),
    issuances: x.issuances.map((i, k) => ({ id: 'i' + k, holder_id: 'h:' + i.holder, class_id: 'c:' + i.class, shares: Number(i.shares) || 0, price: i.price, issued_on: i.issued_on ?? on })),
    plans: x.plans.map((pl) => ({ id: 'p:' + pl.name, name: pl.name, reserved: Number(pl.reserved) || 0 })),
    grants: x.grants.map((g, k) => ({ id: 'g' + k, plan_id: 'p:' + g.plan, holder_id: 'h:' + g.holder, shares: Number(g.shares) || 0, strike: g.strike, granted_on: g.granted_on ?? on, vest_start: g.vest_start ?? g.granted_on ?? on, vest_months: g.vest_months ?? 0, cliff_months: g.cliff_months ?? 0, exercised: g.exercised, cancelled_on: null })),
    convertibles: x.convertibles.map((v, k) => ({ id: 'v' + k, holder_id: 'h:' + v.holder, kind: v.kind, amount: Number(v.amount) || 0, currency: x.currency, valuation_cap: v.valuation_cap, discount_pct: v.discount_pct, post_money: v.post_money, mfn: v.mfn, interest_pct: v.interest_pct, issued_on: v.issued_on ?? on, status: 'outstanding' })) } })
const t = computed(() => (asData.value ? table(asData.value, today) : null))
const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en-US')), pct = (v: number) => (Math.round(v * 100) / 100).toFixed(2) + '%'
const money = (v: number | null) => (v === null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: p.value?.currency ?? 'USD', maximumFractionDigits: v < 0.01 ? 6 : v < 10 ? 4 : 0 }).format(v))
const checks = computed(() => { const s = p.value?.stated, x = t.value; if (!s || !x) return []
  const row = (label: string, stated: number | null, ours: number) => (stated === null ? null : { label, stated, ours, ok: Math.abs(stated - ours) <= Math.max(1, stated * 0.0005) })
  return [row('Shares issued', s.issued, x.issued), row('Fully diluted', s.fully_diluted, x.fd), row('Pool available', s.pool_available, x.pool)].filter(Boolean) as { label: string; stated: number; ours: number; ok: boolean }[] })
const KIND: Record<Kind, string> = { founder: 'Founder', employee: 'Employee', advisor: 'Advisor', investor: 'Investor', other: 'Other' }
function drop<K extends 'issuances' | 'grants' | 'convertibles' | 'plans' | 'classes'>(k: K, i: number) { p.value![k].splice(i, 1) }
function dropHolder(i: number) { const name = p.value!.holders[i]!.name; const x = p.value!; x.holders.splice(i, 1); x.issuances = x.issuances.filter((r) => r.holder !== name); x.grants = x.grants.filter((r) => r.holder !== name); x.convertibles = x.convertibles.filter((r) => r.holder !== name) }
function rename(i: number, v: string) { const x = p.value!, old = x.holders[i]!.name; v = v.trim(); if (!v || v === old) return; for (const r of [...x.issuances, ...x.grants, ...x.convertibles]) if (r.holder === old) r.holder = v; x.holders[i]!.name = v }
const sec = ref<'holders' | 'issuances' | 'grants' | 'convertibles' | 'classes'>('holders')
async function save() {
  if (mode.value === 'replace' && props.hasData && !confirm('Replace your current cap table with this one? Everything entered so far will be removed.')) return
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ ct: string; issuances: number; grants: number; convertibles: number; skipped: number }>('/api/equity/import-apply', { method: 'POST', body: { proposal: p.value, mode: mode.value, ct: props.ct, name: newName.value } }); emit('saved', r.ct); emit('close'); if (r.skipped) alert(r.skipped + ' rows were already on your cap table and were skipped.') }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
</script>
<template>
  <AppModal :open="open" :title="step === 'files' ? 'Build your cap table from documents' : 'Check your cap table'" wide @close="emit('close')">
    <div v-if="step === 'files'" class="ci">
      <p class="lead">Drop everything you have, all at once: your lawyer's cap table or pro forma (Excel or PDF), SAFE and note agreements, share certificates, stock purchase agreements, board consents and option grant letters. AI reads them together and builds the cap table. You check it before anything is saved.</p>
      <DropZone multiple accept=".pdf,.xlsx,.xlsm,.csv,.docx,.txt" :disabled="busy" hint="PDF, Excel, CSV or Word · up to 10 files" @change="add" />
      <ul v-if="files.length" class="fl"><li v-for="(f, i) in files" :key="f.name + f.size"><span class="ext">{{ (f.name.split('.').pop() ?? '').toUpperCase() }}</span><b>{{ f.name }}</b><em>{{ size(f.size) }}</em><button class="lk red" :disabled="busy" @click="files.splice(i, 1)">Remove</button></li></ul>
      <label class="chk"><input v-model="keep" type="checkbox"> Keep copies of these files in Documents</label>
      <p v-if="busy" class="mut">Reading {{ files.length }} file{{ files.length === 1 ? '' : 's' }}… this can take a minute for long agreements.</p>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <div v-else-if="p && t" class="ci">
      <p class="mut">Read from {{ read.join(', ') }}{{ p.as_of ? ' · as of ' + p.as_of : '' }}. Fix anything that is wrong below, then save.</p>
      <div class="fx-stats"><StatTile label="Fully diluted" :value="n(t.fd)" full /><StatTile label="Shares issued" :value="n(t.issued)" full /><StatTile label="Option pool available" :value="n(t.pool)" :note="n(t.granted) + ' granted'" full /><StatTile label="SAFEs and notes" :value="briefMoney(p.convertibles.reduce((s, v) => s + Number(v.amount || 0), 0), p.currency)" :note="p.convertibles.length + ' outstanding'" /></div>
      <div v-if="checks.length" class="ck"><p class="bh">Checked against the totals in your documents</p><div v-for="c in checks" :key="c.label" class="cr"><span class="dot" :class="c.ok ? 'ok' : 'red'" /><b>{{ c.label }}</b><span>Documents say {{ n(c.stated) }}</span><span>{{ c.ok ? 'Matches' : 'We have ' + n(c.ours) + ' (' + (c.ours > c.stated ? '+' : '') + n(c.ours - c.stated) + ')' }}</span></div></div>
      <div v-if="p.notes.length" class="nt"><p class="bh">Notes from reading your files</p><ul><li v-for="(x, i) in p.notes" :key="i">{{ x }}</li></ul></div>
      <nav class="tabs"><button v-for="[k, l] in ([['holders', 'Holders (' + p.holders.length + ')'], ['issuances', 'Shares (' + p.issuances.length + ')'], ['grants', 'Options (' + p.grants.length + ')'], ['convertibles', 'SAFEs & notes (' + p.convertibles.length + ')'], ['classes', 'Classes & pools']] as const)" :key="k" :class="{ on: sec === k }" @click="sec = k">{{ l }}</button></nav>
      <div class="tw">
        <table v-if="sec === 'holders'" class="t" data-nosearch><thead><tr><th>Holder</th><th>Type</th><th class="r">Fully diluted</th><th class="r">% FD</th><th /></tr></thead>
          <tbody><tr v-for="(h, i) in p.holders" :key="h.name"><td><input :value="h.name" class="w" @change="rename(i, ($event.target as HTMLInputElement).value)"></td><td><select v-model="h.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></td>
            <td class="r">{{ n(t.rows.find((r) => r.holder.name === h.name)?.fd ?? 0) }}</td><td class="r">{{ pct(t.rows.find((r) => r.holder.name === h.name)?.pctFd ?? 0) }}</td><td class="r"><button class="lk red" @click="dropHolder(i)">Remove</button></td></tr></tbody></table>
        <table v-else-if="sec === 'issuances'" class="t" data-nosearch><thead><tr><th>Holder</th><th>Class</th><th class="r">Shares</th><th class="r">Price</th><th>Issued</th><th>From</th><th /></tr></thead>
          <tbody><tr v-for="(r, i) in p.issuances" :key="i"><td>{{ r.holder }}</td><td><select v-model="r.class"><option v-for="c in p.classes" :key="c.name">{{ c.name }}</option></select></td><td class="r"><input v-model.number="r.shares" type="number" min="1" class="nm"></td><td class="r">{{ money(r.price) }}</td><td><input v-model="r.issued_on" type="date"></td><td class="src">{{ r.source }}</td><td class="r"><button class="lk red" @click="drop('issuances', i)">Remove</button></td></tr></tbody></table>
        <table v-else-if="sec === 'grants'" class="t" data-nosearch><thead><tr><th>Holder</th><th>Plan</th><th class="r">Shares</th><th class="r">Strike</th><th>Granted</th><th>Vesting</th><th>From</th><th /></tr></thead>
          <tbody><tr v-for="(g, i) in p.grants" :key="i"><td>{{ g.holder }}</td><td>{{ g.plan }}</td><td class="r"><input v-model.number="g.shares" type="number" min="1" class="nm"></td><td class="r">{{ money(g.strike) }}</td><td><input v-model="g.granted_on" type="date"></td>
            <td class="vs"><input v-model.number="g.vest_months" type="number" min="0" max="120" class="sm"> mo · <input v-model.number="g.cliff_months" type="number" min="0" max="60" class="sm"> cliff</td><td class="src">{{ g.source }}</td><td class="r"><button class="lk red" @click="drop('grants', i)">Remove</button></td></tr></tbody></table>
        <table v-else-if="sec === 'convertibles'" class="t" data-nosearch><thead><tr><th>Investor</th><th>Type</th><th class="r">Amount</th><th class="r">Cap</th><th class="r">Discount</th><th>Dated</th><th>From</th><th /></tr></thead>
          <tbody><tr v-for="(v, i) in p.convertibles" :key="i"><td>{{ v.holder }}</td><td><select v-model="v.kind"><option value="safe">SAFE</option><option value="note">Note</option></select><label v-if="v.kind === 'safe'" class="pm"><input v-model="v.post_money" type="checkbox"> post-money</label></td>
            <td class="r"><input v-model.number="v.amount" type="number" min="1" class="nm"></td><td class="r"><input v-model.number="v.valuation_cap" type="number" min="0" class="nm"></td><td class="r"><input v-model.number="v.discount_pct" type="number" min="0" max="99" class="sm">%</td><td><input v-model="v.issued_on" type="date"></td><td class="src">{{ v.source }}</td><td class="r"><button class="lk red" @click="drop('convertibles', i)">Remove</button></td></tr></tbody></table>
        <template v-else>
          <table class="t" data-nosearch><thead><tr><th>Share class</th><th>Type</th><th class="r">Preference</th><th class="r">Seniority</th><th>From</th><th /></tr></thead>
            <tbody><tr v-for="(c, i) in p.classes" :key="c.name"><td>{{ c.name }}</td><td><select v-model="c.kind"><option value="common">Common</option><option value="preferred">Preferred</option></select></td><td class="r">{{ c.kind === 'preferred' ? c.liq_pref + 'x' + (c.participating ? ', participating' : '') : '—' }}</td><td class="r">{{ c.kind === 'preferred' ? c.seniority : '—' }}</td><td class="src">{{ c.source }}</td><td class="r"><button v-if="!p.issuances.some((r) => r.class === c.name)" class="lk red" @click="drop('classes', i)">Remove</button></td></tr></tbody></table>
          <table class="t" data-nosearch><thead><tr><th>Option pool</th><th class="r">Reserved</th><th class="r">Granted</th><th>From</th><th /></tr></thead>
            <tbody><tr v-for="(pl, i) in p.plans" :key="pl.name"><td>{{ pl.name }}</td><td class="r"><input v-model.number="pl.reserved" type="number" min="0" class="nm"></td><td class="r">{{ n(p.grants.filter((g) => g.plan === pl.name).reduce((s, g) => s + Number(g.shares || 0), 0)) }}</td><td class="src">{{ pl.source }}</td><td class="r"><button v-if="!p.grants.some((g) => g.plan === pl.name)" class="lk red" @click="drop('plans', i)">Remove</button></td></tr></tbody></table>
          <p v-if="!p.plans.length" class="mut">No option pool found in your files.</p>
        </template>
      </div>
      <div v-if="hasData" class="md"><label><input v-model="mode" type="radio" value="add"> Add to "{{ ctName }}" <em>(rows already there are skipped)</em></label><label><input v-model="mode" type="radio" value="replace"> Replace "{{ ctName }}"</label><label><input v-model="mode" type="radio" value="new"> Save as a new cap table</label><input v-if="mode === 'new'" v-model="newName" class="nn" maxlength="120" aria-label="New cap table name"></div>
      <p class="mut sm2">AI can misread documents. Check share counts against your lawyer's records; this is not legal advice.</p>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <template #foot>
      <template v-if="step === 'files'"><span class="sp" /><button class="btn secondary" @click="emit('close')">Cancel</button><button class="btn" :disabled="busy || !files.length" @click="readDocs">{{ busy ? 'Reading…' : 'Read ' + (files.length || '') + ' file' + (files.length === 1 ? '' : 's') }}</button></template>
      <template v-else><button class="btn secondary" :disabled="busy" @click="step = 'files'">Back</button><span class="sp" /><button class="btn" :disabled="busy || !p?.holders.length" @click="save">{{ busy ? 'Saving…' : 'Save cap table' }}</button></template>
    </template>
  </AppModal>
</template>
<style scoped>
.ci { display: flex; flex-direction: column; gap: 14px; } .ci .fx-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); } @media (max-width: 760px) { .ci .fx-stats { grid-template-columns: 1fr 1fr; } } .lead { margin: 0; color: var(--c-ink-soft); font-size: 14px; line-height: 1.55; } .mut { margin: 0; color: var(--c-muted); font-size: 13px; } .sm2 { font-size: 12px; }
.fl { list-style: none; margin: 0; padding: 0; border: 1px solid var(--c-rule); } .fl li { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .fl li:last-child { border-bottom: 0; }
.fl b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .fl em { font-style: normal; color: var(--c-muted); font-size: 12.5px; } .ext { font-size: 10.5px; font-weight: 600; letter-spacing: .04em; color: var(--c-ink-soft); border: 1px solid var(--c-rule-strong); text-align: center; padding: 2px 0; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); }
.bh { margin: 0 0 6px; font-weight: 600; font-size: 13.5px; }
.ck, .nt { border: 1px solid var(--c-rule); padding: 12px 14px; } .cr { display: grid; grid-template-columns: 10px 130px 1fr 1fr; gap: 10px; align-items: center; font-size: 13px; padding: 3px 0; } .cr b { font-weight: 500; }
.dot { width: 8px; height: 8px; border-radius: 50%; } .dot.ok { background: var(--c-ink-soft); } .dot.red { background: var(--c-danger); }
.nt ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--c-ink-soft); line-height: 1.55; }
.tabs { display: flex; gap: 20px; border-bottom: 1px solid var(--c-rule); flex-wrap: wrap; } .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 0; font: inherit; font-size: 13.5px; color: var(--c-muted); cursor: pointer; margin-bottom: -1px; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); }
.tw { overflow-x: auto; max-height: 46vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.t { width: 100%; border-collapse: collapse; font-size: 13px; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; position: sticky; top: 0; } .t td { padding: 6px 10px; border-bottom: 1px solid var(--c-rule); vertical-align: middle; } .t .r { text-align: right; }
.t input, .t select { font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid var(--c-rule-strong); background: #fff; } .t input.w { width: 100%; min-width: 180px; } .t input.nm { width: 120px; text-align: right; } .t input.sm { width: 52px; text-align: right; } .t input[type="checkbox"] { padding: 0; }
.src { font-size: 12px; color: var(--c-muted); max-width: 180px; } .vs { white-space: nowrap; font-size: 12.5px; color: var(--c-muted); } .pm { display: inline-flex; gap: 4px; align-items: center; margin-left: 8px; font-size: 12px; color: var(--c-muted); }
.md { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; } .md label { display: flex; gap: 8px; align-items: center; } .md .nn { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); max-width: 320px; margin-left: 24px; } .md em { font-style: normal; color: var(--c-muted); font-size: 12.5px; }
</style>
