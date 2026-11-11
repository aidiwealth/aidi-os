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
const ed = reactive({ room: true, up: false, doc_title: '', open: false, id: '', holder_id: '' as string | null, party: '', kind: 'pro_rata', summary: '', impact: '', clause: '', document_id: null as string | null, terms: {} as Record<string, string | number>, pctv: '' as string | number, msg: '' })
function edit(r?: Right, holder?: string) { ed.up = false; ed.doc_title = r?.doc_title ?? ''; Object.assign(ed, r ? { open: true, id: r.id, holder_id: r.holder_id ?? '', party: r.party ?? '', kind: r.kind, summary: r.summary, impact: r.impact ?? '', clause: r.clause ?? '', document_id: r.document_id, terms: { ...(r.terms as Record<string, string | number>) }, pctv: (r.terms as Record<string, number>).pct ?? '', msg: '' } : { open: true, id: '', holder_id: holder ?? '', party: '', kind: 'pro_rata', summary: '', impact: '', clause: '', document_id: null, terms: {}, pctv: '', msg: '' }) }
async function saveEd() {
  ed.msg = ''
  const terms = { ...ed.terms }; if (ed.pctv !== '' && Number(ed.pctv) > 0) terms.pct = Number(ed.pctv); else delete terms.pct
  try { await $fetch('/api/equity/rights/apply', { method: 'POST', body: { ct: props.ct, room: ed.room && !!ed.document_id, rows: [{ id: ed.id || undefined, holder_id: ed.holder_id || null, party: ed.party || hName(ed.holder_id), kind: ed.kind, summary: ed.summary || RIGHT_LABEL[ed.kind], impact: ed.impact, clause: ed.clause, document_id: ed.document_id, terms }] } }); ed.open = false; emit('changed') }
  catch (e) { ed.msg = err(e) }
}
// The letter behind a right: a pro rata letter, side letter or rights agreement, uploaded here (or replaced).
async function upLetter(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]; (ev.target as HTMLInputElement).value = ''; if (!file) return
  ed.up = true; ed.msg = ''
  try { const fd = new FormData(); fd.append('file', file); fd.append('title', (ed.kind === 'pro_rata' || ed.kind === 'super_pro_rata' ? 'Pro rata letter' : 'Side letter') + (ed.holder_id ? ' — ' + hName(ed.holder_id) : ''))
    const r = await $fetch<{ document_id: string; title: string }>('/api/equity/docs/upload', { method: 'POST', body: fd }); ed.document_id = r.document_id; ed.doc_title = r.title }
  catch (e) { ed.msg = err(e) } finally { ed.up = false }
}
async function del(r: Right) { if (!await askConfirm('Remove this right? The letter stays in Documents.')) return; await $fetch('/api/equity/rights/' + r.id, { method: 'DELETE' }).catch(() => {}); emit('changed') }
async function remap(r: Right, holder: string) { try { await $fetch('/api/equity/rights/apply', { method: 'POST', body: { ct: props.ct, room: true, rows: [{ id: r.id, holder_id: holder || null, party: r.party ?? '', kind: r.kind, summary: r.summary, impact: r.impact ?? '', clause: r.clause ?? '', document_id: r.document_id, terms: r.terms }] } }); emit('changed') } catch (e) { notify(err(e)) } }
const termsText = (t: Record<string, unknown>) => [t.pct ? t.pct + '%' : '', t.multiple ? t.multiple + '×' : '', t.seats ? t.seats + ' seat' + (Number(t.seats) === 1 ? '' : 's') : '', t.threshold, t.applies_to, t.expires ? 'until ' + t.expires : ''].filter(Boolean).join(' · ')

