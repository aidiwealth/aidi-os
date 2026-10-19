<script setup lang="ts">
import { shortAmount } from '~/shared/compact'
// What the founder's figures say, as one calm panel: runway and burn (checked several ways), where each dollar of
// revenue goes, four key points (detail on demand) and what to take to each part of the team.
import type { BurnReview } from '~/shared/fin-view'
import { BUSINESS_MODELS } from '~/shared/business-models'
const props = defineProps<{ subject: string; review?: BurnReview | null; unit?: { revenue: number; cogs: number; opex: number; label: string } | null; currency: string; withSecurities?: boolean; brief?: boolean; nextTo?: string | Record<string, unknown> }>()
// brief: one line (the headline) with the detail behind a button; What to do next has the full advice.
const open = ref(false)
const shown = computed(() => !props.brief || open.value)
// "2026-01-31 to 2026-09-30" → "Jan 2026 – Sep 2026"
const periodText = (p: string) => p.replace(/(\d{4})-(\d{2})-\d{2}/g, (_m, y: string, mo: string) => new Date(Date.UTC(Number(y), Number(mo) - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })).replace(' to ', ' – ')
interface A { headline: string; insights: { title: string; detail: string; tone: 'good' | 'watch' | 'risk' }[]; flags: { for: string; item: string; why: string }[]; checks: number; ai: boolean; as_of: string; period: string; business_model?: string | null }
const refreshQ = ref<string | undefined>(undefined)
const { data, pending, refresh } = await useLazyFetch<A | null>('/api/financials/analysis', { query: { subject: computed(() => props.subject), refresh: refreshQ }, server: false })
async function again() { refreshQ.value = '1'; await refresh(); refreshQ.value = undefined }
// The business type: margins are judged against similar companies, so the analysis is read again when it changes.
const bmBusy = ref(false)
async function setModel(v: string) { bmBusy.value = true; try { await $fetch('/api/financials/business-model', { method: 'POST', body: { subject: props.subject, model: v } }); await again() } catch { /* only owners can change it */ } finally { bmBusy.value = false } }
const groups = computed(() => { const m = new Map<string, A['flags']>(); for (const f of data.value?.flags ?? []) m.set(f.for, [...(m.get(f.for) ?? []), f]); return [...m.entries()] })
const who = ref(''); watch(groups, (g) => { if (!g.some(([w]) => w === who.value)) who.value = g[0]?.[0] ?? '' }, { immediate: true })
const fullW = ref<string[]>([]); const openI = ref<number | null>(null); const showBurn = ref(false)
const TONE: Record<string, string> = { good: 'Going well', watch: 'Watch', risk: 'Risk' }
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const sym = computed(() => SYM[props.currency] ?? props.currency + ' ')
const short = (v: number) => shortAmount(v, sym.value)
const mon = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
// Runway ring: share of a 24-month horizon.
const R = 42, C = 2 * Math.PI * R
const rw = computed(() => props.review && props.review.status !== 'none' ? props.review : null)
const ringPct = computed(() => (rw.value?.profitable ? 1 : rw.value?.runway ? Math.min(1, rw.value.runway / 24) : 0))
// Where each dollar of revenue goes (last three months).
const per = computed(() => {
  const u = props.unit; if (!u || !(u.revenue > 0)) return null
  const c = u.cogs / u.revenue, o = u.opex / u.revenue, left = 1 - c - o
  return { c, o, left, segs: [{ k: 'Cost of sales', v: c, col: '#1d64a8' }, { k: 'Running costs (salaries, rent, tools)', v: o, col: '#46a7dc' }] }
})
const arcs = computed(() => { const p = per.value; if (!p) return []; const tot = Math.max(1, p.c + p.o); let at = 0; return p.segs.map((s) => { const len = (s.v / tot) * C; const a = { ...s, dash: Math.max(0, len - 2) + ' ' + (C - Math.max(0, len - 2)), off: -at }; at += len; return a }) })
const h100 = computed(() => sym.value.trim() + '100')
const of100 = (v: number) => (v < 0 ? '−' : '') + sym.value.trim() + Math.round(Math.abs(v) * 100)
</script>

