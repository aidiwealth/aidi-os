<script setup lang="ts">
// A shared financial board (read-only).
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
// The viewer's own choice of company (group or one company) and period; the board's settings are the start.
const subject = ref(''), period = ref('')
// Fetched together, not one after another (each wait is a round trip to the server).
const [__p127_0, __p127_1] = await Promise.all([
  useFetch<{ gated?: boolean; statements?: { subject: string; currency: string } | null; reports?: { id: string; title: string; mime_type: string; size_bytes: number; created_at: string }[]; viewer?: string | null; forecast: { name: string; group: boolean; full?: boolean; assumptions: import('~/shared/forecast').Assumptions | null; pack: { currency: string; months: number; base: import('~/shared/forecast').Result; best: import('~/shared/forecast').Result; worst: import('~/shared/forecast').Result } | null } | null; name: string; note: string | null; data?: { labels: string[]; series: Record<string, (number | null)[]>; kpis: { key: string; label: string; unit: string; value: number | null; prev: number | null; change: number | null }[]; charts: { title: string; metrics: string[] }[]; currency: string; period: string }; workspace: { firm: string }; period?: string; entities?: { id: string; name: string }[]; subject?: string | null }>('/api/public/board/' + token, { key: 'pub-board-' + token, query: { subject, period }, watch: [subject, period] }),
  useFetch<{ metrics: Record<string, { label: string; unit: string }> }>('/api/public/board-metrics', { key: 'board-metrics' })])
const { data, error, refresh } = __p127_0
const { data: m } = __p127_1
// Reports on the board open through a short-lived link.
const rmsg = ref('')
async function openReport(id: string) { rmsg.value = ''; try { const r = await $fetch<{ url: string }>('/api/public/board/' + token + '/reports/' + id); window.open(r.url, '_blank', 'noopener') } catch { rmsg.value = 'Could not open the report. Try again.' } }
const kb = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')
// Sections as tabs, so the board is not one long scroll: only the ones this board has. Remembered in the address (#forecast).
type Tab = 'overview' | 'forecast' | 'statements' | 'reports'
const tabs = computed(() => {
  const d = data.value; if (!d || d.gated) return [] as { k: Tab; l: string }[]
  return ([['overview', 'Overview'], ...(d.forecast ? [['forecast', 'Forecast']] : []), ...(d.statements ? [['statements', 'Financial statements']] : []), ...(d.reports?.length ? [['reports', 'Reports · ' + d.reports.length]] : [])] as [Tab, string][]).map(([k, l]) => ({ k, l }))
})
const tab = ref<Tab>('overview')
onMounted(() => { const h = location.hash.slice(1) as Tab; if (['forecast', 'statements', 'reports'].includes(h)) tab.value = h })
watch(tabs, (t) => { if (t.length && !t.some((x) => x.k === tab.value)) tab.value = 'overview' })
function go(k: Tab) { tab.value = k; try { history.replaceState(history.state, '', k === 'overview' ? location.pathname + location.search : '#' + k) } catch { /* ignore */ } }
useHead({ title: () => (data.value ? data.value.workspace.firm + ' · ' + data.value.name : 'Financial board'), meta: [{ name: 'robots', content: 'noindex' }] })
</script>
<template>
  <section class="wrap pb">
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1><p class="muted">Ask the company for a new link.</p></div>
    <div v-else-if="data?.gated" class="gate"><p class="label">{{ data.workspace.firm }} · financial board</p><InviteGate :company="data.workspace.firm" :api="'/api/public/board/' + token + '/'" :label="data.name + ' board'" no-ask @done="refresh()" /></div>
    <template v-else-if="data && data.data"><p class="label">{{ data.workspace.firm }} · financial board</p><h1>{{ data.name }}</h1><p v-if="data.note" class="muted">{{ data.note }}</p>
      <nav v-if="tabs.length > 1" class="tb" role="tablist"><button v-for="t in tabs" :key="t.k" type="button" role="tab" :aria-selected="tab === t.k" :class="{ on: tab === t.k }" @click="go(t.k)">{{ t.l }}</button></nav>
      <div v-if="data.entities?.length || tab === 'overview'" class="ctl"><label v-if="data.entities?.length" class="ent"><span class="sr">Company</span><select :value="data.subject ?? ''" @change="subject = ($event.target as HTMLSelectElement).value"><option v-for="e in data.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
        <span v-if="tab === 'overview'" class="seg" role="group" aria-label="Period"><button v-for="[p, l] in [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']]" :key="p" type="button" :class="{ on: (data.period ?? 'month') === p }" @click="period = p!">{{ l }}</button></span></div>
      <div v-if="tab === 'overview'"><BoardView :data="data.data" :metrics="m?.metrics ?? {}" viewer /></div><div v-if="data.forecast && tab === 'forecast'" class="bf"><h2>Forecast · {{ data.forecast.name }}</h2><ForecastSummary :assumptions="data.forecast.assumptions" :pack="data.forecast.pack" :compact="!data.forecast.full" /></div>
      <ClientOnly><BoardStatements v-if="data.statements && tab === 'statements'" :key="data.statements.subject + data.statements.currency" :subject="data.statements.subject" :currency="data.statements.currency" :src="'/api/public/board/' + token + '/statements'" /></ClientOnly>
      <div v-if="data.reports?.length && tab === 'reports'" class="bf"><h2>Reports</h2><div class="card pad0"><ul class="rl"><li v-for="r in data.reports" :key="r.id"><button type="button" class="rlb" @click="openReport(r.id)"><FileBadge :mime="r.mime_type" size="sm" /><span class="rlt">{{ r.title }}</span><span class="muted">{{ r.mime_type === 'application/pdf' ? 'PDF' : 'Excel' }} · {{ kb(r.size_bytes) }}</span><span class="rlo">Open</span></button></li></ul></div><p v-if="rmsg" class="err">{{ rmsg }}</p></div><p class="foot muted">Figures as reported by {{ data.workspace.firm }}. Updated as new figures are added.<template v-if="data.viewer"> Opened as {{ data.viewer }}.</template></p></template>
  </section>
