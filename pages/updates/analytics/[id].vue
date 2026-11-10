<script setup lang="ts">
// Update analytics: who received an investor update, who opened it and when, what they clicked, how they reacted and
// what they wrote back, with the open rate, unique opens over time and the most-clicked links.
interface P { id: string; name: string; email: string; firm: string | null; sent_at: string; delivery: string | null; first_opened_at: string | null; opened_at: string | null; opens: number; clicks: number; last_clicked_at: string | null; reactions: string[]; notes: number; links: { url: string; at: string }[] }
interface A { update: { id: string; title: string; sent_at: string | null; sent_to: string[] }; totals: { sent: number; delivered: number; bounced: number; tracked: boolean; unique_opens: number; total_opens: number; open_rate: number; clicks: number; clickers: number; reactions: number; notes: number }
  timeline: { day: string; opens: number }[]; reactions: Record<string, number>; links: { url: string; clicks: number; people: number }[]; notes: { name: string; email: string; body: string; at: string }[]; people: P[] }
const id = useRoute().params.id as string
const { data, error, refresh, pending } = await useFetch<A>('/api/updates/' + id + '/analytics')
useHead({ title: () => (data.value ? data.value.update.title + ' · Analytics' : 'Update analytics') })
const EMO: Record<string, string> = { up: '👍', love: '❤️', party: '🎉', rocket: '🚀', clap: '👏', think: '🤔' }
const EMO_L: Record<string, string> = { up: 'Like', love: 'Love', party: 'Celebrate', rocket: 'Great progress', clap: 'Well done', think: 'Questions' }
const t = computed(() => data.value?.totals)
const pct = (v: number) => Math.round(v * 100) + '%'
function ago(s: string | null) {
  if (!s) return ''
  const m = Math.round((Date.now() - Date.parse(s)) / 60000)
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour' : ' hours') + ' ago'
  const d = Math.round(h / 24); if (d < 30) return d + (d === 1 ? ' day' : ' days') + ' ago'
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
const host = (u: string) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.slice(0, 28) + (x.pathname.length > 28 ? '…' : '') : '') } catch { return u.slice(0, 40) } }
// Filters, search and sort for the people list.
const F = [['all', 'Everyone'], ['opened', 'Opened'], ['unopened', 'Not opened'], ['clicked', 'Clicked'], ['reacted', 'Reacted'], ['bounced', 'Not delivered']] as const
const filter = ref<(typeof F)[number][0]>('all'), q = ref(''), sort = ref<'recent' | 'opens' | 'clicks' | 'name'>('recent'), open = ref('')
const bounced = (p: P) => ['bounced', 'complained', 'failed'].includes(p.delivery ?? '')
const match = (p: P, f: string) => f === 'all' || (f === 'opened' && p.opens > 0) || (f === 'unopened' && !p.opens && !bounced(p)) || (f === 'clicked' && p.clicks > 0) || (f === 'reacted' && (p.reactions.length > 0 || p.notes > 0)) || (f === 'bounced' && bounced(p))
const count = (f: string) => (data.value?.people ?? []).filter((p) => match(p, f)).length
const rows = computed(() => {
  const s = q.value.trim().toLowerCase()
  const r = (data.value?.people ?? []).filter((p) => match(p, filter.value) && (!s || (p.name + ' ' + p.email + ' ' + (p.firm ?? '')).toLowerCase().includes(s)))
  const key = (p: P) => (sort.value === 'opens' ? -p.opens : sort.value === 'clicks' ? -p.clicks : 0)
  return [...r].sort((a, b) => sort.value === 'name' ? a.name.localeCompare(b.name) : sort.value === 'recent' ? Date.parse(b.opened_at ?? '1970') - Date.parse(a.opened_at ?? '1970') : key(a) - key(b))
})
const delivery = (p: P) => (bounced(p) ? { k: 'bad', l: p.delivery === 'complained' ? 'Marked as spam' : p.delivery === 'failed' ? 'Not sent' : 'Bounced' } : p.delivery === 'delivered' || p.opens > 0 ? { k: 'ok', l: 'Delivered' } : p.delivery === 'delayed' ? { k: 'wait', l: 'Delayed' } : { k: 'sent', l: 'Sent' })
// Unique opens over time, drawn as an area chart.
const chart = computed(() => {
  const d = data.value?.timeline ?? [], max = Math.max(1, data.value?.totals.sent ?? 1), W = 600, H = 180
  if (!d.length) return null
  const x = (i: number) => (d.length === 1 ? W / 2 : (i / (d.length - 1)) * W), y = (v: number) => H - (v / max) * (H - 10)
  const line = d.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.opens).toFixed(1)).join(' ')
  return { W, H, line, area: line + ' L' + x(d.length - 1).toFixed(1) + ' ' + H + ' L0 ' + H + ' Z', first: d[0]!.day, last: d[d.length - 1]!.day, max }
})
function csv() {
  const head = ['Name', 'Email', 'Firm', 'Delivery', 'First opened', 'Last opened', 'Opens', 'Clicks', 'Reactions', 'Notes']
  const lines = (data.value?.people ?? []).map((p) => [p.name, p.email, p.firm ?? '', delivery(p).l, p.first_opened_at ?? '', p.opened_at ?? '', p.opens, p.clicks, p.reactions.map((r) => EMO_L[r] ?? r).join(' '), p.notes])
  const body = [head, ...lines].map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' })); a.download = (data.value?.update.title ?? 'update') + ' - analytics.csv'; a.click()
}
</script>
<template>
  <div class="ua">
    <NuxtLink to="/updates" class="back">← Investor updates</NuxtLink>
    <p v-if="error" class="error">This update could not be found.</p>
    <template v-else-if="data && t">
      <header class="hd">
        <div><span class="ey">Update analytics</span><h1>{{ data.update.title }}</h1>
          <span class="mut">{{ data.update.sent_at ? 'Sent ' + new Date(data.update.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not sent yet' }}{{ data.update.sent_to.length ? ' · to ' + data.update.sent_to.join(', ') : '' }} · {{ t.sent }} {{ t.sent === 1 ? 'person' : 'people' }}</span></div>
        <div class="ha"><button class="btn secondary" :disabled="pending" @click="refresh()">{{ pending ? 'Refreshing…' : 'Refresh' }}</button><button class="btn secondary" :disabled="!t.sent" @click="csv">Download CSV</button><NuxtLink :to="'/updates/' + id" class="btn">Open the update</NuxtLink></div>
      </header>

      <section class="card top">
        <div class="ring"><svg viewBox="0 0 120 120" role="img" :aria-label="'Open rate ' + pct(t.open_rate)"><circle cx="60" cy="60" r="50" fill="none" stroke="#e6edf4" stroke-width="12" /><circle cx="60" cy="60" r="50" fill="none" stroke="#1c547d" stroke-width="12" :stroke-dasharray="(t.open_rate * 314.16).toFixed(1) + ' 314.16'" transform="rotate(-90 60 60)" /></svg>
          <div class="rv"><b>{{ pct(t.open_rate) }}</b><span>opened</span></div><p class="mut">{{ t.unique_opens }} of {{ t.sent }} people</p></div>
        <div class="kp">
          <div><span>Delivered</span><b>{{ t.tracked || t.delivered ? t.delivered : '—' }}</b><em>{{ t.bounced ? t.bounced + ' not delivered' : t.tracked ? 'of ' + t.sent : 'Shown once the email service reports back' }}</em></div>
          <div><span>Unique opens</span><b>{{ t.unique_opens }}</b><em>{{ t.sent - t.unique_opens - t.bounced > 0 ? (t.sent - t.unique_opens - t.bounced) + ' still to open' : 'Everyone has opened' }}</em></div>
          <div><span>Total opens</span><b>{{ t.total_opens }}</b><em>{{ t.unique_opens ? (t.total_opens / t.unique_opens).toFixed(1) + ' per reader' : '—' }}</em></div>
          <div><span>Link clicks</span><b>{{ t.clicks }}</b><em>{{ t.clickers ? 'by ' + t.clickers + (t.clickers === 1 ? ' person' : ' people') : 'No clicks yet' }}</em></div>
          <div><span>Reactions</span><b>{{ t.reactions }}</b><em>{{ t.notes ? t.notes + (t.notes === 1 ? ' note' : ' notes') : 'No notes yet' }}</em></div>
        </div>
      </section>

      <section class="g2">
        <div class="card">
          <div class="sh"><h3>Opens over time</h3><span class="mut">Unique readers</span></div>
          <svg v-if="chart" :viewBox="'0 0 ' + chart.W + ' ' + (chart.H + 2)" class="ch" preserveAspectRatio="none" role="img" :aria-label="t.unique_opens + ' unique opens since sending'"><path :d="chart.area" fill="#e6eef6" /><path :d="chart.line" fill="none" stroke="#1c547d" stroke-width="2.5" vector-effect="non-scaling-stroke" /><line x1="0" :y1="chart.H" :x2="chart.W" :y2="chart.H" stroke="#d9d6cf" vector-effect="non-scaling-stroke" /></svg>
          <div v-if="chart" class="ax"><span>{{ new Date(chart.first).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }}</span><span>{{ t.unique_opens }} of {{ chart.max }}</span><span>{{ new Date(chart.last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }}</span></div>
        </div>
        <div class="card">
          <h3>Reactions</h3>
          <div v-if="Object.keys(data.reactions).length" class="rx"><div v-for="(n, k) in data.reactions" :key="k" class="rxr"><span class="e" :title="EMO_L[k]">{{ EMO[k] ?? k }}</span><span class="bar"><i :style="{ width: (n / Math.max(...Object.values(data.reactions))) * 100 + '%' }" /></span><b>{{ n }}</b></div></div>
          <p v-else class="mut">No reactions yet.</p>
          <h3 class="h2">Most-clicked links</h3>
          <div v-for="l in data.links" :key="l.url" class="lk"><a :href="l.url" target="_blank" rel="noopener">{{ host(l.url) }}</a><span class="mut">{{ l.clicks }} {{ l.clicks === 1 ? 'click' : 'clicks' }} · {{ l.people }} {{ l.people === 1 ? 'person' : 'people' }}</span></div>
          <p v-if="!data.links.length" class="mut">No clicks yet.</p>
        </div>
      </section>

      <section v-if="data.notes.length" class="card">
        <h3>Notes from readers</h3>
        <div v-for="(n, i) in data.notes" :key="i" class="note"><span class="av">{{ initials(n.name) }}</span><div><b>{{ n.name }}</b> <span class="mut">{{ ago(n.at) }}</span><p>{{ n.body }}</p><a :href="'mailto:' + n.email">Reply by email</a></div></div>
      </section>

      <section class="card ppl">
        <div class="pt"><h3>Recipients</h3>
          <div class="tools"><label class="srch"><span aria-hidden="true">⌕</span><input v-model="q" type="search" placeholder="Search name, email or firm" aria-label="Search recipients"></label>
            <select v-model="sort" aria-label="Sort"><option value="recent">Last opened</option><option value="opens">Most opens</option><option value="clicks">Most clicks</option><option value="name">Name</option></select></div></div>
        <div class="chips"><button v-for="[k, l] in F" :key="k" :class="{ on: filter === k }" :disabled="k !== 'all' && !count(k)" @click="filter = k">{{ l }} <span>{{ count(k) }}</span></button></div>
        <div class="tbl">
          <div class="tr th"><span>Person</span><span>Delivery</span><span>Last opened</span><span class="n">Opens</span><span class="n">Clicks</span><span>Reactions</span><span /></div>
          <template v-for="p in rows" :key="p.id">
            <div class="tr" :class="{ ex: open === p.id }" role="button" tabindex="0" @click="open = open === p.id ? '' : p.id" @keydown.enter="open = open === p.id ? '' : p.id">
              <span class="who"><span class="av" :class="{ dim: !p.opens }">{{ initials(p.name) }}</span><span class="nm"><b>{{ p.name }}</b><em>{{ p.email }}</em><i v-if="p.firm" class="tag">{{ p.firm }}</i></span></span>
              <span><i class="dv" :class="delivery(p).k">{{ delivery(p).l }}</i></span>
              <span>{{ p.opened_at ? ago(p.opened_at) : 'Not yet' }}</span>
              <span class="n">{{ p.opens || '—' }}</span>
              <span class="n">{{ p.clicks || '—' }}</span>
              <span class="emo">{{ p.reactions.map((r) => EMO[r] ?? '').join(' ') }}<i v-if="p.notes" class="nb" :title="p.notes + ' note'">✉︎</i><i v-if="!p.reactions.length && !p.notes" class="dash">—</i><i class="mo">{{ p.opened_at ? 'Opened ' + ago(p.opened_at) + (p.opens > 1 ? ' · ' + p.opens + ' times' : '') : 'Not opened yet' }}{{ p.clicks ? ' · ' + p.clicks + (p.clicks === 1 ? ' click' : ' clicks') : '' }}</i></span>
              <span class="cv">{{ open === p.id ? '▴' : '▾' }}</span>
            </div>
            <div v-if="open === p.id" class="det">
              <div><span>Sent</span><b>{{ when(p.sent_at) }}</b></div><div><span>First opened</span><b>{{ when(p.first_opened_at) }}</b></div><div><span>Last opened</span><b>{{ when(p.opened_at) }}</b></div><div><span>Last click</span><b>{{ when(p.last_clicked_at) }}</b></div>
              <div v-if="p.links.length" class="wide"><span>Links clicked</span><ul><li v-for="(l, i) in p.links" :key="i"><a :href="l.url" target="_blank" rel="noopener">{{ host(l.url) }}</a> <em>{{ when(l.at) }}</em></li></ul></div>
              <div v-if="p.reactions.length" class="wide"><span>Reacted</span><b>{{ p.reactions.map((r) => (EMO[r] ?? '') + ' ' + (EMO_L[r] ?? r)).join(' · ') }}</b></div>
              <div class="wide"><a :href="'mailto:' + p.email">Email {{ p.name.split(' ')[0] }}</a></div>
            </div>
          </template>
          <p v-if="!rows.length" class="mut empty">{{ t.sent ? 'Nobody matches.' : 'This update hasn\'t been emailed yet.' }}</p>
        </div>
      </section>
      <p class="foot">Opens are counted when a reader's email app loads pictures, so some apps (Apple Mail's privacy setting, for one) may count an open before it is read, and some readers who block pictures only show up when they click.</p>
    </template>
  </div>
</template>
<style scoped>
.ua { max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; } .back { color: var(--c-blue-deep); text-decoration: none; font-size: 13.5px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .error { color: var(--c-danger); }
.hd { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 14px; } .ey { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--c-muted); } .hd h1 { margin: 4px 0 4px; font-size: 28px; color: var(--c-navy); letter-spacing: -0.02em; } .ha { display: flex; flex-wrap: wrap; gap: 8px; } .ha a { text-decoration: none; }
.top { display: flex; flex-wrap: wrap; gap: 28px; align-items: center; padding: 24px 28px; } .ring { position: relative; width: 150px; flex: none; text-align: center; } .ring svg { width: 130px; height: 130px; display: block; margin: 0 auto; }
.rv { position: absolute; top: 0; left: 0; right: 0; height: 130px; display: flex; flex-direction: column; align-items: center; justify-content: center; } .rv b { font-size: 30px; color: var(--c-navy); line-height: 1; } .rv span { font-size: 12px; color: var(--c-muted); } .ring .mut { margin-top: 6px; }
.kp { flex: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--c-rule); border: 1px solid var(--c-rule); min-width: 280px; } .kp > div { background: #fff; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.kp span { font-size: 12.5px; color: var(--c-muted); } .kp b { font-size: 26px; font-weight: 600; color: var(--c-navy); } .kp em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.g2 { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; } h3 { margin: 0 0 12px; font-size: 16px; color: var(--c-navy); } .h2 { margin-top: 20px; } .sh { display: flex; justify-content: space-between; align-items: baseline; }
.ch { width: 100%; height: 200px; display: block; } .ax { display: flex; justify-content: space-between; font-size: 12px; color: var(--c-muted); margin-top: 6px; }
.rx { display: flex; flex-direction: column; gap: 8px; } .rxr { display: grid; grid-template-columns: 30px 1fr 30px; gap: 10px; align-items: center; } .e { font-size: 20px; } .bar { height: 8px; background: #eef2f6; display: block; } .bar i { display: block; height: 8px; background: #1c547d; } .rxr b { text-align: right; font-size: 13.5px; }
.lk { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .lk a, .det a, .note a { color: var(--c-blue-deep); text-decoration: none; word-break: break-all; }
.note { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--c-rule); } .note p { margin: 4px 0 6px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; } .note a { font-size: 13px; }
.av { width: 38px; height: 38px; flex: none; background: #e6eef6; color: var(--c-navy); display: inline-flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; border-radius: 50%; } .av.dim { background: #f1f0ec; color: var(--c-muted); }
.pt { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; } .pt h3 { margin: 0; } .tools { display: flex; flex-wrap: wrap; gap: 8px; }
.srch { display: flex; align-items: center; gap: 6px; border: 1px solid var(--c-rule-strong); padding: 0 10px; background: #fff; } .srch span { color: var(--c-muted); font-size: 15px; } .srch input { border: 0; outline: none; font: inherit; font-size: 13.5px; padding: 8px 0; min-width: 210px; } .tools select { font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 8px; } .chips button { font: inherit; font-size: 13px; padding: 7px 12px; border: 1px solid var(--c-rule); background: #fff; color: var(--c-ink); cursor: pointer; } .chips button span { color: var(--c-muted); margin-left: 4px; } .chips button.on { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } .chips button.on span { color: #c9d6e5; } .chips button:disabled { opacity: .45; cursor: default; }
.tbl { display: flex; flex-direction: column; } .tr { display: grid; grid-template-columns: minmax(0, 2.6fr) 120px 120px 64px 64px 110px 20px; gap: 12px; align-items: center; padding: 12px 6px; border-top: 1px solid var(--c-rule); font-size: 13.5px; cursor: pointer; } .tr:hover { background: #fafaf8; } .tr.ex { background: #f6f8fb; }
.tr.th { font-size: 12px; color: var(--c-muted); cursor: default; border-top: 0; padding-top: 4px; } .tr.th:hover { background: none; } .n { text-align: right; }
.who { display: flex; gap: 12px; align-items: center; min-width: 0; } .nm { display: flex; flex-direction: column; min-width: 0; } .nm b { font-weight: 600; color: var(--c-ink); } .nm em { font-style: normal; color: var(--c-muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .tag { font-style: normal; font-size: 11.5px; color: var(--c-ink-soft); background: #f1f0ec; padding: 1px 6px; align-self: flex-start; margin-top: 3px; }
.dv { font-style: normal; font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px; } .dv::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #9aa3ad; } .dv.ok::before { background: #1c547d; } .dv.bad { color: var(--c-danger); } .dv.bad::before { background: var(--c-danger); } .dv.wait::before { background: var(--c-warn); }
.emo { font-size: 16px; display: flex; gap: 4px; align-items: center; padding-left: 14px; } .dash { font-style: normal; font-size: 13.5px; } .mo { display: none; font-style: normal; font-size: 12.5px; color: var(--c-muted); } .nb { font-style: normal; font-size: 13px; color: var(--c-blue-deep); } .cv { color: var(--c-muted); font-size: 12px; }
.det { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 18px; padding: 12px 6px 16px 56px; background: #f6f8fb; font-size: 13px; } .det > div { display: flex; flex-direction: column; gap: 2px; } .det span { font-size: 12px; color: var(--c-muted); } .det b { font-weight: 500; } .det .wide { grid-column: 1 / -1; } .det ul { margin: 2px 0 0; padding-left: 16px; } .det em { color: var(--c-muted); font-style: normal; }
.empty { padding: 16px 6px; } .foot { font-size: 12px; color: var(--c-muted); margin: 0; }
@media (max-width: 860px) { .g2 { grid-template-columns: 1fr; } .tr { grid-template-columns: minmax(0, 1fr) auto; } .tr.th { display: none; } .tr > span:nth-child(n+3):not(.cv):not(.emo) { display: none; } .tr .cv { display: none; } .tr > span:nth-child(2) { justify-self: end; } .tr .emo { grid-column: 1 / -1; padding-left: 50px; flex-wrap: wrap; } .tr .dash { display: none; } .tr .mo { display: inline; margin-left: 2px; } .det { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-left: 6px; } .srch input { min-width: 0; width: 100%; } }
</style>
