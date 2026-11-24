<script setup lang="ts">
// Financial boards: one per audience (CFO, Executive, Team, Investors) plus your own; edit and share.
useHead({ title: 'Boards' })
interface B { id: string; audience: string; name: string; kpis: string[]; charts: { title: string; metrics: string[]; type?: string }[]; period: string; count: number; note: string | null; share_url: string | null; share_enabled: boolean; share_expires: string | null; views: number; last_viewed_at: string | null; data: Parameters<typeof useBoardData>[0]; forecast: { id: string | null; name: string; group: boolean; assumptions: import('~/shared/forecast').Assumptions | null; pack: { currency: string; months: number; base: import('~/shared/forecast').Result; best: import('~/shared/forecast').Result; worst: import('~/shared/forecast').Result } | null } | null; forecast_id: string | null; sections: { forecast?: boolean; statements?: boolean }; reports: { id: string; title: string; mime_type: string; size_bytes: number; created_at: string }[]; share_access: 'public' | 'invited'; share_emails: string[]; viewers: { email: string; views: number; last_viewed_at: string }[] }
function useBoardData(d: { labels: string[]; series: Record<string, (number | null)[]>; kpis: { key: string; label: string; unit: string; value: number | null; prev: number | null; change: number | null }[]; charts: { title: string; metrics: string[] }[]; currency: string; period: string }) { return d }
// The company (or the group) chosen at the top, as on Financials.
const { cust } = await useCoScope()
// Fetched together, not one after another (each wait is a round trip to the server).
const [__p897_0, __p897_1] = await Promise.all([
  useFetch<{ subject: string; boards: B[]; metrics: Record<string, { label: string; unit: string }>; forecasts: { id: string; name: string }[] }>('/api/financials/boards', { query: { cust }, watch: [cust] }),
  useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })])