<template>
  <section class="fh" :class="{ brief, open }">
    <header class="hd"><div><span class="eb">What your numbers say</span><h2 v-if="data" class="hl">{{ data.headline }}</h2><h2 v-else-if="pending" class="hl mutd">Reading your figures…</h2></div>
      <span class="meta">{{ data ? periodText(data.period) + (data.ai ? '' : ' · from your figures') : '' }}<template v-if="brief && data"><button class="lk" type="button" :aria-expanded="open" @click="open = !open">{{ open ? 'Hide the detail' : 'Runway, spending and key points' }}</button><NuxtLink v-if="nextTo" :to="nextTo" class="lk">What to do next →</NuxtLink></template><button v-if="data && shown" class="lk" :disabled="pending" @click="again">{{ pending ? 'Reading…' : 'Refresh' }}</button>
        <label v-if="data && shown" class="bm" :class="{ unset: !data.business_model }">Business type<select :value="data.business_model ?? ''" :disabled="bmBusy || pending" @change="setModel(($event.target as HTMLSelectElement).value)"><option value="">Choose…</option><option v-for="m in BUSINESS_MODELS" :key="m.key" :value="m.key">{{ m.label }}</option></select></label></span></header>

    <template v-if="shown">
    <div class="grid">
      <!-- Runway and burn -->
      <div v-if="rw" class="box rwb">
        <span class="bl">Runway</span>
        <div class="rr">
          <svg viewBox="0 0 100 100" class="ring" role="img" :aria-label="'Runway ' + (rw.profitable ? 'cash-flow positive' : rw.runway + ' months')"><circle cx="50" cy="50" :r="R" class="trk" /><circle cx="50" cy="50" :r="R" class="val" :stroke-dasharray="(ringPct * C) + ' ' + C" transform="rotate(-90 50 50)" /><title>{{ rw.profitable ? 'Cash-flow positive' : rw.runway + ' months of runway (ring shows up to 24)' }}</title></svg>
          <div class="rc"><b>{{ rw.profitable ? '∞' : rw.runway ?? '—' }}</b><span>{{ rw.profitable ? 'cash-flow positive' : 'months' }}</span></div>
        </div>
        <dl><div><dt>Monthly burn</dt><dd>{{ rw.profitable ? 'None' : rw.burn !== null ? short(rw.burn) : '—' }}</dd></div><div><dt>{{ withSecurities ? 'Cash & securities' : 'Cash' }}</dt><dd>{{ rw.cash !== null ? short(rw.cash) : '—' }}<small v-if="rw.cash_at"> · {{ mon(rw.cash_at) }}</small></dd></div></dl>
        <button type="button" class="chip" :class="rw.status" @click="showBurn = !showBurn"><i>{{ rw.status === 'ok' ? '✓' : '!' }}</i>{{ rw.status === 'ok' ? 'Checked' : rw.issues.length + ' to check' }}<em>{{ showBurn ? 'Hide' : 'How' }}</em></button>
      </div>

      <!-- For every 100 of sales: plain amounts anyone can read (what is spent, and what is kept or lost) -->
      <div v-if="per" class="box pd">
        <span class="bl">For every {{ h100 }} of sales <small>{{ unit?.label }}</small></span>
        <div class="dn">
          <svg viewBox="0 0 100 100" class="ring" role="img" :aria-label="'Spent for every ' + h100 + ' of sales'"><circle cx="50" cy="50" :r="R" class="trk" /><circle v-for="a in arcs" :key="a.k" cx="50" cy="50" :r="R" fill="none" :stroke="a.col" stroke-width="11" :stroke-dasharray="a.dash" :stroke-dashoffset="a.off" transform="rotate(-90 50 50)"><title>{{ a.k }}: {{ of100(a.v) }}</title></circle></svg>
          <div class="rc"><b>{{ of100(per.c + per.o) }}</b><span>spent</span></div>
        </div>
        <p class="say">You spend <b :class="{ loss: per.left < 0 }">{{ of100(per.c + per.o) }}</b> for every {{ h100 }} you sell: <span class="k"><i :style="{ background: per.segs[0]!.col }" />{{ of100(per.c) }} on cost of sales</span> and <span class="k"><i :style="{ background: per.segs[1]!.col }" />{{ of100(per.o) }} on running costs</span>, so you <b :class="{ loss: per.left < 0 }">{{ per.left < 0 ? 'lose ' + of100(-per.left) : 'keep ' + of100(per.left) }}</b>.</p>
      </div>

      <!-- Four key points -->
      <div class="box kp">
        <span class="bl">Four key points</span>
        <p v-if="pending && !data" class="mutd">Reading…</p>
        <ol v-else-if="data">
          <li v-for="(i, n) in data.insights.slice(0, 4)" :key="n" :class="{ open: openI === n }">
            <button type="button" @click="openI = openI === n ? null : n"><span class="tn" :class="i.tone"><i>{{ i.tone === 'good' ? '↑' : i.tone === 'risk' ? '✕' : '!' }}</i>{{ TONE[i.tone] }}</span><b>{{ i.title }}</b><svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg></button>
            <p v-if="openI === n">{{ i.detail }}</p>
          </li>
        </ol>
        <p v-else class="mutd">Add three or more months of figures to see the analysis.</p>
      </div>
    </div>

    <div v-if="rw && showBurn" class="how">
      <ul v-if="rw.issues.length" class="iss"><li v-for="(x, i) in rw.issues" :key="i">{{ x }}</li></ul>
      <ul v-if="rw.notes.length" class="nts"><li v-for="(x, i) in rw.notes" :key="i">{{ x }}<template v-if="i === 0 && rw.runway_at_loss"> At the loss rate ({{ short(rw.loss_burn ?? 0) }} a month), runway is {{ rw.runway_at_loss }} months.</template></li></ul>
      <div class="mth"><div v-for="x in rw.methods" :key="x.key" class="mr" :class="{ used: x.label === rw.basis }"><span>{{ x.label }}</span><span class="n">{{ x.value === null ? 'Not in the figures' : short(x.value) + ' / month' }}</span><span class="u">{{ x.label === rw.basis ? 'Used' : '' }}</span></div></div>
      <p class="mutd">Burn is the {{ rw.months }}-month average. Runway is cash divided by burn. Without a cash flow statement, cash flow is worked out from the loss and the change in payables, receivables and other balance sheet lines.</p>
    </div>

    <div v-if="groups.length" class="tm">
      <div class="tmh"><span class="bl">Take to your team</span><div class="seg"><button v-for="[w, items] in groups" :key="w" type="button" :class="{ on: who === w }" @click="who = w">{{ w }}<em>{{ items.length }}</em></button></div></div>
      <div class="tml"><div v-for="(f, n) in groups.find(([w]) => w === who)?.[1] ?? []" :key="n" class="it"><span class="no">{{ n + 1 }}</span><div><b>{{ f.item }}</b><p :class="{ full: fullW.includes(who + n) }">{{ f.why }}</p><button v-if="f.why.length > 140" type="button" class="more" @click="fullW = fullW.includes(who + n) ? fullW.filter((x) => x !== who + n) : [...fullW, who + n]">{{ fullW.includes(who + n) ? 'Show less' : 'Read more' }}</button></div></div></div>
    </div>
    </template>
    <p v-if="data?.checks && shown" class="ft"><i>!</i>{{ data.checks }} total{{ data.checks === 1 ? '' : 's' }} in your figures do not add up, so some of this may be off. See "Figures to check" below.</p>
  </section>
