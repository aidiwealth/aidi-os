<script setup lang="ts">
// Stays from the Airbnb calendars: occupied tonight, check-ins / check-outs this week, a 60-day timeline per room/unit,
// and the list of who is in and who is coming.
interface S { unit_id: string; starts: string; ends: string; kind: string; code: string | null; guest: string | null; payout: number | null }
interface D { today: string; synced: string | null; units: { id: string; name: string; property: string; ical: boolean }[]; stays: S[] }
const { data } = await useFetch<D>('/api/rentals/stays')
const DAY = 86400000, BACK = 7, SPAN = 60
const t0 = computed(() => new Date((data.value?.today ?? new Date().toISOString().slice(0, 10)) + 'T00:00:00Z').getTime())
const dn = (d: string) => Math.round((new Date(d + 'T00:00:00Z').getTime() - t0.value) / DAY)
const res = computed(() => (data.value?.stays ?? []).filter((s) => s.kind === 'reserved'))
const unitName = (id: string) => data.value?.units.find((u) => u.id === id)?.name ?? ''
const inNow = computed(() => res.value.filter((s) => dn(s.starts) <= 0 && dn(s.ends) > 0).sort((a, b) => a.ends.localeCompare(b.ends)))
const soon = computed(() => res.value.filter((s) => dn(s.starts) > 0).sort((a, b) => a.starts.localeCompare(b.starts)))
const checkins = computed(() => res.value.filter((s) => dn(s.starts) >= 0 && dn(s.starts) < 7).length)
const checkouts = computed(() => res.value.filter((s) => dn(s.ends) >= 0 && dn(s.ends) < 7).length)
const tracked = computed(() => (data.value?.units ?? []).filter((u) => u.ical))
const booked30 = computed(() => { let n = 0; for (const s of res.value) n += Math.max(0, Math.min(dn(s.ends), 30) - Math.max(dn(s.starts), 0)); return n })
const occ30 = computed(() => (tracked.value.length ? Math.round(booked30.value / (tracked.value.length * 30) * 100) : null))
// Timeline: 7 days back to 53 ahead.
const pos = (s: S) => { const a = Math.max(dn(s.starts), -BACK), b = Math.min(dn(s.ends), SPAN - BACK); return { left: ((a + BACK) / SPAN * 100) + '%', width: (Math.max(b - a, 0.6) / SPAN * 100) + '%' } }
const ticks = computed(() => { const out: { left: string; label: string }[] = []; for (let i = -BACK; i < SPAN - BACK; i++) { const d = new Date(t0.value + i * DAY); if (d.getUTCDay() === 1) out.push({ left: ((i + BACK) / SPAN * 100) + '%', label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) }) } return out })
const today = computed(() => (BACK / SPAN * 100) + '%')
const day = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const nights = (s: S) => dn(s.ends) - dn(s.starts)
const first = (g: string | null) => (g ? g.trim().split(/\s+/)[0] : '')
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never')
const rel = (d: string) => { const n = dn(d); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? Math.abs(n) + 'd ago' : 'in ' + n + 'd' }
const usd = (v: number | null) => (v === null ? '' : '$' + Math.round(v).toLocaleString('en-US'))
// Who is in: night x of y, and the next guest in the same room (turnover window).
const nightOf = (s: S) => Math.min(nights(s), 1 - dn(s.starts))
const progress = (s: S) => Math.round(Math.min(1, Math.max(0, -dn(s.starts) / Math.max(1, nights(s)))) * 100) + '%'
const nextIn = (s: S) => soon.value.find((x) => x.unit_id === s.unit_id && x.starts >= s.ends) ?? null
const gap = (a: S, b: S) => dn(b.starts) - dn(a.ends)
const urgency = (d: string) => { const n = dn(d); return n <= 0 ? 'r' : n === 1 ? 'a' : n <= 3 ? 'b' : 'n' }
const initials = (g: string | null) => (g ? g.trim().split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') : '?')
const unitProp = (id: string) => data.value?.units.find((u) => u.id === id)?.property ?? ''
// Coming up, grouped by when they arrive. A check-in on a day someone checks out of the same room is a same-day turnover.
const groups = computed(() => {
  const b: { k: string; label: string; list: S[] }[] = [{ k: 't', label: 'Today', list: [] }, { k: 'm', label: 'Tomorrow', list: [] }, { k: 'w', label: 'This week', list: [] }, { k: 'l', label: 'Later', list: [] }]
  for (const s of soon.value.slice(0, 10)) { const n = dn(s.starts); b[n <= 0 ? 0 : n === 1 ? 1 : n < 7 ? 2 : 3]!.list.push(s) }
  return b.filter((g) => g.list.length)
})
const turnover = (s: S) => res.value.some((x) => x !== s && x.unit_id === s.unit_id && x.ends === s.starts)
const dd = (d: string) => new Date(d + 'T12:00:00Z')
const short = (d: string) => dd(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
</script>
<template>
  <div v-if="data" class="card st">
    <div class="sh"><h2>Stays</h2><span class="mut">From the Airbnb calendars · synced {{ when(data.synced) }}</span></div>
    <p v-if="!tracked.length" class="mut">Add each listing's calendar (iCal) link under Properties to see who is staying and who is coming.</p>
    <template v-else>
      <div class="k">
        <div><em>Occupied tonight</em><b>{{ inNow.length }} <small>of {{ tracked.length }}</small></b></div>
        <div><em>Check-ins · next 7 days</em><b>{{ checkins }}</b></div>
        <div><em>Check-outs · next 7 days</em><b>{{ checkouts }}</b></div>
        <div><em>Booked · next 30 days</em><b>{{ occ30 === null ? '—' : occ30 + '%' }} <small>{{ booked30 }} nights</small></b></div>
      </div>
      <div class="tl">
        <div class="ax"><span class="lb" /><div class="tr"><span v-for="t in ticks" :key="t.left" class="tk" :style="{ left: t.left }">{{ t.label }}</span></div></div>
        <div v-for="u in tracked" :key="u.id" class="row"><span class="lb" :title="u.property">{{ u.name }}</span>
          <div class="tr"><span class="now" :style="{ left: today }" />
            <span v-for="(s, i) in data.stays.filter((x) => x.unit_id === u.id)" :key="i" class="bar" :class="[s.kind, { cur: dn(s.starts) <= 0 && dn(s.ends) > 0 }]" :style="pos(s)" :title="(s.kind === 'reserved' ? (s.guest || 'Reserved') : 'Blocked') + ' · ' + day(s.starts) + ' → ' + day(s.ends) + (s.code ? ' · ' + s.code : '')">{{ s.kind === 'reserved' ? first(s.guest) : '' }}</span>
          </div></div>
        <div class="lg"><span><i class="sw reserved" /> Booked</span><span><i class="sw blocked" /> Blocked</span><span><i class="sw nowl" /> Today</span></div>
      </div>
      <div class="lists">
        <section>
          <div class="lh"><h3>Staying now</h3><span class="cnt">{{ inNow.length }} of {{ tracked.length }} {{ tracked.length === 1 ? 'room' : 'rooms' }}</span></div>
          <div class="gc">
            <article v-for="(s, i) in inNow" :key="i" class="gs">
              <div class="gt"><span class="av">{{ initials(s.guest) }}</span>
                <div class="gn"><b>{{ s.guest || 'Guest' }}<small v-if="!s.guest" class="np">name pending</small></b><span>{{ unitName(s.unit_id) }}<template v-if="unitProp(s.unit_id) && unitProp(s.unit_id) !== unitName(s.unit_id)"> · {{ unitProp(s.unit_id) }}</template></span></div>
                <span class="pl" :class="urgency(s.ends)">{{ dn(s.ends) <= 0 ? 'Leaves today' : dn(s.ends) === 1 ? 'Leaves tomorrow' : 'Leaves ' + rel(s.ends) }}</span></div>
              <div class="pg"><i :style="{ width: progress(s) }" /></div>
              <div class="gd"><span>In {{ short(s.starts) }}</span><span class="mid">Night {{ nightOf(s) }} of {{ nights(s) }}</span><span>Out {{ day(s.ends) }}</span></div>
              <div class="gf">
                <span v-if="nextIn(s)" class="nx" :class="{ tight: gap(s, nextIn(s)!) === 0 }">{{ gap(s, nextIn(s)!) === 0 ? 'Same-day turnover' : 'Next guest' }} · {{ short(nextIn(s)!.starts) }}{{ gap(s, nextIn(s)!) > 0 ? ' (' + gap(s, nextIn(s)!) + ' day' + (gap(s, nextIn(s)!) === 1 ? '' : 's') + ' free)' : ': clean between' }}</span>
                <span v-else class="nx free">No next booking yet</span>
                <span class="cd">{{ s.code }}<template v-if="s.payout"> · {{ usd(s.payout) }}</template></span></div>
            </article>
          </div>
          <p v-if="!inNow.length" class="empty">Nobody in tonight. Every room is free.</p>
        </section>
        <section>
          <div class="lh"><h3>Arriving</h3><span class="cnt">{{ soon.length }} in the next {{ SPAN - BACK }} days</span></div>
          <div v-for="g in groups" :key="g.k" class="grp"><p class="gl">{{ g.label }}</p>
            <div v-for="(s, i) in g.list" :key="i" class="ar">
              <span class="dt" :class="{ hot: dn(s.starts) <= 1 }"><em>{{ dd(s.starts).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) }}</em><b>{{ dd(s.starts).getUTCDate() }}</b><small>{{ dd(s.starts).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) }}</small></span>
              <span class="ai"><b>{{ s.guest || 'Guest' }}<small v-if="!s.guest" class="np">name pending</small></b><span>{{ unitName(s.unit_id) }} · {{ nights(s) }} night{{ nights(s) === 1 ? '' : 's' }} · until {{ short(s.ends) }}</span>
                <span class="tg"><i v-if="turnover(s)" class="t a">Same-day turnover</i><i v-if="nights(s) >= 28" class="t b">Long stay</i><i class="t n">{{ rel(s.starts) }}</i></span></span>
              <span class="ap"><b v-if="s.payout">{{ usd(s.payout) }}</b><em>{{ s.code }}</em></span>
            </div>
          </div>
          <p v-if="!soon.length" class="empty">No check-ins booked in the next {{ SPAN - BACK }} days.</p>
        </section>
      </div>
      <p class="mut small">Guest names and payouts appear once that booking's Airbnb rows are imported (Money tab).</p>
    </template>
  </div>
