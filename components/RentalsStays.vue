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
        <div><h3>In now</h3>
          <div v-for="(s, i) in inNow" :key="i" class="it"><b>{{ unitName(s.unit_id) }}</b><span>{{ s.guest || 'Guest' }}<template v-if="s.code"> · {{ s.code }}</template></span><em>Checks out {{ day(s.ends) }} ({{ rel(s.ends) }})</em></div>
          <p v-if="!inNow.length" class="mut">Nobody in tonight.</p></div>
        <div><h3>Coming up</h3>
          <div v-for="(s, i) in soon.slice(0, 8)" :key="i" class="it"><b>{{ day(s.starts) }} <small>{{ rel(s.starts) }}</small></b><span>{{ unitName(s.unit_id) }} · {{ s.guest || 'Guest' }} · {{ nights(s) }} night{{ nights(s) === 1 ? '' : 's' }}<template v-if="s.payout"> · {{ usd(s.payout) }}</template></span><em>{{ s.code }}</em></div>
          <p v-if="!soon.length" class="mut">No upcoming check-ins in the next 60 days.</p></div>
      </div>
      <p class="mut small">Guest names and amounts show once that booking's Airbnb rows are imported.</p>
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
.lists { display: grid; grid-template-columns: 1fr 1.4fr; gap: 16px; } h3 { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--c-muted); font-weight: 600; }
.it { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; padding: 7px 0; border-top: 1px solid var(--c-rule); font-size: 13px; } .it b { font-weight: 600; } .it b small { font-weight: 400; color: var(--c-muted); margin-left: 4px; } .it span { grid-column: 1; color: var(--c-ink-soft); } .it em { grid-row: 1; grid-column: 2; font-style: normal; color: var(--c-muted); font-size: 12px; }
@media (max-width: 760px) { .k { grid-template-columns: 1fr 1fr; } .k > div:nth-child(3) { border-left: 0; } .row, .ax { grid-template-columns: 90px 1fr; } .lg { padding-left: 100px; } .lists { grid-template-columns: 1fr; } }
</style>
