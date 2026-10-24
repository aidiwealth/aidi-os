<script setup lang="ts">
// Investor positions and rights: who holds what across rounds, who holds a power position against the founders, and
// the rights in side letters and pro rata letters (read with AI, matched to holders by the founder).
import { positions, proRataTake, RIGHT_LABEL, type Right } from '~/shared/positions'
import type { Data } from '~/shared/captable'
const props = defineProps<{ data: Data & { holders: (Data['holders'][number] & { email?: string | null })[] }; ct: string; rights: Right[]; docs: { convertible_id: string | null; issuance_id: string | null; round: string | null }[] }>()
const emit = defineEmits<{ changed: []; open: [docId: string] }>()
const today = new Date().toISOString().slice(0, 10)
const P = computed(() => positions(props.data, today, props.rights, props.docs))
const KIND: Record<string, string> = { founder: 'Founder', employee: 'Employee', advisor: 'Advisor', investor: 'Investor', other: 'Other' }
const pct = (v: number | null | undefined) => (v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2) + '%')
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const shared = computed(() => props.rights.filter((r) => !r.holder_id))
const hName = (id: string | null) => props.data.holders.find((h) => h.id === id)?.name ?? ''
// Pro rata in the next round.
const nextRound = ref(2000000)
const take = computed(() => proRataTake(P.value.rows, nextRound.value || 0))
const takeTotal = computed(() => take.value.reduce((a, x) => a + x.amount, 0))