</template>

<style scoped>
.fh { background: #fff; border: 1px solid var(--c-rule); padding: 20px 22px; margin: 0 0 12px; }
.hd { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; } .fh.brief:not(.open) .hd { margin-bottom: 0; } a.lk { text-decoration: none; }
.eb, .bl { font-size: 11.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--c-muted); } .bl small { text-transform: none; letter-spacing: 0; margin-left: 4px; }
.hl { font-family: var(--font-heading); font-weight: 500; font-size: 16px; line-height: 1.5; color: var(--c-navy); margin: 6px 0 0; max-width: 72ch; } .mutd { color: var(--c-muted); font-size: 13px; margin: 0; }
.meta { font-size: 12px; color: var(--c-muted); display: flex; gap: 12px; align-items: center; white-space: nowrap; flex-wrap: wrap; justify-content: flex-end; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; }
.grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.7fr); gap: 12px; }
.box { background: var(--c-paper-3); border: 1px solid var(--c-rule); padding: 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.rr, .dn { position: relative; width: 132px; height: 132px; align-self: center; } .ring { width: 132px; height: 132px; } .trk { fill: none; stroke: #e6eaf0; stroke-width: 11; } .val { fill: none; stroke: #1d64a8; stroke-width: 11; transition: stroke-dasharray .4s; }
.rc { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; } .rc b { font-size: 26px; font-weight: 600; color: var(--c-navy); line-height: 1; } .rc span { font-size: 11.5px; color: var(--c-muted); margin-top: 4px; text-align: center; max-width: 80px; }
dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } dl div { display: flex; flex-direction: column; gap: 2px; } dt { font-size: 12px; color: var(--c-muted); } dd { margin: 0; font-size: 16px; font-weight: 500; color: var(--c-ink); } dd small { font-size: 11.5px; color: var(--c-muted); font-weight: 400; }
.chip { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--c-rule-strong); padding: 6px 10px; font: inherit; font-size: 12.5px; color: var(--c-ink); cursor: pointer; text-align: left; } .chip i { font-style: normal; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; background: var(--c-signal-soft); color: var(--c-blue-deep); } .chip.check i { background: #fff1d6; color: #8a5a0a; } .chip em { font-style: normal; margin-left: auto; color: var(--c-blue-deep); }
.lg { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; font-size: 13px; color: var(--c-ink-soft); } .lg li { display: flex; align-items: center; gap: 8px; } .lg i { width: 10px; height: 10px; flex: none; } .lg li.lft i { background: #e6eaf0; } .lg li.lft.loss i { background: var(--c-danger); } .lg li.lft.loss b { color: var(--c-danger); }
.say { margin: 0; font-size: 14px; color: var(--c-ink-soft); line-height: 1.6; } .say b { font-weight: 600; color: var(--c-ink); } .say b.loss { color: var(--c-danger); }
.say .k { color: var(--c-ink); } .say .k i { display: inline-block; width: 9px; height: 9px; margin-right: 5px; vertical-align: 1px; } .lg b { margin-left: auto; font-weight: 600; color: var(--c-ink); }
.kp ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; } .kp li { border-top: 1px solid var(--c-rule); } .kp li:first-child { border-top: 0; }
.kp li button { width: 100%; display: grid; grid-template-columns: 104px 1fr 16px; gap: 10px; align-items: center; background: none; border: 0; padding: 11px 0; font: inherit; text-align: left; cursor: pointer; color: var(--c-ink); } .kp li button b { font-size: 14px; font-weight: 500; line-height: 1.35; }
.cv { width: 16px; height: 16px; color: var(--c-muted); transition: transform .15s; } .kp li.open .cv { transform: rotate(180deg); } .kp li p { margin: 0 0 12px 114px; font-size: 13px; color: var(--c-ink-soft); line-height: 1.55; }
.tn { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; padding: 3px 8px 3px 4px; justify-self: start; white-space: nowrap; } .tn i { font-style: normal; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff; }
.tn.risk { background: #fdecea; color: #8f1d14; } .tn.risk i { background: var(--c-danger); } .tn.watch { background: #fff3dc; color: #7a4f06; } .tn.watch i { background: #b8790f; } .tn.good { background: var(--c-signal-soft); color: var(--c-navy); } .tn.good i { background: var(--c-blue-deep); }
.how { margin-top: 12px; border: 1px solid var(--c-rule); padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; } .iss { margin: 0; padding-left: 18px; color: var(--c-ink-soft); display: flex; flex-direction: column; gap: 4px; }
.mr { display: grid; grid-template-columns: 1fr auto 56px; gap: 12px; padding: 7px 0; border-top: 1px solid var(--c-rule); } .mr .n { text-align: right; } .mr .u { text-align: right; font-size: 12px; color: var(--c-muted); } .mr.used { font-weight: 500; }
.tm { margin-top: 16px; border-top: 1px solid var(--c-rule); padding-top: 14px; } .tmh { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { background: #fff; border: 0; padding: 6px 12px; font: inherit; font-size: 13px; color: var(--c-ink-soft); cursor: pointer; display: flex; gap: 6px; align-items: center; } .seg button + button { border-left: 1px solid var(--c-rule-strong); } .seg button.on { background: var(--c-navy); color: #fff; } .seg em { font-style: normal; font-size: 11px; opacity: .75; }
.tml { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; } .it { display: flex; gap: 10px; background: var(--c-paper-3); border: 1px solid var(--c-rule); padding: 12px 14px; } .it .no { width: 22px; height: 22px; flex: none; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; background: var(--c-navy); color: #fff; }
.it b { font-size: 13.5px; font-weight: 500; display: block; } .it p { margin: 3px 0 0; font-size: 12.5px; color: var(--c-ink-soft); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.ft { margin: 14px 0 0; font-size: 12.5px; color: #7a4f06; display: flex; gap: 8px; align-items: center; } .ft i { font-style: normal; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; background: #fff1d6; }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr 1fr; } .kp { grid-column: 1 / -1; } }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } .kp li button { grid-template-columns: 1fr 16px; } .kp li button .tn { grid-column: 1 / -1; } .kp li p { margin-left: 0; } .hd { flex-direction: column; } }
.bm { display: inline-flex; gap: 6px; align-items: center; margin-left: 12px; font-size: 12px; color: var(--c-muted); }
.bm select { font: inherit; font-size: 12.5px; padding: 3px 6px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); max-width: 260px; }
.bm.unset select { border-color: var(--c-navy); }
.nts { margin: 0 0 10px; padding: 0 0 0 18px; font-size: 13px; color: var(--c-ink-soft); display: flex; flex-direction: column; gap: 4px; }
.it p.full { display: block; -webkit-line-clamp: unset; overflow: visible; } .more { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; margin-top: 2px; }
</style>