</template>
<style scoped>
.pb { max-width: 1160px; margin: 0 auto; padding: 32px 20px 60px; } .pb h1 { margin: 2px 0 6px; } .bf { margin-top: 24px; display: flex; flex-direction: column; gap: 12px; } .bf h2 { margin: 0; font-size: 18px; } .muted { color: var(--c-muted); }
.ctl { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 14px 0 16px; } .ent select { font: inherit; font-size: 14px; padding: 8px 32px 8px 12px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 220px; } .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.seg { display: inline-flex; border: 1px solid var(--c-rule-strong); } .seg button { font: inherit; font-size: 13.5px; border: 0; background: #fff; padding: 8px 14px; cursor: pointer; } .seg button.on { background: var(--c-navy); color: #fff; } .foot { font-size: 12.5px; margin-top: 18px; }
.tb { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; margin: 18px 0 4px; width: fit-content; max-width: 100%; overflow-x: auto; position: sticky; top: 0; z-index: 5; }
.tb button { background: none; border: 0; padding: 8px 16px; font: inherit; font-size: 14px; cursor: pointer; color: var(--c-ink-soft); white-space: nowrap; } .tb button.on { background: #fff; color: var(--c-ink); font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); }
.gate { display: flex; flex-direction: column; gap: 14px; padding-top: 24px; } .pad0 { padding: 0; } .err { color: var(--c-danger); font-size: 13px; margin: 0; }
.rl { list-style: none; margin: 0; padding: 0; } .rl li { border-bottom: 1px solid var(--c-rule); } .rl li:last-child { border-bottom: 0; } .rl .muted { font-size: 13px; }
.rlb { display: flex; width: 100%; gap: 12px; align-items: center; padding: 12px 16px; background: #fff; border: 0; font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; color: var(--c-ink); }
.rlb:hover { background: var(--c-paper-2); } .rlt { flex: 1; min-width: 0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .rlo { font-size: 13px; color: var(--c-blue-deep); } .rlb:hover .rlo { text-decoration: underline; }
</style>