// Read letters with AI, then check who each right belongs to.
interface Prop { party: string; party_role: string; holder_id: string | null; match: string; kind: string; summary: string; impact: string; clause: string; file: string; document_id: string | null; terms: Record<string, string | number>; on: boolean }
const rd = reactive({ open: false, rows: [] as Prop[], skipped: [] as string[], notes: '', room: true, saving: false, msg: '' })
const job = useAiJob<{ rights: Omit<Prop, 'on'>[]; skipped: string[]; notes: string }>()
function openRead() { Object.assign(rd, { open: true, rows: [], skipped: [], notes: '', msg: '' }); job.fail.value = null }
async function upRead(ev: Event) {
  const fs = Array.from((ev.target as HTMLInputElement).files ?? []); if (!fs.length) return
  const fd = new FormData(); fd.append('ct', props.ct); for (const f of fs) fd.append('file', f)
  rd.msg = ''
  try {
    const { id } = await $fetch<{ id: string }>('/api/equity/rights/read', { method: 'POST', body: fd })
    const r = await job.follow(id); if (!r) return
    Object.assign(rd, { rows: r.rights.map((x) => ({ ...x, on: true })), skipped: r.skipped, notes: r.notes })
    if (!r.rights.length) rd.msg = 'No rights were found in ' + (fs.length === 1 ? 'that file' : 'those files') + '. Side letters, pro rata letters and investor rights agreements work best.'
  } catch (e) { rd.msg = err(e) }
}
async function saveRead() {
  rd.saving = true; rd.msg = ''
  try { await $fetch('/api/equity/rights/apply', { method: 'POST', body: { ct: props.ct, room: rd.room, rows: rd.rows.filter((x) => x.on).map(({ on: _o, match: _m, file: _f, party_role: _p, ...x }) => x) } }); rd.open = false; emit('changed') }
  catch (e) { rd.msg = err(e) } finally { rd.saving = false }
}
const unmatched = computed(() => rd.rows.filter((x) => x.on && !x.holder_id && x.party_role !== 'all_investors' && x.party_role !== 'company').length)
// Change who a saved right belongs to, or add one by hand.
const ed = reactive({ open: false, id: '', holder_id: '' as string | null, party: '', kind: 'pro_rata', summary: '', impact: '', clause: '', document_id: null as string | null, terms: {} as Record<string, string | number>, pctv: '' as string | number, msg: '' })
function edit(r?: Right, holder?: string) { Object.assign(ed, r ? { open: true, id: r.id, holder_id: r.holder_id ?? '', party: r.party ?? '', kind: r.kind, summary: r.summary, impact: r.impact ?? '', clause: r.clause ?? '', document_id: r.document_id, terms: { ...(r.terms as Record<string, string | number>) }, pctv: (r.terms as Record<string, number>).pct ?? '', msg: '' } : { open: true, id: '', holder_id: holder ?? '', party: '', kind: 'pro_rata', summary: '', impact: '', clause: '', document_id: null, terms: {}, pctv: '', msg: '' }) }
async function saveEd() {
  ed.msg = ''
  const terms = { ...ed.terms }; if (ed.pctv !== '' && Number(ed.pctv) > 0) terms.pct = Number(ed.pctv); else delete terms.pct
  try { await $fetch('/api/equity/rights/apply', { method: 'POST', body: { ct: props.ct, room: false, rows: [{ id: ed.id || undefined, holder_id: ed.holder_id || null, party: ed.party || hName(ed.holder_id), kind: ed.kind, summary: ed.summary || RIGHT_LABEL[ed.kind], impact: ed.impact, clause: ed.clause, document_id: ed.document_id, terms }] } }); ed.open = false; emit('changed') }
  catch (e) { ed.msg = err(e) }
}
async function del(r: Right) { if (!await askConfirm('Remove this right? The letter stays in Documents.')) return; await $fetch('/api/equity/rights/' + r.id, { method: 'DELETE' }).catch(() => {}); emit('changed') }
async function remap(r: Right, holder: string) { try { await $fetch('/api/equity/rights/apply', { method: 'POST', body: { ct: props.ct, room: true, rows: [{ id: r.id, holder_id: holder || null, party: r.party ?? '', kind: r.kind, summary: r.summary, impact: r.impact ?? '', clause: r.clause ?? '', document_id: r.document_id, terms: r.terms }] } }); emit('changed') } catch (e) { notify(err(e)) } }
const termsText = (t: Record<string, unknown>) => [t.pct ? t.pct + '%' : '', t.multiple ? t.multiple + '×' : '', t.seats ? t.seats + ' seat' + (Number(t.seats) === 1 ? '' : 's') : '', t.threshold, t.applies_to, t.expires ? 'until ' + t.expires : ''].filter(Boolean).join(' · ')
</script>
<template>
  <div class="rp">
    <div class="card"><div class="ch"><h3>Investor positions</h3><span class="mut">{{ P.converted ? 'As converted: SAFEs and notes placed at their cap.' : P.founders.pctConverted != null ? 'As converted where a SAFE or note has a cap; uncapped ones convert at the next round.' : 'Fully diluted. SAFEs and notes convert at the next round.' }}</span></div>
      <div class="vs"><div><span class="mut">Founders together</span><b>{{ pct(P.founders.pctConverted ?? P.founders.pctFd) }}</b><em>{{ P.founders.names.join(', ') || 'No founders marked' }}</em></div><div><span class="mut">Investors together</span><b>{{ pct(P.investors.pctConverted ?? P.investors.pctFd) }}</b><em>{{ P.rows.filter((r) => r.power).length }} in a power position · {{ P.rows.filter((r) => r.rounds.length > 1 && r.holder.kind !== 'founder').length }} across several rounds</em></div>
        <div class="bar" aria-hidden="true"><i class="f" :style="{ width: Math.min(100, P.founders.pctConverted ?? P.founders.pctFd) + '%' }" /><i class="i" :style="{ width: Math.min(100, P.investors.pctConverted ?? P.investors.pctFd) + '%' }" /></div></div>
      <ul v-if="P.warnings.length" class="wn"><li v-for="w in P.warnings" :key="w">{{ w }}</li></ul>
      <table class="t" data-nosearch><thead><tr><th>Holder</th><th>Holdings by round</th><th class="r">% fully diluted</th><th class="r">% as converted</th><th>Rights</th><th>Flags</th></tr></thead>
        <tbody><tr v-for="r in P.rows" :key="r.holder.id" :class="{ pw: r.power, fo: r.holder.kind === 'founder' }"><td><b>{{ r.holder.name }}</b><span class="sub">{{ KIND[r.holder.kind] ?? 'Other' }}</span></td>
          <td><span v-for="(x, i) in r.instruments" :key="i" class="ins">{{ x.round }}<em>{{ x.shares != null ? x.shares.toLocaleString('en-US') + ' ' + (x.label === 'Options' ? 'options' : x.label === x.round ? 'shares' : x.label) : usd(x.amount ?? 0) + ' ' + x.label }}</em></span></td>
          <td class="r">{{ pct(r.pctFd) }}</td><td class="r b">{{ pct(r.pctConverted) }}<span v-if="r.unplaced" class="sub">+ uncapped SAFE / note (next round)</span></td>
          <td><button v-for="x in r.rights" :key="x.id" class="chip" :title="x.summary" @click="edit(x)">{{ RIGHT_LABEL[x.kind] }}</button><button class="lk sm" @click="edit(undefined, r.holder.id)">+ Add</button></td>
          <td><span v-for="f in r.flags" :key="f.code" class="fl" :class="f.code">{{ f.text }}</span><span v-if="!r.flags.length" class="mut">—</span></td></tr></tbody></table>
      <EmptyState v-if="!P.rows.length" compact icon="equity" title="No holders yet" /></div>

    <div class="card"><div class="ch"><h3>Rights from side letters</h3><div class="row"><button class="btn secondary sm" @click="edit()">Add a right</button><button class="btn sm" @click="openRead">Read letters (AI)</button></div></div>
      <p class="mut">Upload side letters and rights agreements. AI lists each right; you confirm before saving.</p>
      <table v-if="rights.length" class="t" data-nosearch><thead><tr><th>Right</th><th>Holder</th><th>What it means</th><th>Letter</th><th /></tr></thead>
        <tbody><tr v-for="r in rights" :key="r.id"><td><b>{{ RIGHT_LABEL[r.kind] }}</b><span class="sub">{{ r.summary }}</span><span v-if="termsText(r.terms)" class="sub">{{ termsText(r.terms) }}</span></td>
          <td><select :value="r.holder_id ?? ''" aria-label="Holder" @change="remap(r, ($event.target as HTMLSelectElement).value)"><option value="">{{ r.party ? r.party + ' (not on the cap table / all investors)' : 'All investors' }}</option><option v-for="h in data.holders" :key="h.id" :value="h.id">{{ h.name }}</option></select></td>
          <td class="im">{{ r.impact || '—' }}</td><td><button v-if="r.document_id" class="lk" @click="emit('open', r.document_id)">{{ r.doc_title || 'Open' }}</button><span v-else class="mut">—</span><span v-if="r.clause" class="sub">{{ r.clause }}</span></td>
          <td class="r"><button class="lk" @click="edit(r)">Edit</button> <button class="lk red" @click="del(r)">Remove</button></td></tr></tbody></table>
      <EmptyState v-else compact icon="equity" title="No rights recorded yet" text="Read a side letter with AI, or add a right by hand." />
      <p v-if="shared.length" class="note">{{ shared.length }} right{{ shared.length === 1 ? '' : 's' }} not tied to one holder: {{ shared.map((r) => (r.party || 'All investors') + ' — ' + RIGHT_LABEL[r.kind]).join('; ') }}.</p></div>

    <div v-if="take.length" class="card"><div class="ch"><h3>Pro rata at the next round</h3><label class="nr">Next round size (USD)<input v-model.number="nextRound" type="number" min="0" step="100000"></label></div>
      <table class="t" data-nosearch><thead><tr><th>Holder</th><th>Right</th><th class="r">Share of the round</th><th class="r">They may invest</th></tr></thead>
        <tbody><tr v-for="(x, i) in take" :key="i"><td>{{ x.holder }}</td><td>{{ RIGHT_LABEL[x.kind] }}</td><td class="r">{{ pct(x.pct) }}</td><td class="r">{{ usd(x.amount) }}</td></tr>
          <tr class="tot"><td colspan="2">Reserved for pro rata</td><td class="r">{{ pct(nextRound ? takeTotal / nextRound * 100 : 0) }}</td><td class="r">{{ usd(takeTotal) }}</td></tr></tbody></table>
      <p class="fine">If every holder takes up their right, {{ usd(Math.max(0, nextRound - takeTotal)) }} is left for new investors{{ takeTotal > nextRound ? ': the rights are larger than the round, so they will be cut back pro rata' : '' }}. The letters decide the exact amounts.</p></div>

    <AppModal :open="rd.open" title="Read side letters and pro rata letters" xl @close="rd.open = false">
      <div class="fm">
        <DropZone v-if="!rd.rows.length && !job.busy.value" accept=".pdf,.docx" multiple label="Drop the letters here or choose files" hint="PDF or Word, up to 10 files" @change="upRead" />
        <p v-if="job.busy.value" class="mut">{{ job.stage.value === 'store' ? 'Filing the letters…' : 'Reading the letters…' }} This can take a minute.</p>
        <div v-if="job.fail.value" class="error"><b>{{ job.fail.value.message }}</b><ul><li v-for="a in job.fail.value.advice" :key="a">{{ a }}</li></ul></div>
        <template v-if="rd.rows.length">
          <p class="mut">{{ rd.rows.length }} right{{ rd.rows.length === 1 ? '' : 's' }} found. Check each holder.{{ unmatched ? ' ' + unmatched + ' still need a holder.' : '' }}</p>
          <table class="t" data-nosearch><thead><tr><th /><th>Right</th><th>In the letter</th><th>Holder on the cap table</th><th>What it means</th></tr></thead>
            <tbody><tr v-for="(x, i) in rd.rows" :key="i" :class="{ off: !x.on }"><td><input v-model="x.on" type="checkbox" aria-label="Keep"></td>
              <td><select v-model="x.kind" aria-label="Type"><option v-for="(l, k) in RIGHT_LABEL" :key="k" :value="k">{{ l }}</option></select><span class="sub">{{ x.summary }}</span><span v-if="termsText(x.terms)" class="sub">{{ termsText(x.terms) }}</span></td>
              <td>{{ x.party }}<span class="sub">{{ x.file }}{{ x.clause ? ' · ' + x.clause : '' }}</span></td>
              <td><select v-model="x.holder_id" aria-label="Holder"><option :value="null">{{ x.party_role === 'all_investors' ? 'All investors' : x.party_role === 'company' ? 'The company' : 'Not on the cap table' }}</option><option v-for="h in data.holders" :key="h.id" :value="h.id">{{ h.name }}</option></select><span class="mt" :class="x.holder_id ? (x.match === 'none' ? 'by' : x.match) : x.party_role === 'all_investors' || x.party_role === 'company' ? 'ok' : 'none'">{{ x.holder_id ? (x.match === 'ai' ? 'Matched by AI' : x.match === 'name' ? 'Matched by name, check it' : 'Chosen by you') : x.party_role === 'all_investors' || x.party_role === 'company' ? 'Applies to all' : 'Pick a holder' }}</span></td>
              <td class="im">{{ x.impact }}</td></tr></tbody></table>
          <p v-if="rd.skipped.length" class="mut">Not read (not a rights document): {{ rd.skipped.join(', ') }}.</p>
          <p v-if="rd.notes" class="note">{{ rd.notes }}</p>
          <label class="chk"><input v-model="rd.room" type="checkbox"> Also file the letters in the data room (Financing)</label>
        </template>
        <p v-if="rd.msg" class="error">{{ rd.msg }}</p></div>
      <template #foot><button v-if="rd.rows.length" class="btn secondary" @click="rd.rows = []">Use other files</button><span class="sp" /><button class="btn secondary" @click="rd.open = false">Cancel</button><button v-if="rd.rows.length" class="btn" :disabled="rd.saving || !rd.rows.some((x) => x.on)" @click="saveRead">{{ rd.saving ? 'Saving…' : 'Save ' + rd.rows.filter((x) => x.on).length + ' right' + (rd.rows.filter((x) => x.on).length === 1 ? '' : 's') }}</button></template>
    </AppModal>

    <AppModal :open="ed.open" :title="ed.id ? 'Edit right' : 'Add a right'" @close="ed.open = false">
      <form id="rgf" class="fm g2" @submit.prevent="saveEd">
        <label class="label">Type<select v-model="ed.kind"><option v-for="(l, k) in RIGHT_LABEL" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Holder<select v-model="ed.holder_id"><option value="">All investors / not on the cap table</option><option v-for="h in data.holders" :key="h.id" :value="h.id">{{ h.name }}</option></select></label>
        <label v-if="!ed.holder_id" class="label w">Who holds it<input v-model="ed.party" maxlength="200" placeholder="e.g. All Series Seed holders"></label>
        <label class="label w">What it says<input v-model="ed.summary" maxlength="600" :placeholder="RIGHT_LABEL[ed.kind]"></label>
        <label v-if="ed.kind === 'pro_rata' || ed.kind === 'super_pro_rata'" class="label">Fixed share of the round (%)<input v-model="ed.pctv" inputmode="decimal" placeholder="Empty: keeps their stake"></label>
        <label class="label">Clause<input v-model="ed.clause" maxlength="300" placeholder="e.g. Side letter §2"></label>
        <label class="label w">What it means for the cap table<textarea v-model="ed.impact" rows="2" maxlength="600" /></label>
        <p v-if="ed.msg" class="error w">{{ ed.msg }}</p></form>
      <template #foot><button v-if="ed.id" class="lk red" @click="del(rights.find((r) => r.id === ed.id)!); ed.open = false">Remove</button><span class="sp" /><button class="btn secondary" @click="ed.open = false">Cancel</button><button class="btn" type="submit" form="rgf">Save</button></template>
    </AppModal>
  </div>
