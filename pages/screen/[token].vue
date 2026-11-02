<script setup lang="ts">
import type { LbData, LbLayout } from '~/components/LiveBoard.vue'
// The office TV: the live board through a view-only screen link, no sign-in. Refreshes every 30 seconds; "Full screen"
// shows for a few seconds after the mouse moves.
definePageMeta({ layout: false })
useHead({ title: 'Live board', meta: [{ name: 'robots', content: 'noindex' }] })
const route = useRoute()
const { data, refresh, error } = await useFetch<{ data: LbData; layout: LbLayout; name: string }>(() => '/api/public/live/' + route.params.token, { key: 'screen-board' })
const errMsg = computed(() => (error.value as { data?: { data?: { error?: { message?: string } } } } | null)?.data?.data?.error?.message ?? 'It may have been turned off. Ask a GP for a new one.')
const btn = ref(true); let hide: ReturnType<typeof setTimeout> | null = null, timer: ReturnType<typeof setInterval> | null = null
const wake = () => { btn.value = true; if (hide) clearTimeout(hide); hide = setTimeout(() => { btn.value = false }, 4000) }
let lock: { release: () => Promise<void> } | null = null
async function full() { try { await document.documentElement.requestFullscreen() } catch { /* not allowed here */ } try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request('screen') ?? null } catch { lock = null } }
onMounted(() => { wake(); window.addEventListener('mousemove', wake); timer = setInterval(() => { if (!document.hidden) void refresh() }, 30_000) })
onBeforeUnmount(() => { window.removeEventListener('mousemove', wake); if (timer) clearInterval(timer); if (hide) clearTimeout(hide); void lock?.release().catch(() => {}) })
</script>
<template>
  <div class="sc">
    <LiveBoard v-if="data" :data="data.data" :layout="data.layout" :name="data.name" tv />
    <div v-else class="gone"><b>This screen link isn't working</b><span>{{ errMsg }}</span></div>
    <button v-if="data" type="button" class="fs" :class="{ on: btn }" @click="full">⛶ Full screen</button>
  </div>
</template>
<style scoped>
.sc { min-height: 100vh; background: #f6f6f3; }
.gone { min-height: 100vh; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; text-align: center; padding: 24px; } .gone b { font-size: 22px; } .gone span { color: var(--c-muted); }
.fs { position: fixed; bottom: 18px; right: 18px; z-index: 2001; font: inherit; font-size: 14px; padding: 9px 14px; background: var(--c-navy); color: #fff; border: 0; cursor: pointer; opacity: 0; transition: opacity .3s; pointer-events: none; } .fs.on { opacity: 1; pointer-events: auto; }
</style>
