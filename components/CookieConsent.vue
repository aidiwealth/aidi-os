<script setup lang="ts">
// Cookie notice for Finvry: all cookies on by default; visitors can accept or adjust. Choice kept for a year.
const KEY = 'fv_consent'
const show = ref(false), open = ref(false)
const c = reactive({ essential: true, preferences: true, analytics: true })
onMounted(() => { try { const v = localStorage.getItem(KEY) || document.cookie.match(/(?:^|; )fv_consent=([^;]+)/)?.[1]; if (v) Object.assign(c, JSON.parse(decodeURIComponent(v))); else setTimeout(() => (show.value = true), 900) } catch { show.value = true } })
function save(all = false) { if (all) Object.assign(c, { preferences: true, analytics: true }); const v = JSON.stringify({ ...c, essential: true, at: new Date().toISOString() }); try { localStorage.setItem(KEY, v) } catch { /* ignore */ } document.cookie = 'fv_consent=' + encodeURIComponent(v) + '; Max-Age=31536000; Path=/; SameSite=Lax; Secure'; show.value = false; open.value = false }
</script>
<template>
  <transition name="cc"><div v-if="show" class="cc" role="dialog" aria-label="Cookie settings">
    <p><b>We use cookies</b> to keep you signed in, remember your preferences and understand how Finvry is used. <a href="/legal/privacy" target="_blank">Privacy policy</a></p>
    <div v-if="open" class="opts">
      <label><span><b>Essential</b><em>Sign-in, security and core features. Always on.</em></span><input type="checkbox" checked disabled></label>
      <label><span><b>Preferences</b><em>Remember settings such as your workspace and layout.</em></span><input v-model="c.preferences" type="checkbox"></label>
      <label><span><b>Analytics</b><em>Help us understand how Finvry is used, so we can improve it.</em></span><input v-model="c.analytics" type="checkbox"></label>
    </div>
    <div class="act"><button type="button" class="ln" @click="open ? save() : (open = true)">{{ open ? 'Save choices' : 'Cookie settings' }}</button><button type="button" class="ok" @click="save(true)">Accept all</button></div>
  </div></transition>
</template>
<style scoped>
.cc { position: fixed; left: 20px; bottom: 20px; z-index: 90; width: min(420px, calc(100vw - 40px)); background: #fff; border: 1px solid var(--c-rule); box-shadow: 0 18px 48px rgba(12,26,46,.16); padding: 16px 18px; font-size: 13.5px; color: var(--c-ink-soft); }
.cc p { margin: 0 0 12px; line-height: 1.5; } .cc a { color: var(--c-blue-deep); }
.opts { display: flex; flex-direction: column; gap: 2px; margin: 0 0 12px; border-top: 1px solid var(--c-rule); } .opts label { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--c-rule); cursor: pointer; }
.opts span { display: flex; flex-direction: column; } .opts b { color: var(--c-ink); font-weight: 600; } .opts em { font-style: normal; font-size: 12px; color: var(--c-muted); } .opts input { width: 16px; height: 16px; accent-color: #0c1a2e; }
.act { display: flex; justify-content: flex-end; gap: 8px; } .ln { background: none; border: 1px solid var(--c-rule-strong); padding: 8px 14px; font: inherit; font-size: 13px; cursor: pointer; } .ok { background: #0c1a2e; color: #fff; border: 0; padding: 8px 16px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.cc-enter-active, .cc-leave-active { transition: opacity .3s, transform .3s; } .cc-enter-from, .cc-leave-to { opacity: 0; transform: translateY(10px); }
@media print { .cc { display: none; } }
</style>