</template>
<style scoped>
.rp { display: flex; flex-direction: column; gap: 16px; } .ch { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px } .ch h3 { margin: 0; font-size: 16px } .row { display: flex; gap: 8px }
.vs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 12px } .vs > div:not(.bar) { display: flex; flex-direction: column; gap: 2px } .vs b { font-size: 22px; font-weight: 500 } .vs em { font-style: normal; font-size: 12.5px; color: var(--c-muted) }
.bar { grid-column: 1 / -1; display: flex; height: 8px; background: var(--c-paper-2) } .bar .f { background: var(--c-navy) } .bar .i { background: #9fb6d9 }
.wn { margin: 0 0 12px; padding: 10px 14px 10px 28px; background: #fbf3e2; color: #6b4a0e; font-size: 13.5px } .wn li { margin: 2px 0 }
.t { width: 100%; border-collapse: collapse } .t th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule) } .t td { padding: 9px 10px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top } .r { text-align: right } th.r { text-align: right } .b { font-weight: 600 }
.sub { display: block; font-size: 12.5px; color: var(--c-muted) } tr.pw td:first-child { box-shadow: inset 3px 0 0 #b07a12 } tr.fo { background: #fafaf8 } tr.off { color: var(--c-muted) } .tot td { font-weight: 600 }
.ins { display: inline-flex; flex-direction: column; margin: 0 6px 4px 0; padding: 3px 8px; background: var(--c-paper-2); font-size: 12.5px } .ins em { font-style: normal; color: var(--c-muted); font-size: 11.5px }
.chip { border: 1px solid var(--c-rule-strong); background: #fff; font: inherit; font-size: 12px; padding: 2px 7px; margin: 0 4px 4px 0; cursor: pointer } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer } .lk.sm { font-size: 12.5px } .lk.red { color: var(--c-danger) }
.fl { display: inline-block; font-size: 11.5px; padding: 2px 7px; margin: 0 4px 4px 0; background: #eef0f3; color: var(--c-ink-soft) } .fl.multi { background: #e9ecf5; color: #2c3e70 } .fl.stake, .fl.largest, .fl.over_founder { background: #fbf0dc; color: #7a5a14 } .fl.pref, .fl.participating, .fl.senior, .fl.control { background: #f6e4e0; color: #8a2f20 }
.im { color: var(--c-ink-soft); max-width: 360px } .mut { color: var(--c-muted); font-size: 13px } .note { background: var(--c-paper-2); padding: 10px 12px; font-size: 13.5px; margin: 10px 0 0 } .fine { font-size: 12.5px; color: var(--c-muted); margin: 10px 0 0 }
.nr { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--c-muted) } .nr input { width: 140px }
.fm { display: flex; flex-direction: column; gap: 12px } .g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px } .w { grid-column: 1 / -1 } label.label { display: flex; flex-direction: column; gap: 6px } .chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px } .sp { flex: 1 }
input, select, textarea { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; max-width: 100%; box-sizing: border-box } .fm input:not([type=checkbox]), .fm select, .fm textarea { width: 100% } .t select { max-width: 260px }
.mt { display: block; font-size: 11.5px; margin-top: 3px } .mt.ai, .mt.ok { color: var(--c-ink-soft) } .mt.name, .mt.by { color: #7a5a14 } .mt.none { color: var(--c-danger) } .error { color: var(--c-danger); margin: 0 }
@media (max-width: 760px) { .vs { grid-template-columns: 1fr } }
</style>