</template>
<style scoped>
.st { display: flex; flex-direction: column; gap: 14px; } .sh { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; } .sh h2 { margin: 0; font-size: 16px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .small { font-size: 12px; }
.k { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--c-rule); } .k > div { padding: 10px 14px; border-left: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 2px; } .k > div:first-child { border-left: 0; }
.k em { font-style: normal; font-size: 12px; color: var(--c-muted); } .k b { font-size: 20px; font-weight: 600; color: var(--c-navy); } .k small { font-size: 12px; font-weight: 400; color: var(--c-muted); }
.tl { display: flex; flex-direction: column; gap: 6px; } .row, .ax { display: grid; grid-template-columns: 170px 1fr; gap: 10px; align-items: center; }
.lb { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-ink-soft); } .tr { position: relative; height: 26px; background: var(--c-paper-2); } .ax .tr { background: none; height: 16px; }
.tk { position: absolute; top: 0; font-size: 11px; color: var(--c-muted); transform: translateX(-2px); border-left: 1px solid var(--c-rule-strong); padding-left: 3px; white-space: nowrap; }
.now { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--c-danger); z-index: 2; }
.bar { position: absolute; top: 3px; bottom: 3px; font-size: 11px; color: #fff; padding: 0 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 20px; border-right: 2px solid #fff; }
.bar.reserved { background: var(--c-blue, #1c547d); } .bar.reserved.cur { background: var(--c-navy); } .bar.blocked { background: repeating-linear-gradient(135deg, #d9dde3 0 4px, #eceef1 4px 8px); }
.lg { display: flex; gap: 14px; font-size: 12px; color: var(--c-muted); padding-left: 180px; } .sw { display: inline-block; width: 12px; height: 10px; margin-right: 4px; vertical-align: -1px; } .sw.reserved { background: var(--c-blue, #1c547d); } .sw.blocked { background: repeating-linear-gradient(135deg, #d9dde3 0 3px, #eceef1 3px 6px); } .sw.nowl { width: 2px; background: var(--c-danger); }
.lists { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.lh { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; } h3 { margin: 0; font-size: 14px; font-weight: 600; color: var(--c-ink); } .cnt { font-size: 12px; color: var(--c-muted); }
.gc { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.gs { border: 1px solid var(--c-rule); background: #fff; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.gt { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.av { width: 34px; height: 34px; border-radius: 50%; background: var(--c-signal-soft); color: var(--c-blue-deep); display: grid; place-items: center; font-size: 12px; font-weight: 600; }
.gn { display: flex; flex-direction: column; min-width: 0; } .gn b { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .gn span { font-size: 12px; color: var(--c-muted); line-height: 1.35; } .np { font-size: 11px; font-weight: 400; color: var(--c-muted); margin-left: 6px; }
.pl { font-size: 11.5px; padding: 3px 8px; white-space: nowrap; font-weight: 500; } .pl.r { background: #fdecef; color: var(--c-danger); } .pl.a { background: #fff6e6; color: #a5650b; } .pl.b { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pl.n { background: #eef0f6; color: var(--c-navy); }
.pg { height: 6px; background: var(--c-paper-2); } .pg i { display: block; height: 100%; background: var(--c-navy); }
.gd { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--c-muted); gap: 6px; } .gd .mid { color: var(--c-ink); font-weight: 500; }
.gf { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--c-rule); padding-top: 8px; font-size: 12px; flex-wrap: wrap; }
.nx { color: var(--c-ink-soft); } .nx.tight { color: #a5650b; font-weight: 500; } .nx.free { color: var(--c-ok); } .cd { color: var(--c-muted); font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; }
.grp + .grp { margin-top: 10px; } .gl { margin: 0 0 4px; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); }
.ar { display: grid; grid-template-columns: 50px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 9px 0; border-top: 1px solid var(--c-rule); }
.dt { display: flex; flex-direction: column; align-items: center; border: 1px solid var(--c-rule); padding: 3px 0; line-height: 1.1; } .dt em { font-style: normal; font-size: 10px; text-transform: uppercase; color: var(--c-muted); letter-spacing: .04em; } .dt b { font-size: 18px; font-weight: 600; color: var(--c-navy); } .dt small { font-size: 10px; color: var(--c-muted); }
.dt.hot { border-color: var(--c-navy); background: var(--c-navy); } .dt.hot em, .dt.hot b, .dt.hot small { color: #fff; }
.ai { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .ai > b { font-size: 13.5px; font-weight: 600; } .ai > span { font-size: 12px; color: var(--c-muted); }
.tg { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 2px; } .t { font-style: normal; font-size: 11px; padding: 1px 6px; } .t.a { background: #fff6e6; color: #a5650b; } .t.b { background: var(--c-signal-soft); color: var(--c-blue-deep); } .t.n { background: #eef0f6; color: var(--c-navy); }
.ap { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; } .ap b { font-size: 13.5px; font-weight: 600; } .ap em { font-style: normal; font-size: 11px; color: var(--c-muted); font-family: var(--font-mono, ui-monospace, monospace); }
.empty { border: 1px dashed var(--c-rule-strong); padding: 14px; font-size: 13px; color: var(--c-muted); margin: 0; }
@media (max-width: 1000px) { .lists { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .k { grid-template-columns: 1fr 1fr; } .k > div:nth-child(3) { border-left: 0; } .row, .ax { grid-template-columns: 90px 1fr; } .lg { padding-left: 100px; } .lists { grid-template-columns: 1fr; } }
</style>
