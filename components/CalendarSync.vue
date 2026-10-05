<script setup lang="ts">
// Calendar sync for the pipeline: subscribe to your meetings feed, and find investor meetings in your own calendar.
const props = defineProps<{ pipelineId: string }>()
const emit = defineEmits<{ changed: [] }>()
interface C { feed: string; webcal: string; google: string; source_set: boolean; source_host: string | null; scanned_at: string | null }
const { data, refresh } = await useFetch<C>('/api/crm/calendar', { key: 'crm-calendar' })
const url = ref(''); const msg = ref(''); const ok = ref(''); const busy = ref(''); const copied = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function saveUrl(clear = false) { busy.value = 'save'; msg.value = ''; try { await $fetch('/api/crm/calendar', { method: 'POST', body: { source_url: clear ? '' : url.value } }); url.value = ''; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
interface Mt { uid: string | null; title: string; starts_at: string; ends_at: string; location: string | null; description: string | null; deal_id: string; investor: string; pipeline: string; why: string; added: boolean }
const res = ref<{ scanned: number; matches: Mt[] } | null>(null)
async function scan() { busy.value = 'scan'; msg.value = ''; try { res.value = await $fetch('/api/crm/calendar/scan', { method: 'POST' }); await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function add(m: Mt) { msg.value = ''; try { await $fetch('/api/crm/meetings', { method: 'POST', body: { deal_id: m.deal_id, title: m.title, starts_at: m.starts_at, ends_at: m.ends_at, location: m.location ?? '', notes: m.description ?? '', remind_minutes: 60, source: 'calendar', uid: m.uid ?? undefined } }); m.added = true; emit('changed') } catch (e) { msg.value = err(e) } }
async function addAll() { for (const m of res.value?.matches.filter((x) => !x.added) ?? []) await add(m) }
async function copy() { if (!data.value) return; await navigator.clipboard.writeText(data.value.feed); copied.value = true; setTimeout(() => (copied.value = false), 1500) }
interface Ev { uid: string | null; title: string; starts_at: string; ends_at: string; location: string | null; description: string | null; deal_id: string | null; why: string | null; added: boolean }
const imported = ref<Ev[]>([])
async function importFile(ev: Event) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; msg.value = ''; const fd = new FormData(); fd.append('file', file); try { imported.value = await $fetch<Ev[]>('/api/crm/meetings/import?pipeline=' + props.pipelineId, { method: 'POST', body: fd }) } catch (e) { msg.value = err(e) } }
async function addImported(e: Ev) { if (!e.deal_id) return; await add({ ...e, deal_id: e.deal_id, investor: '', pipeline: '', why: e.why ?? '' }); e.added = true }
const when = (s: string) => new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
void ok
</script>
<template>
  <div v-if="data" class="cs">
    <section class="blk"><h3>Put pipeline meetings in your calendar</h3><p class="mut">Subscribe once and every meeting you add here appears in your calendar automatically, with its reminder.</p>
      <div class="row"><a class="btn sm" :href="data.google" target="_blank" rel="noopener">Add to Google Calendar</a><a class="btn secondary sm" :href="data.webcal">Apple / Outlook</a><button type="button" class="btn secondary sm" @click="copy">{{ copied ? 'Copied' : 'Copy feed link' }}</button></div>
      <p class="tiny">Keep this link private: anyone with it can see your meeting times.</p></section>
    <section class="blk"><h3>Find investor meetings in your calendar</h3>
      <p class="mut">We read your calendar's private iCal address and match events to investors on your pipelines by attendee email, company email domain or name in the title. Nothing is added until you choose.</p>
      <template v-if="!data.source_set"><details class="how"><summary>Where do I find my private iCal address?</summary><ul><li><b>Google Calendar:</b> Settings → your calendar → Integrate calendar → <i>Secret address in iCal format</i>.</li><li><b>iCloud:</b> Calendar app → share the calendar as a Public Calendar → copy the link.</li><li><b>Outlook:</b> Settings → Calendar → Shared calendars → Publish a calendar → ICS link.</li></ul></details>
        <div class="row"><input v-model="url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" aria-label="Calendar address"><button type="button" class="btn sm" :disabled="!url.trim() || busy === 'save'" @click="saveUrl()">Connect</button></div></template>
      <div v-else class="row"><span class="con">Connected: {{ data.source_host }}{{ data.scanned_at ? ' · last checked ' + new Date(data.scanned_at).toLocaleString('en-GB') : '' }}</span><button type="button" class="btn sm" :disabled="busy === 'scan'" @click="scan">{{ busy === 'scan' ? 'Searching…' : 'Find investor meetings' }}</button><button type="button" class="lk" @click="saveUrl(true)">Disconnect</button></div>
      <template v-if="res"><p class="mut">Checked {{ res.scanned }} events from the past 30 days and next 90. {{ res.matches.length ? res.matches.length + ' look like investor meetings:' : 'None matched an investor on your pipelines.' }}</p>
        <button v-if="res.matches.some((m) => !m.added)" type="button" class="btn secondary sm" @click="addAll">Add all</button>
        <div v-for="m in res.matches" :key="(m.uid ?? '') + m.starts_at" class="fd"><span><b>{{ m.title }}</b><em>{{ when(m.starts_at) }} · {{ m.investor }} ({{ m.pipeline }}) · matched by {{ m.why }}</em></span><button v-if="!m.added" type="button" class="btn sm" @click="add(m)">Add</button><span v-else class="okk">On pipeline</span></div></template></section>
    <section class="blk"><h3>Import an invite</h3><DropZone compact accept=".ics" label="Drop an .ics invite" hint="We match it to the right investor" @change="importFile" />
      <div v-for="e in imported" :key="(e.uid ?? '') + e.starts_at" class="fd"><span><b>{{ e.title }}</b><em>{{ when(e.starts_at) }}{{ e.why ? ' · matched by ' + e.why : ' · no investor matched: open the investor and drop it there' }}</em></span><button v-if="e.deal_id && !e.added" type="button" class="btn sm" @click="addImported(e)">Add</button><span v-else-if="e.added" class="okk">Added</span></div></section>
    <p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.cs { display: flex; flex-direction: column; gap: 18px; } .blk { display: flex; flex-direction: column; gap: 8px; } h3 { margin: 0; font-size: 15.5px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .tiny { font-size: 12px; color: var(--c-muted); margin: 0; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .row input { flex: 1; min-width: 240px; font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; text-decoration: none; }
.how summary { font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .how ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; color: var(--c-ink-soft); } .con { font-size: 13px; color: var(--c-ok); flex: 1; } .lk { background: none; border: 0; font: inherit; font-size: 13px; color: var(--c-muted); cursor: pointer; }
.fd { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 12px; background: var(--c-signal-soft); } .fd span { display: flex; flex-direction: column; min-width: 0; } .fd em { font-style: normal; font-size: 12px; color: var(--c-muted); } .okk { color: var(--c-ok); font-size: 13px; } .error { color: var(--c-danger); margin: 0; }
</style>
