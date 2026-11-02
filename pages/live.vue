<script setup lang="ts">
import type { LbData, LbLayout } from '~/components/LiveBoard.vue'
// Live board: the group's key numbers on one screen. Present on TV fills the screen (Esc to leave) and keeps it awake;
// Edit layout drags numbers and panels into order and hides or shows each; Screen link makes a view-only link for the
// office TV. Refreshes every 30 seconds.
useHead({ title: 'Live board' })
const { data, refresh } = await useFetch<{ data: LbData; layout: LbLayout; numbers: Record<string, string>; panels: Record<string, string>; screen: { on: boolean; created_at: string | null; seen_at: string | null } }>('/api/live-board', { key: 'live-board' })
const { data: me } = useNuxtData<{ org?: { name?: string } }>('me')
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { if (!document.hidden) void refresh() }, 30_000); document.addEventListener('fullscreenchange', onFs) })
onBeforeUnmount(() => { if (timer) clearInterval(timer); document.removeEventListener('fullscreenchange', onFs); void release() })
// Layout editing.
const editing = ref(false); const draft = ref<LbLayout | null>(null); const busy = ref(false); const msg = ref('')
const layout = computed(() => (editing.value && draft.value ? draft.value : data.value!.layout))
const startEdit = () => { draft.value = JSON.parse(JSON.stringify(data.value!.layout)); editing.value = true }
async function saveLayout() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ layout: LbLayout }>('/api/live-board', { method: 'POST', body: { action: 'layout', layout: draft.value } }); data.value!.layout = r.layout; editing.value = false }
  catch (e) { msg.value = taskErr(e) } finally { busy.value = false }
}
// Present on TV: full screen, menu hidden, screen kept awake.
const tv = ref(false); let lock: { release: () => Promise<void> } | null = null
async function present() { editing.value = false; tv.value = true; try { await document.documentElement.requestFullscreen() } catch { /* the board still fills the window */ } try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request('screen') ?? null } catch { lock = null } }
async function release() { try { await lock?.release() } catch { /* already gone */ } lock = null }
function onFs() { if (!document.fullscreenElement) { tv.value = false; void release() } }
async function leave() { tv.value = false; void release(); if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}) }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && tv.value) void leave() }
onMounted(() => window.addEventListener('keydown', onKey)); onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
// Screen link for the TV.
const scr = ref(false); const link = ref(''); const copied = ref(false)
async function newLink() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ url: string }>('/api/live-board', { method: 'POST', body: { action: 'screen' } }); link.value = r.url; await refresh() } catch (e) { msg.value = taskErr(e) } finally { busy.value = false } }
async function linkOff() { busy.value = true; try { await $fetch('/api/live-board', { method: 'POST', body: { action: 'screen_off' } }); link.value = ''; await refresh() } catch (e) { msg.value = taskErr(e) } finally { busy.value = false } }
async function copy() { try { await navigator.clipboard.writeText(link.value); copied.value = true; setTimeout(() => { copied.value = false }, 1500) } catch { /* select by hand */ } }
const when = (iso: string | null) => (iso ? fmtStamp(iso) : '—')
</script>
<template>
  <section v-if="data" class="lv">
    <div class="hd"><div><h1>Live board</h1><p class="mut">The whole group at a glance. It moves as prices change and money comes in or goes out.</p></div>
      <div class="ac"><template v-if="editing"><button type="button" class="btn secondary" @click="editing = false">Cancel</button><button type="button" class="btn" :disabled="busy" @click="saveLayout">{{ busy ? 'Saving…' : 'Save layout' }}</button></template>
        <template v-else><button type="button" class="btn secondary" @click="startEdit">Edit layout</button><button type="button" class="btn secondary" @click="scr = true; link = ''">Screen link</button><button type="button" class="btn" @click="present">⛶ Present on TV</button></template></div></div>
    <p v-if="editing" class="hint">Drag a number or a panel to move it. “Hide” takes it off the board (and the TV); hidden ones stay here, faded, so you can bring them back.</p>
    <p v-if="msg" class="error">{{ msg }}</p>
    <LiveBoard :data="data.data" :layout="layout" :editing="editing" :tv="tv" :name="me?.org?.name" :numbers="data.numbers" :panels="data.panels" @update:layout="draft = $event" />
    <button v-if="tv" type="button" class="exit" @click="leave">Exit full screen</button>
    <AppModal :open="scr" title="Screen link for the office TV" @close="scr = false">
      <div class="sl"><p class="mut">A view-only link that opens straight to this board, with no sign-in. It shows the board and nothing else. Turn it off any time, or make a new one (the old one stops working).</p>
        <div v-if="link" class="ln"><input :value="link" readonly aria-label="Screen link" @focus="($event.target as HTMLInputElement).select()"><button type="button" class="btn" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button></div>
        <p v-if="link" class="warn">Copy it now: for safety it is shown only once. Open it in the TV's browser and press “Full screen”.</p>
        <div v-else-if="data.screen.on" class="st"><span><b>On</b> since {{ when(data.screen.created_at) }}</span><span class="mut">Last opened {{ when(data.screen.seen_at) }}</span></div>
        <div v-else class="st"><span class="mut">No screen link yet.</span></div></div>
      <template #foot><button v-if="data.screen.on" type="button" class="btn secondary" :disabled="busy" @click="linkOff">Turn off</button><button type="button" class="btn" :disabled="busy" @click="newLink">{{ data.screen.on ? 'Make a new link' : 'Make the link' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.lv { display: flex; flex-direction: column; gap: 14px; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 0 0 4px; } .hd p { margin: 0; font-size: 14px; } .ac { display: flex; gap: 8px; flex-wrap: wrap; }
.mut { color: var(--c-muted); } .hint { margin: 0; font-size: 13.5px; color: var(--c-ink-soft); background: var(--c-paper-2); padding: 10px 14px; } .error { color: var(--c-danger); margin: 0; font-size: 13px; }
.exit { position: fixed; top: 14px; right: 14px; z-index: 2001; font: inherit; font-size: 13px; padding: 7px 12px; background: rgba(255, 255, 255, .9); border: 1px solid var(--c-rule-strong); cursor: pointer; opacity: 0; transition: opacity .2s; } .exit:hover, .exit:focus { opacity: 1; }
.sl { display: flex; flex-direction: column; gap: 12px; } .sl p { margin: 0; font-size: 14px; line-height: 1.55; } .ln { display: flex; gap: 8px; } .ln input { flex: 1; font: inherit; font-size: 13px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); }
.warn { color: var(--c-ink-soft); font-size: 13px !important; } .st { display: flex; flex-direction: column; gap: 3px; font-size: 14px; }
</style>