const { data, refresh } = __p897_0
const { data: me } = __p897_1
const canEdit = computed(() => !!me.value?.roles?.some((r) => ['admin', 'gp'].includes(r)))
const sel = ref(''); watchEffect(() => { if (!sel.value && data.value?.boards.length) sel.value = data.value.boards[0]!.id })
const board = computed(() => data.value?.boards.find((b) => b.id === sel.value) ?? null)
const msg = ref(''); const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function setPeriod(period: string) { if (!board.value) return; await $fetch('/api/financials/boards', { method: 'POST', body: { id: board.value.id, period, count: period === 'year' ? 5 : period === 'quarter' ? 8 : 12 } }); await refresh() }
const ed = reactive({ open: false, name: '', note: '', kpis: [] as string[], charts: [] as { title: string; metrics: string[]; type?: string }[], forecast_id: '', showForecast: false, showStatements: false, docs: [] as string[] })
function openEdit() { const b = board.value!; Object.assign(ed, { open: true, name: b.name, note: b.note ?? '', kpis: [...b.kpis], charts: JSON.parse(JSON.stringify(b.charts)), forecast_id: b.forecast_id ?? '', showForecast: !!b.sections?.forecast, showStatements: !!b.sections?.statements, docs: b.reports.map((r) => r.id) }); loadDocs() }
function toggleKpi(k: string) { ed.kpis = ed.kpis.includes(k) ? ed.kpis.filter((x) => x !== k) : [...ed.kpis, k] }
// Reports on the board: PDFs and Excel files from Documents (e.g. the management report), or uploaded here.
const docs = ref<{ id: string; title: string; mime_type: string; created_at: string; size_bytes?: number | string }[]>([])
async function loadDocs() { try { docs.value = (await $fetch<{ id: string; title: string; mime_type: string; created_at: string }[]>('/api/documents')).filter((d) => d.mime_type === 'application/pdf' || d.mime_type.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml')) } catch { docs.value = [] } }
const docPick = ref('')
watch(docPick, (v) => { if (v && !ed.docs.includes(v)) ed.docs.push(v); docPick.value = '' })
const docInfo = (id: string) => docs.value.find((d) => d.id === id) ?? board.value?.reports.find((r) => r.id === id) ?? null
const docTitle = (id: string) => docs.value.find((d) => d.id === id)?.title ?? board.value?.reports.find((r) => r.id === id)?.title ?? 'Report'
const upl = reactive({ busy: false, msg: '' })
async function uploadReport(e: Event) {
  const f = ((e.target as HTMLInputElement).files ?? [])[0]; if (!f || !board.value) return
  upl.busy = true; upl.msg = ''
  try { const fd = new FormData(); fd.append('file', f); const r = await $fetch<{ id: string }>('/api/financials/boards/' + board.value.id + '/reports', { method: 'POST', body: fd }); ed.docs.push(r.id); await loadDocs(); upl.msg = f.name + ' added.' }
  catch (x) { upl.msg = err(x) } finally { upl.busy = false }
}
async function openReport(id: string) { try { const r = await $fetch<{ url: string }>('/api/financials/boards/' + board.value!.id + '/reports/' + id); window.open(r.url, '_blank', 'noopener') } catch (e) { msg.value = err(e) } }
const kb = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')
async function saveEdit() { msg.value = ''; try { await $fetch('/api/financials/boards', { method: 'POST', body: { id: board.value!.id, name: ed.name, note: ed.note, kpis: ed.kpis, charts: ed.charts.filter((c) => c.metrics.length), ...(data.value?.forecasts.length ? { forecast_id: ed.forecast_id || null } : {}), sections: { forecast: ed.showForecast, statements: ed.showStatements }, documents: ed.docs } }); ed.open = false; await refresh() } catch (e) { msg.value = err(e) } }
async function newBoard() { const r = await $fetch<{ id: string }>('/api/financials/boards', { method: 'POST', body: { name: 'New board' } }); await refresh(); sel.value = r.id; openEdit() }
const sh = reactive({ open: false, expires: 0, copied: false, mode: 'public' as 'public' | 'invited', emails: [] as string[], add: '', notify: true, busy: false, ok: '' })
// Who can open the link: anyone with it, or only the emails (or whole firms, as @fund.com) the company invites.
watch(() => sh.open, (o) => { if (o && board.value) Object.assign(sh, { mode: board.value.share_access ?? 'public', emails: [...(board.value.share_emails ?? [])], add: '', ok: '' }) })
function addEmails() { const got = sh.add.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^([^\s@]+@|@)[^\s@]+\.[^\s@]+$/.test(x)); sh.emails = [...new Set([...sh.emails, ...got])]; sh.add = '' }
async function saveAccess() {
  addEmails(); msg.value = ''; sh.ok = ''; sh.busy = true
  try { const r = await $fetch<{ invited: number }>('/api/financials/boards', { method: 'POST', body: { id: board.value!.id, access: { mode: sh.mode, emails: sh.emails, notify: sh.notify } } }); await refresh(); sh.ok = sh.mode === 'invited' ? 'Only invited people can open it now.' + (r.invited ? ' ' + r.invited + ' invite' + (r.invited === 1 ? '' : 's') + ' sent.' : '') : 'Anyone with the link can open it.' }
  catch (e) { msg.value = err(e) } finally { sh.busy = false }
}
const seenOf = (e: string) => board.value?.viewers?.find((v) => v.email === e) ?? null
async function share(enabled: boolean, reset = false) { msg.value = ''; try { await $fetch('/api/financials/boards', { method: 'POST', body: { id: board.value!.id, share: { enabled, expires_days: sh.expires, reset } } }); await refresh() } catch (e) { msg.value = err(e) } }
async function copy() { if (board.value?.share_url) { await navigator.clipboard.writeText(board.value.share_url); sh.copied = true; setTimeout(() => (sh.copied = false), 1500) } }
async function setType(i: number, type: string) { if (!board.value) return; const charts = board.value.charts.map((c, k) => (k === i ? { ...c, type } : c)); (board.value.data.charts[i] as { type?: string }).type = type; try { await $fetch('/api/financials/boards', { method: 'POST', body: { id: board.value.id, charts } }) } catch (e) { msg.value = err(e) } }
</script>
<template>
  <section v-if="data">
    <p class="label">Financials</p>
    <div class="head"><div><ScopeSwitch page="Boards" /><p class="lead">Your figures, set up for each audience.</p></div><NuxtLink to="/financials" class="btn secondary">Back to Financials</NuxtLink></div>
    <nav class="bt"><button v-for="b in data.boards" :key="b.id" :class="{ on: sel === b.id }" @click="sel = b.id">{{ b.name }}<i v-if="b.share_enabled" title="Shared">●</i></button><button v-if="canEdit" class="add" @click="newBoard">+ New board</button></nav>
    <template v-if="board">
      <div class="bh"><p class="mut">{{ board.note }}</p><div class="tools">
        <div class="seg"><button v-for="[k, l] in [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']]" :key="k" :class="{ on: board.period === k }" :disabled="!canEdit" @click="setPeriod(k)">{{ l }}</button></div>
        <button v-if="canEdit" class="btn secondary" @click="openEdit">Edit board</button><button v-if="canEdit" class="btn" @click="sh.open = true">{{ board.share_enabled ? (board.share_access === 'invited' ? 'Shared with invited · ' : 'Shared · ') + board.views + ' views' : 'Share' }}</button></div></div>
      <BoardView :data="board.data" :metrics="data.metrics" :editable="canEdit" @type="setType" />
      <div v-if="board.forecast" class="bf"><div class="bfh"><h2>Forecast · {{ board.forecast.name }}<span v-if="board.forecast.group" class="mut gfn"> · every company's main forecast, in {{ board.forecast.pack?.currency }}</span></h2><NuxtLink :to="board.forecast.id ? '/forecast?f=' + board.forecast.id : '/forecast?cust=group'" class="lk2">Open forecast</NuxtLink></div><ForecastSummary :assumptions="board.forecast.assumptions" :pack="board.forecast.pack" :compact="!board.sections?.forecast" /></div>
      <p v-else-if="canEdit && data.forecasts.length" class="mut addf">Add a forecast under Edit board.</p>
      <ClientOnly><BoardStatements v-if="board.sections?.statements" :key="data.subject + board.data.currency" :subject="data.subject" :currency="board.data.currency" /></ClientOnly>
      <div v-if="board.reports.length" class="bf"><h2>Reports</h2><div class="card pad0"><ul class="rl"><li v-for="r in board.reports" :key="r.id"><button type="button" class="rlb" @click="openReport(r.id)"><FileBadge :mime="r.mime_type" size="sm" /><span class="rlt">{{ r.title }}</span><span class="mut">{{ r.mime_type === 'application/pdf' ? 'PDF' : 'Excel' }} · {{ kb(r.size_bytes) }} · {{ new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }}</span><span class="rlo">Open</span></button></li></ul></div></div>
    </template>
    <p v-if="msg" class="error">{{ msg }}</p>
    <AppModal :open="ed.open" title="Edit board" wide @close="ed.open = false">
      <div class="ef"><label class="label">Name<input v-model="ed.name" maxlength="80"></label><label class="label">Description<input v-model="ed.note" maxlength="1000"></label>
        <div><b class="lb">Headline figures</b><div class="mchips"><button v-for="(m, k) in data.metrics" :key="k" type="button" :class="{ on: ed.kpis.includes(k) }" @click="toggleKpi(k)">{{ m.label }}</button></div></div>
        <div><b class="lb">Charts</b><div v-for="(c, i) in ed.charts" :key="i" class="crow"><div class="crh"><input v-model="c.title" maxlength="80" placeholder="Chart title"><select v-model="c.type" aria-label="Chart type"><option :value="undefined">Line</option><option value="bar">Bar</option><option value="area">Area</option><option value="pie">Pie</option><option value="table">Table</option></select></div><div class="mchips sm"><button v-for="(m, k) in data.metrics" :key="k" type="button" :class="{ on: c.metrics.includes(k) }" @click="c.metrics = c.metrics.includes(k) ? c.metrics.filter((x) => x !== k) : c.metrics.length < 3 ? [...c.metrics, k] : c.metrics">{{ m.label }}</button></div><button type="button" class="lk" @click="ed.charts.splice(i, 1)">Remove</button></div>
          <button type="button" class="btn secondary sm" @click="ed.charts.push({ title: 'New chart', metrics: ['revenue'] })">+ Add a chart</button><label v-if="data.forecasts.length" class="label fsel">Forecast on this board<select v-model="ed.forecast_id"><option value="">None</option><option v-for="f in data.forecasts" :key="f.id" :value="f.id">{{ f.name }}</option></select></label><p class="hint">Up to three figures per chart. With the group chosen at the top, the board shows the group forecast (every company's main forecast). NTM revenue growth always uses the forecast, shown here or not.</p>
        <div class="sx"><b class="lb">Sections</b>
          <label class="ck"><input v-model="ed.showForecast" type="checkbox"> Forecast: the chart and the full monthly breakdown (the group forecast when the group is chosen)</label>
          <label class="ck"><input v-model="ed.showStatements" type="checkbox"> Financial statements: each company, eliminations and the group for a month, profit and loss by month, and the balance sheet</label></div>
        <div class="sx"><b class="lb">Reports on this board</b>
          <ul v-if="ed.docs.length" class="rf"><li v-for="(id, i) in ed.docs" :key="id"><FileBadge :name="docTitle(id) + (docInfo(id)?.mime_type === 'application/pdf' ? '.pdf' : '.xlsx')" size="sm" /><span class="rft"><b>{{ docTitle(id) }}</b><em>{{ docInfo(id)?.mime_type === 'application/pdf' ? 'PDF' : 'Excel' }}{{ docInfo(id)?.size_bytes ? ' · ' + kb(Number(docInfo(id)!.size_bytes)) : '' }}</em></span><button type="button" class="rfx" :aria-label="'Remove ' + docTitle(id)" @click="ed.docs.splice(i, 1)">Remove</button></li></ul>
          <DropZone accept=".pdf,.xlsx" no-tip :disabled="upl.busy" :label="upl.busy ? 'Uploading…' : 'Drag and drop a PDF or Excel report here'" hint="or click to choose · up to 25 MB" @change="uploadReport" />
          <label class="rp"><span>Or add one from Documents</span><select v-model="docPick" :disabled="!docs.filter((x) => !ed.docs.includes(x.id)).length"><option value="">{{ docs.filter((x) => !ed.docs.includes(x.id)).length ? 'Choose a document…' : 'No other PDF or Excel documents' }}</option><option v-for="d in docs.filter((x) => !ed.docs.includes(x.id))" :key="d.id" :value="d.id">{{ d.title }}</option></select></label>
          <p v-if="upl.msg" class="hint">{{ upl.msg }}</p>
          <p class="hint">A management report saved to the data room is in Documents. Anyone who can see this board, including on its shared link, can open its reports.</p></div></div></div>
      <template #foot><DeleteButton v-if="board?.audience === 'custom'" type="board" :id="board.id" :name="board.name" @deleted="ed.open = false; sel = ''; refresh()" /><button class="btn secondary" @click="ed.open = false">Cancel</button><button class="btn" @click="saveEdit">Save</button></template>
    </AppModal>
    <AppModal :open="sh.open" :title="'Share ' + (board?.name ?? '') + ' board'" @close="sh.open = false">
      <div v-if="board" class="ef"><p class="mut">Read-only, and it stays up to date. The link shows the whole board: figures, charts, the forecast, statements and reports.</p>
        <template v-if="board.share_enabled && board.share_url"><div class="lnk"><code>{{ board.share_url }}</code><button class="btn secondary sm" @click="copy">{{ sh.copied ? 'Copied' : 'Copy' }}</button></div>
          <p class="mut">{{ board.views }} view{{ board.views === 1 ? '' : 's' }}{{ board.last_viewed_at ? ', last ' + new Date(board.last_viewed_at).toLocaleString('en-GB') : '' }}{{ board.share_expires ? ' · expires ' + new Date(board.share_expires).toLocaleDateString('en-GB') : '' }}</p>
          <div class="acc"><b class="lb">Who can open it</b>
            <label class="opt" :class="{ on: sh.mode === 'public' }"><input v-model="sh.mode" type="radio" value="public"><span><b>Anyone with the link</b><em>No sign-in. Share it carefully.</em></span></label>
            <label class="opt" :class="{ on: sh.mode === 'invited' }"><input v-model="sh.mode" type="radio" value="invited"><span><b>Only people you invite</b><em>They confirm their email with a one-time code and stay signed in for 30 days on that device. Your team always gets in.</em></span></label>
            <template v-if="sh.mode === 'invited'">
              <div class="adde"><input v-model="sh.add" placeholder="name@fund.com, or @fund.com for the whole firm" @keydown.enter.prevent="addEmails"><button type="button" class="btn secondary sm" @click="addEmails">Add</button></div>
              <ul v-if="sh.emails.length" class="inv"><li v-for="e in sh.emails" :key="e"><span class="who"><b>{{ e.startsWith('@') ? 'Everyone at ' + e.slice(1) : e }}</b><em>{{ seenOf(e) ? 'Opened ' + seenOf(e)!.views + (seenOf(e)!.views === 1 ? ' time' : ' times') + ' · last ' + new Date(seenOf(e)!.last_viewed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : e.startsWith('@') ? 'Anyone with an email at this firm' : 'Not opened yet' }}</em></span><button type="button" class="lk" @click="sh.emails = sh.emails.filter((x) => x !== e)">Remove</button></li></ul>
              <p v-else class="hint">Add the emails that can open this board.</p>
              <label class="ck"><input v-model="sh.notify" type="checkbox"> Email newly added people the link</label></template>
            <div class="row"><button class="btn" :disabled="sh.busy" @click="saveAccess">{{ sh.busy ? 'Saving…' : 'Save access' }}</button><span v-if="sh.ok" class="okm">{{ sh.ok }}</span></div></div>
          <div class="row"><button class="btn secondary" @click="share(false)">Turn off link</button><button class="lk" @click="share(true, true)">Make a new link (old one stops working)</button></div></template>
        <template v-else><label class="label">Link expires<select v-model.number="sh.expires"><option :value="0">Never</option><option :value="7">In 7 days</option><option :value="30">In 30 days</option><option :value="90">In 90 days</option></select></label><button class="btn" @click="share(true)">Create link</button></template></div>
    </AppModal>
  </section>
</template>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .head h1 { margin: 0; } .head a { text-decoration: none; } .lead { color: var(--c-muted); margin: 4px 0 0; }
.bt { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; margin: 16px 0 12px; width: fit-content; max-width: 100%; overflow-x: auto; } .bt button { background: none; border: 0; padding: 8px 16px; font: inherit; font-size: 14px; cursor: pointer; color: var(--c-ink-soft); white-space: nowrap; } .bt button.on { background: #fff; color: var(--c-ink); font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); } .bt i { font-style: normal; color: var(--c-ok); font-size: 9px; margin-left: 6px; vertical-align: middle; } .bt .add { color: var(--c-blue-deep); }
.bh { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; } .mut { color: var(--c-muted); font-size: 13.5px; margin: 0; } .tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { background: #fff; border: 0; padding: 7px 12px; font: inherit; font-size: 13px; cursor: pointer; } .seg button.on { background: var(--c-navy); color: #fff; }
.ef { display: flex; flex-direction: column; gap: 14px; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } input, select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .lb { font-size: 13px; display: block; margin-bottom: 6px; }
.mchips { display: flex; flex-wrap: wrap; gap: 6px; } .mchips button { background: #fff; border: 1px solid var(--c-rule); padding: 5px 10px; font: inherit; font-size: 12.5px; cursor: pointer; } .mchips button.on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); } .mchips.sm button { font-size: 12px; padding: 3px 8px; }
.crow { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--c-rule); padding: 10px; margin-bottom: 8px; } .lk { background: none; border: 0; color: var(--c-danger); font: inherit; font-size: 12.5px; cursor: pointer; align-self: flex-start; } .btn.sm { height: 30px; padding: 0 10px; font-size: 12.5px; } .hint { font-size: 12px; color: var(--c-muted); margin: 4px 0 0; }
.lnk { display: flex; gap: 8px; align-items: center; background: var(--c-signal-soft); padding: 10px; } .lnk code { flex: 1; font-size: 12.5px; word-break: break-all; } .row { display: flex; gap: 12px; align-items: center; } .error { color: var(--c-danger); }
.crh { display: flex; gap: 8px; } .crh input { flex: 1; }
.gfn { font-size: 13px; font-weight: 400; } .sx { display: flex; flex-direction: column; gap: 8px; } .ck { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; cursor: pointer; } .ck input { margin-top: 3px; }
.rl { list-style: none; margin: 0; padding: 0; } .rl li { border-bottom: 1px solid var(--c-rule); } .rl li:last-child { border-bottom: 0; }
.rlb { display: flex; width: 100%; gap: 12px; align-items: center; padding: 12px 16px; background: #fff; border: 0; font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; color: var(--c-ink); }
.rlb:hover { background: var(--c-paper-2); } .rlt { flex: 1; min-width: 0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .rlo { font-size: 13px; color: var(--c-blue-deep); }
.rlb:hover .rlo { text-decoration: underline; }
.rf { list-style: none; margin: 0; padding: 0; border: 1px solid var(--c-rule); } .rf li { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); background: #fff; } .rf li:last-child { border-bottom: 0; }
.rft { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; } .rft b { font-weight: 500; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .rft em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.rfx { background: none; border: 0; font: inherit; font-size: 12.5px; color: var(--c-danger); cursor: pointer; padding: 4px 0; }
.rp { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--c-ink-soft); } .rp select { flex: 1; min-width: 220px; } .pad0 { padding: 0; }
.acc { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--c-rule); padding-top: 14px; } .opt { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--c-rule); padding: 10px 12px; cursor: pointer; } .opt.on { border-color: var(--c-navy); background: var(--c-signal-soft); } .opt input { margin-top: 3px; }
.opt span { display: flex; flex-direction: column; gap: 2px; font-size: 13.5px; } .opt b { font-weight: 600; } .opt em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.adde { display: flex; gap: 8px; } .adde input { flex: 1; } .inv { list-style: none; margin: 0; padding: 0; border: 1px solid var(--c-rule); max-height: 220px; overflow-y: auto; } .inv li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--c-rule); } .inv li:last-child { border-bottom: 0; }
.who { display: flex; flex-direction: column; gap: 1px; font-size: 13px; min-width: 0; } .who b { font-weight: 500; word-break: break-all; } .who em { font-style: normal; font-size: 12px; color: var(--c-muted); } .inv .lk { align-self: center; } .okm { font-size: 13px; color: var(--c-ok); }
.bf { margin-top: 22px; display: flex; flex-direction: column; gap: 12px; } .bfh { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; } .bfh h2 { margin: 0; font-size: 18px; } .lk2 { font-size: 13px; color: var(--c-blue-deep); text-decoration: none; } .addf { margin-top: 14px; } .fsel { margin-top: 14px; }
</style>