// ── The page, laid out for reading ──
// Doughnuts: who controls the vote, and the rights granted by type.
const C = 2 * Math.PI * 46
function arcs(parts: { label: string; value: number; color: string }[]) {
  const total = parts.reduce((a, x) => a + x.value, 0) || 1; let off = 0
  return parts.filter((x) => x.value > 0).map((x) => { const len = (x.value / total) * C; const a = { ...x, dash: len.toFixed(2) + ' ' + C.toFixed(2), offset: (-off).toFixed(2) }; off += len; return a })
}
const vote = computed(() => {
  const f = P.value.founders.pctConverted ?? P.value.founders.pctFd, i = P.value.investors.pctConverted ?? P.value.investors.pctFd
  const o = Math.max(0, 100 - f - i)
  return { f, i, o, arcs: arcs([{ label: 'Founders', value: f, color: '#0c1a2e' }, { label: 'Investors', value: i, color: '#8fb3d6' }, { label: 'Others', value: o, color: '#e3e1dc' }]) }
})
const KIND_COLOR: Record<string, string> = { information: '#1c547d', pro_rata: '#8fb3d6', super_pro_rata: '#3d6e99', veto: '#b54708', board_seat: '#0c1a2e', board_observer: '#5d6470', mfn: '#c9d6e5' }
const kinds = computed(() => {
  const m = new Map<string, number>(); for (const r of props.rights) m.set(r.kind, (m.get(r.kind) ?? 0) + 1)
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ kind: k, label: RIGHT_LABEL[k] ?? k, value: n, color: KIND_COLOR[k] ?? '#a8b4c2' }))
  return { rows, arcs: arcs(rows.map((x) => ({ label: x.label, value: x.value, color: x.color }))), holders: new Set(props.rights.map((r) => r.holder_id ?? r.party ?? '')).size, letters: new Set(props.rights.map((r) => r.document_id).filter(Boolean)).size }
})
// What to watch: the warnings, tagged, plus who can take part in the next round.
const watch = computed(() => {
  const out = P.value.warnings.map((w) => ({ tag: /veto/i.test(w) ? 'Can block' : /board/i.test(w) ? 'Board' : 'Control', warn: /veto/i.test(w), text: w }))
  const pr = new Set(props.rights.filter((r) => r.kind === 'pro_rata' || r.kind === 'super_pro_rata').map((r) => hName(r.holder_id) || r.party || 'All investors'))
  if (pr.size) out.push({ tag: 'Next round', warn: false, text: [...pr].slice(0, 3).join(', ') + (pr.size > 3 ? ' and ' + (pr.size - 3) + ' more' : '') + (pr.size === 1 ? ' can' : ' can each') + ' buy into the next round to keep their stake. Leave room for it.' })
  return out
})
// Rights by investor: one card each, with what the rights mean in plain words and the letters they come from.
const PLAIN: Record<string, string> = { pro_rata: 'can buy into future rounds to keep its ownership', super_pro_rata: 'can buy more than its share of future rounds', information: 'gets regular reports on the business', board_seat: 'has a seat on the board', board_observer: 'can sit in on board meetings', mfn: 'gets any better terms given to later investors', veto: 'can block certain company decisions', rofr: 'can buy shares before they are sold to others', co_sale: 'can sell alongside founders', drag_along: 'can force a sale once enough holders agree', tag_along: 'can join a sale on the same terms', redemption: 'can ask the company to buy its shares back', anti_dilution: 'is protected if shares are later sold cheaper', liquidation_pref: 'is paid first in a sale', participation: 'is paid its preference and a share of the rest', vesting: 'has founder vesting terms', acceleration: 'vests early on a sale' }
const initials = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !/^(llc|lp|inc|ltd|limited|the|of|a|series|fund)$/i.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '·'
const groups = computed(() => {
  const m = new Map<string, Right[]>(); for (const r of props.rights) { const k = r.holder_id ?? 'p:' + (r.party ?? ''); m.set(k, [...(m.get(k) ?? []), r]) }
  return [...m.entries()].map(([k, rs]) => {
    const hid = k.startsWith('p:') ? null : k, pos = P.value.rows.find((x) => x.holder.id === hid)
    const name = hid ? hName(hid) : rs[0]!.party || 'All investors', warn = rs.some((r) => r.kind === 'veto' || r.kind === 'board_seat' || r.kind === 'redemption')
    const phrases = [...new Set(rs.map((r) => PLAIN[r.kind]).filter(Boolean))]
    const ins = pos?.instruments[0], sub = [ins ? ins.round + ' · ' + (ins.amount != null ? usd(ins.amount) + ' ' + ins.label : (ins.shares ?? 0).toLocaleString('en-US') + ' shares') : (hid ? '' : 'Not on the cap table'), pos?.pctConverted != null ? pct(pos.pctConverted) + ' as converted' : pos ? pct(pos.pctFd) + ' fully diluted' : ''].filter(Boolean).join(' · ')
    const letters = [...new Map(rs.filter((r) => r.document_id).map((r) => [r.document_id!, { id: r.document_id!, title: r.doc_title || 'Letter', clauses: rs.filter((x) => x.document_id === r.document_id && x.clause).map((x) => x.clause!) }])).values()]
    return { key: k, hid, name, sub, warn, rights: rs, plain: phrases.length ? (hid ? 'It ' : 'They ') + (phrases.length > 1 ? phrases.slice(0, -1).join(', ') + ' and ' + phrases[phrases.length - 1] : phrases[0]) + '.' : '', letters, missing: rs.filter((r) => !r.document_id) }
  }).sort((a, b) => Number(b.warn) - Number(a.warn) || b.rights.length - a.rights.length)
})
// A letter dropped on an investor's card: stored, then pointed to by that investor's rights that had none.
const gup = ref('')
async function cardLetter(g: { key: string; hid: string | null; name: string; missing: Right[] }, ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]; if (!file || !g.missing.length) return
  gup.value = g.key
  try {
    const fd = new FormData(); fd.append('file', file); fd.append('title', 'Side letter — ' + g.name)
    const r = await $fetch<{ document_id: string }>('/api/equity/docs/upload', { method: 'POST', body: fd })
    await $fetch('/api/equity/rights/apply', { method: 'POST', body: { ct: props.ct, room: true, rows: g.missing.map((x) => ({ id: x.id, holder_id: x.holder_id, party: x.party ?? '', kind: x.kind, summary: x.summary, impact: x.impact ?? '', clause: x.clause ?? '', document_id: r.document_id, terms: x.terms })) } })
    emit('changed')
  } catch (e) { notify(err(e)) } finally { gup.value = '' }
}
// The hero's drop area opens the reader with the files already on their way.
function heroDrop(ev: Event) { openRead(); upRead(ev) }
</script>
<template>
  <div class="rp">
    <section class="hero">
      <div class="hl">
        <span class="ey"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>Read with AI</span>
        <h2>Drop your side letters. We'll show what each investor can do.</h2>
        <p>AI reads side letters, pro rata letters and investor rights agreements, lists each right in plain words and matches it to the holder. Nothing is saved until you confirm.</p>
        <div class="steps"><span><b>1</b>Upload</span><span><b>2</b>AI finds each right</span><span><b>3</b>You confirm, letters filed</span></div>
      </div>
      <div class="hd"><DropZone accept=".pdf,.docx" multiple :disabled="job.busy.value" :label="job.busy.value ? 'Reading the letters…' : 'Drop letters here'" hint="PDF or Word · several at once · or click to choose" @change="heroDrop" />
        <span class="hand">or <button class="lk" @click="edit()">add a right by hand</button></span></div>
    </section>

    <section class="three">
      <div class="card k"><b class="kt">Who controls the vote</b>
        <div class="dn"><svg viewBox="0 0 120 120" role="img" :aria-label="'Founders ' + vote.f.toFixed(1) + '%, investors ' + vote.i.toFixed(1) + '%'"><circle cx="60" cy="60" r="46" fill="none" stroke="#f1f0ec" stroke-width="16" /><circle v-for="a in vote.arcs" :key="a.label" cx="60" cy="60" r="46" fill="none" :stroke="a.color" stroke-width="16" :stroke-dasharray="a.dash" :stroke-dashoffset="a.offset" transform="rotate(-90 60 60)" /><text x="60" y="58" text-anchor="middle" font-size="17" font-weight="700" fill="#0c1a2e">{{ vote.f.toFixed(1) }}%</text><text x="60" y="74" text-anchor="middle" font-size="9.5" fill="#5d6470">founders</text></svg>
          <div class="lg"><span><i style="background:#0c1a2e" />Founders<b>{{ vote.f.toFixed(1) }}%</b></span><span><i style="background:#8fb3d6" />Investors<b>{{ vote.i.toFixed(1) }}%</b></span><span v-if="vote.o >= 0.05"><i style="background:#e3e1dc" />Others<b>{{ vote.o.toFixed(1) }}%</b></span></div></div>
        <p class="ex">{{ vote.f < 50 ? (P.converted ? 'Once the SAFEs convert, founders' : 'Founders') + ' hold under half: ordinary resolutions need investor votes.' : 'Founders hold a majority: they can pass ordinary resolutions together.' }}</p>
        <span class="ft">{{ P.converted ? 'As converted: SAFEs and notes placed at their cap.' : 'Fully diluted; SAFEs and notes convert at the next round.' }}</span></div>
      <div class="card k"><b class="kt">Rights you've granted</b>
        <div v-if="rights.length" class="dn"><svg viewBox="0 0 120 120" role="img" :aria-label="rights.length + ' rights'"><circle v-for="a in kinds.arcs" :key="a.label" cx="60" cy="60" r="46" fill="none" :stroke="a.color" stroke-width="16" :stroke-dasharray="a.dash" :stroke-dashoffset="a.offset" transform="rotate(-90 60 60)" /><text x="60" y="60" text-anchor="middle" font-size="22" font-weight="700" fill="#0c1a2e">{{ rights.length }}</text><text x="60" y="76" text-anchor="middle" font-size="9.5" fill="#5d6470">{{ rights.length === 1 ? 'right' : 'rights' }}</text></svg>
          <div class="lg"><span v-for="x in kinds.rows.slice(0, 5)" :key="x.kind"><i :style="{ background: x.color }" />{{ x.label }}<b>{{ x.value }}</b></span></div></div>
        <div v-else class="none">No rights yet. Drop a letter above and AI lists them.</div>
        <p class="ex">Information rights mean regular reporting. Vetoes, board seats and redemption are the ones that can block or force a decision.</p>
        <span v-if="rights.length" class="ft">Held by {{ kinds.holders }} {{ kinds.holders === 1 ? 'investor' : 'investors' }} · {{ kinds.letters }} {{ kinds.letters === 1 ? 'letter' : 'letters' }}</span></div>
      <div class="card k"><b class="kt">What to watch</b>
        <div v-for="(w, n) in watch" :key="n" class="wt" :class="{ warn: w.warn }"><b>{{ w.tag }}</b><span>{{ w.text }}</span></div>
        <p v-if="!watch.length" class="ex">Nothing stands out: no investor holds a power position over the founders.</p></div>
    </section>

    <section class="card">
      <div class="ch"><h3>Rights by investor</h3><span class="mut">Click a right to see its clause, or to change it</span></div>
      <div v-if="groups.length" class="cards">
        <article v-for="g in groups" :key="g.key" class="ic" :class="{ warn: g.warn }">
          <div class="ih"><span class="av">{{ initials(g.name) }}</span><span class="in"><b>{{ g.name }}</b><em v-if="g.sub">{{ g.sub }}</em></span><button class="lk" @click="edit(undefined, g.hid ?? undefined)">+ Add</button></div>
          <div class="chips"><button v-for="r in g.rights" :key="r.id" class="rc" :class="r.kind" :title="r.summary + (r.clause ? ' · ' + r.clause : '')" @click="edit(r)">{{ RIGHT_LABEL[r.kind] ?? r.kind }}<em v-if="termsText(r.terms)"> · {{ termsText(r.terms) }}</em></button></div>
          <p v-if="g.plain" class="pl"><b>In plain words:</b> {{ g.plain }}</p>
          <div class="lt"><template v-for="l in g.letters" :key="l.id"><span class="lr"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L12.5 4.5v10h-8.5z" /><path d="M9.5 1.5v3h3" /></svg><button class="lk" @click="emit('open', l.id)">{{ l.title }}</button><em v-if="l.clauses.length">{{ [...new Set(l.clauses)].slice(0, 3).join(' · ') }}</em></span></template>
            <DropZone v-if="g.missing.length" compact accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" :disabled="gup === g.key" :label="gup === g.key ? 'Uploading…' : g.letters.length ? 'Drop the letter for the other rights' : 'No letter yet: drop it here'" hint="or click to choose" @change="cardLetter(g, $event)" /></div>
        </article>
      </div>
      <EmptyState v-else compact icon="equity" title="No rights recorded yet" text="Drop a side letter above and AI lists each right, or add one by hand." />
    </section>

    <section class="card">
      <div class="ch"><h3>Who holds what</h3><span class="mut">{{ P.converted ? 'Today, and once SAFEs convert at their caps' : 'Fully diluted; uncapped SAFEs and notes convert at the next round' }}</span></div>
      <div class="tw"><table class="t" data-nosearch><thead><tr><th>Holder</th><th>Holds</th><th class="r">Today</th><th class="r">Converted</th><th>Rights</th><th>Flags</th></tr></thead>
        <tbody><tr v-for="r in P.rows" :key="r.holder.id"><td><b>{{ r.holder.name }}</b><span class="sub">{{ KIND[r.holder.kind] ?? 'Other' }}</span></td>
          <td><span v-for="(x, i) in r.instruments" :key="i" class="ins">{{ x.round }}<em>{{ x.shares != null ? x.shares.toLocaleString('en-US') + ' ' + (x.label === 'Options' ? 'options' : x.label === x.round ? 'shares' : x.label) : usd(x.amount ?? 0) + ' ' + x.label }}</em></span></td>
          <td class="r">{{ pct(r.pctFd) }}</td><td class="r b">{{ pct(r.pctConverted) }}<span v-if="r.unplaced" class="sub">+ uncapped (next round)</span></td>
          <td><button v-for="x in r.rights" :key="x.id" class="rc sm" :class="x.kind" :title="x.summary" @click="edit(x)">{{ RIGHT_LABEL[x.kind] }}</button><button class="lk sm" @click="edit(undefined, r.holder.id)">+ Add</button></td>
          <td><span v-for="f in r.flags" :key="f.code" class="fl" :class="f.code">{{ f.text }}</span><span v-if="!r.flags.length" class="mut">—</span></td></tr></tbody></table></div>
      <EmptyState v-if="!P.rows.length" compact icon="equity" title="No holders yet" />
    </section>

    <div v-if="take.length" class="card"><div class="ch"><h3>Pro rata at the next round</h3><label class="nr">Next round size (USD)<input v-model.number="nextRound" type="number" min="0" step="100000"></label></div>
      <table class="t" data-nosearch><thead><tr><th>Holder</th><th>Right</th><th class="r">Share of the round</th><th class="r">They may invest</th></tr></thead>
        <tbody><tr v-for="(x, i) in take" :key="i"><td>{{ x.holder }}</td><td>{{ RIGHT_LABEL[x.kind] }}</td><td class="r">{{ pct(x.pct) }}</td><td class="r">{{ usd(x.amount) }}</td></tr>
          <tr class="tot"><td colspan="2">Reserved for pro rata</td><td class="r">{{ pct(nextRound ? takeTotal / nextRound * 100 : 0) }}</td><td class="r">{{ usd(takeTotal) }}</td></tr></tbody></table>
      <p class="fine">If every holder takes up their right, {{ usd(Math.max(0, nextRound - takeTotal)) }} is left for new investors{{ takeTotal > nextRound ? ': the rights are larger than the round, so they will be cut back pro rata' : '' }}. The letters decide the exact amounts.</p></div>

    <p v-if="shared.length" class="note">{{ shared.length }} right{{ shared.length === 1 ? '' : 's' }} not tied to one holder: {{ shared.map((r) => (r.party || 'All investors') + ' — ' + RIGHT_LABEL[r.kind]).join('; ') }}.</p>

    <AppModal :open="rd.open" title="Read side letters and pro rata letters" xl @close="rd.open = false">
      <div class="fm">
        <DropZone v-if="!rd.rows.length && !job.busy.value" accept=".pdf,.docx" multiple label="Drop the letters here or choose files" hint="PDF or Word, up to 10 files" @change="upRead" />
        <p v-if="job.busy.value" class="mut">{{ job.stage.value === 'store' ? 'Filing the letters…' : 'Reading the letters…' }} This can take a minute.</p>
        <div v-if="job.fail.value" class="error"><b>{{ job.fail.value.message }}</b><ul><li v-for="a in job.fail.value.advice" :key="a">{{ a }}</li></ul></div>
        <template v-if="rd.rows.length">
          <p class="mut">{{ rd.rows.length }} right{{ rd.rows.length === 1 ? '' : 's' }} found. Check each holder.{{ unmatched ? ' ' + unmatched + ' still need a holder.' : '' }}</p>
          <div class="rv"><label v-for="(x, i) in rd.rows" :key="i" class="rvc" :class="{ off: !x.on }"><input v-model="x.on" type="checkbox" aria-label="Keep">
            <span class="rvb"><span class="rvt"><select v-model="x.kind" aria-label="Type" class="ks"><option v-for="(l, k) in RIGHT_LABEL" :key="k" :value="k">{{ l }}</option></select><em v-if="x.clause">{{ x.clause }}</em><em v-if="termsText(x.terms)">{{ termsText(x.terms) }}</em></span>
              <b>{{ x.summary }}</b><span v-if="x.impact" class="sub">{{ x.impact }}</span><span class="sub">In the letter: {{ x.party }}{{ x.file ? ' · ' + x.file : '' }}</span></span>
            <span class="rvh">Holder<select v-model="x.holder_id" aria-label="Holder"><option :value="null">{{ x.party_role === 'all_investors' ? 'All investors' : x.party_role === 'company' ? 'The company' : 'Not on the cap table' }}</option><option v-for="h in data.holders" :key="h.id" :value="h.id">{{ h.name }}</option></select><span class="mt" :class="x.holder_id ? (x.match === 'none' ? 'by' : x.match) : x.party_role === 'all_investors' || x.party_role === 'company' ? 'ok' : 'none'">{{ x.holder_id ? (x.match === 'ai' ? 'Matched by AI' : x.match === 'name' ? 'Matched by name, check it' : 'Chosen by you') : x.party_role === 'all_investors' || x.party_role === 'company' ? 'Applies to all' : 'Pick a holder' }}</span></span></label></div>
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
        <div class="w ltr"><span class="label">Letter</span>
          <div v-if="ed.document_id" class="lf" title="Drop a file here to replace it" @dragover.prevent @drop.prevent="upLetter({ target: { files: $event.dataTransfer?.files ?? [] } } as unknown as Event)"><span class="ln">{{ ed.doc_title || 'Attached letter' }}</span><button type="button" class="lk" @click="emit('open', ed.document_id!)">Open</button><label class="lk">Replace<input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" hidden @change="upLetter"></label><button type="button" class="lk red" @click="ed.document_id = null; ed.doc_title = ''">Remove</button></div>
          <DropZone v-else compact accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" :disabled="ed.up" :label="ed.up ? 'Uploading…' : 'Drop the pro rata or side letter here'" hint="or click to choose · PDF, Word or image" @change="upLetter" />
          <label v-if="ed.document_id && ed.holder_id" class="chk"><input v-model="ed.room" type="checkbox"> File it with the holder and in the data room (Financing, side letters)</label></div>
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
.sub { display: block; font-size: 12.5px; color: var(--c-muted) } tr.fo { background: #fafaf8 } tr.off { color: var(--c-muted) } .tot td { font-weight: 600 }
.ins { display: inline-flex; flex-direction: column; margin: 0 6px 4px 0; padding: 3px 8px; background: var(--c-paper-2); font-size: 12.5px } .ins em { font-style: normal; color: var(--c-muted); font-size: 11.5px }
.chip { border: 1px solid var(--c-rule-strong); background: #fff; font: inherit; font-size: 12px; padding: 2px 7px; margin: 0 4px 4px 0; cursor: pointer } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer } .lk.sm { font-size: 12.5px } .lk.red { color: var(--c-danger) }
.fl { display: inline-block; font-size: 11.5px; padding: 2px 7px; margin: 0 4px 4px 0; background: #eef0f3; color: var(--c-ink-soft) } .fl.multi { background: #e9ecf5; color: #2c3e70 } .fl.stake, .fl.largest, .fl.over_founder { background: #fbf0dc; color: #7a5a14 } .fl.pref, .fl.participating, .fl.senior, .fl.control { background: #f6e4e0; color: #8a2f20 }
.im { color: var(--c-ink-soft); max-width: 360px } .mut { color: var(--c-muted); font-size: 13px } .note { background: var(--c-paper-2); padding: 10px 12px; font-size: 13.5px; margin: 10px 0 0 } .fine { font-size: 12.5px; color: var(--c-muted); margin: 10px 0 0 }
.nr { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--c-muted) } .nr input { width: 140px }
.fm { display: flex; flex-direction: column; gap: 12px } .g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px } .w { grid-column: 1 / -1 } label.label { display: flex; flex-direction: column; gap: 6px } .chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px } .sp { flex: 1 }
input, select, textarea { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; max-width: 100%; box-sizing: border-box } .fm input:not([type=checkbox]), .fm select, .fm textarea { width: 100% } .t select { max-width: 260px }
.mt { display: block; font-size: 11.5px; margin-top: 3px } .mt.ai, .mt.ok { color: var(--c-ink-soft) } .mt.name, .mt.by { color: #7a5a14 } .mt.none { color: var(--c-danger) } .error { color: var(--c-danger); margin: 0 }
@media (max-width: 760px) { .vs { grid-template-columns: 1fr } }
.ltr { display: flex; flex-direction: column; gap: 8px; } .lf { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 12px; border: 1px solid var(--c-rule); background: #fbfaf7; font-size: 14px; } .lf .ln { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .lf label.lk { cursor: pointer; } .up { align-self: flex-start; cursor: pointer; }
.card { background: #fff; border: 1px solid var(--c-rule); padding: 20px; } .ch .mut { font-size: 12.5px; }
.hero { border: 1px solid #c9d6e5; background: #f5f8fb; padding: 24px; display: flex; flex-wrap: wrap; gap: 24px; align-items: stretch; }
.hl { flex: 999 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 10px; } .ey { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--c-blue-deep); } .ey svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.hl h2 { margin: 0; font-size: 22px; line-height: 1.25; color: var(--c-navy); letter-spacing: -.01em; } .hl p { margin: 0; color: var(--c-ink-soft); font-size: 14px; }
.steps { display: flex; flex-wrap: wrap; gap: 18px; font-size: 13px; color: var(--c-ink-soft); } .steps span { display: inline-flex; align-items: center; gap: 8px; } .steps b { width: 22px; height: 22px; background: #fff; border: 1px solid #c9d6e5; color: var(--c-blue-deep); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
.hd { flex: 1 1 300px; display: flex; flex-direction: column; gap: 8px; } .hd :deep(.dz) { height: 100%; min-height: 150px; border-color: #8fb3d6; } .hand { font-size: 12.5px; color: var(--c-muted); text-align: center; }
.three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; } .k { display: flex; flex-direction: column; gap: 12px; } .kt { font-size: 15px; color: var(--c-navy); }
.dn { display: flex; gap: 14px; align-items: center; } .dn svg { width: 108px; height: 108px; flex: none; } .lg { display: flex; flex-direction: column; gap: 7px; font-size: 13px; flex: 1; min-width: 0; } .lg span { display: flex; align-items: center; gap: 8px; } .lg i { width: 10px; height: 10px; flex: none; } .lg b { margin-left: auto; }
.ex { margin: 0; font-size: 13px; color: var(--c-ink-soft); } .ft { font-size: 12px; color: var(--c-muted); } .none { font-size: 13px; color: var(--c-muted); background: #fbfaf7; padding: 22px 14px; text-align: center; }
.wt { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--c-rule); font-size: 13px; } .wt b { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--c-blue-deep); } .wt.warn { background: #fdf6f1; border-color: #f0d9c8; } .wt.warn b { color: #b54708; }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .ic { border: 1px solid var(--c-rule); padding: 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; } .ic.warn { border-color: #f0d9c8; }
.ih { display: flex; gap: 10px; align-items: center; } .av { width: 36px; height: 36px; flex: none; background: #e6eef6; color: var(--c-navy); font-weight: 700; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; } .ic.warn .av { background: #fbeee6; color: #b54708; } .in { flex: 1; min-width: 0; display: flex; flex-direction: column; } .in b { overflow: hidden; text-overflow: ellipsis; } .in em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; } .rc { border: 0; background: #f1f0ec; font: inherit; font-size: 12.5px; padding: 4px 9px; cursor: pointer; color: var(--c-ink); text-align: left; } .rc em { font-style: normal; color: var(--c-muted); } .rc:hover { background: #e6eef6; } .rc.pro_rata, .rc.super_pro_rata { background: #e6eef6; color: var(--c-navy); font-weight: 500; } .rc.veto, .rc.board_seat, .rc.redemption { background: #fbeee6; color: #b54708; font-weight: 500; } .rc.sm { font-size: 12px; padding: 2px 7px; margin: 0 4px 4px 0; }
.pl { margin: 0; font-size: 13.5px; color: var(--c-ink-soft); } .pl b { color: var(--c-navy); }
.lt { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--c-rule); padding-top: 10px; font-size: 12.5px; } .lr { display: flex; align-items: center; gap: 8px; min-width: 0; } .lr svg { width: 14px; height: 14px; flex: none; fill: none; stroke: var(--c-blue-deep); stroke-width: 1.3; } .lr .lk { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; } .lr em { font-style: normal; color: var(--c-muted); margin-left: auto; white-space: nowrap; }
.tw { overflow-x: auto; }
.rv { display: flex; flex-direction: column; gap: 10px; } .rvc { display: grid; grid-template-columns: 20px minmax(0, 1fr) 220px; gap: 14px; padding: 14px 16px; border: 1px solid #c9d6e5; align-items: start; cursor: pointer; } .rvc.off { border-style: dashed; border-color: var(--c-rule-strong); background: #fbfaf7; color: var(--c-muted); } .rvc > input { margin-top: 4px; width: 16px; height: 16px; }
.rvb { display: flex; flex-direction: column; gap: 4px; min-width: 0; } .rvt { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .rvt em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .ks { font-size: 12.5px !important; padding: 3px 6px !important; background: #e6eef6 !important; border-color: #c9d6e5 !important; font-weight: 600; } .rvb > b { font-size: 14.5px; } .rvh { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); } .rvh select { width: 100%; }
@media (max-width: 900px) { .three, .cards { grid-template-columns: 1fr; } .rvc { grid-template-columns: 20px minmax(0, 1fr); } .rvh { grid-column: 2; } }
</style>
