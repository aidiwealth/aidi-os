<script setup lang="ts">
// Invisible Cloudflare Turnstile. Shows a quiet status line while it checks; the parent fades its form until ready.
const token = defineModel<string>({ default: '' })
const ready = defineModel<boolean>('ready', { default: false })
const key = (useRuntimeConfig().public as Record<string, string>).turnstileSiteKey
const state = ref<'off' | 'checking' | 'ok' | 'error'>(key ? 'checking' : 'off')
const el = ref<HTMLElement | null>(null); let wid: string | null = null; let waiters: ((t: string) => void)[] = []
const show = ref(true)
declare global { interface Window { turnstile?: { render: (e: HTMLElement, o: Record<string, unknown>) => string; reset: (id: string) => void }; __tsLoad?: Promise<void> } }
function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!window.__tsLoad) window.__tsLoad = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error('turnstile')); document.head.appendChild(s) })
  return window.__tsLoad
}
function done(t: string) { token.value = t; ready.value = true; state.value = 'ok'; waiters.forEach((f) => f(t)); waiters = []; setTimeout(() => (show.value = false), 2200) }
onMounted(async () => {
  if (!key) { ready.value = true; return }
  try {
    await load()
    wid = window.turnstile!.render(el.value!, { sitekey: key, appearance: 'interaction-only', callback: done, 'expired-callback': () => { token.value = ''; ready.value = false; state.value = 'checking'; show.value = true }, 'error-callback': () => { state.value = 'error'; show.value = true; ready.value = false } })
  } catch { state.value = 'error' }
})
// A new token for each submit (tokens are single-use).
async function fresh(): Promise<string> {
  if (!key) return ''
  if (token.value) { const t = token.value; token.value = ''; ready.value = false; if (wid && window.turnstile) window.turnstile.reset(wid); return t }
  return new Promise((r) => waiters.push(r))
}
defineExpose({ fresh })
</script>
<template>
  <div v-if="state !== 'off'" class="hc">
    <div ref="el" class="w" />
    <transition name="f"><p v-if="show" class="st" :class="state" role="status"><i />{{ state === 'ok' ? 'Verified as human · protected by Cloudflare Turnstile' : state === 'error' ? 'We could not run the human check. Refresh the page and try again.' : 'Checking you are human…' }}</p></transition>
  </div>
</template>
<style scoped>
.hc { margin-top: 14px; } .w:empty { display: none; }
.st { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 12.5px; color: var(--c-muted); }
.st i { width: 7px; height: 7px; background: #5fa8d3; flex: none; } .st.checking i { animation: p 1.1s ease-in-out infinite; } .st.ok i { background: #1f7a4d; } .st.ok { color: #1f7a4d; } .st.error i { background: var(--c-danger); } .st.error { color: var(--c-danger); }
@keyframes p { 50% { opacity: .25 } } .f-leave-active { transition: opacity .6s; } .f-leave-to { opacity: 0; }
</style>
