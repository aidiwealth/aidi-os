<script setup lang="ts">
// The investor page's email gate: the page's name and line stay readable, the rest sits under a light veil (shapes
// only, no real figures reach the browser) with a short form asking for the visitor's email.
const props = defineProps<{ slug: string; company: string; headline?: string | null; logo?: string | null; cover?: string | null }>()
const emit = defineEmits<{ done: [] }>()
const f = reactive({ name: '', email: '' }), busy = ref(false), msg = ref('')
async function go() {
  msg.value = ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { msg.value = 'Enter a valid email address.'; return }
  busy.value = true
  try { await $fetch('/api/public/c/' + props.slug + '/access', { method: 'POST', body: { email: f.email.trim(), name: f.name.trim() || undefined } }); emit('done') }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.' }
  finally { busy.value = false }
}
const BARS = [52, 58, 80, 84, 82, 86, 85, 100]
</script>
<template>
  <div class="eg">
    <nav class="top"><img v-if="logo" :src="logo" :alt="company" class="tlogo"><b v-else class="tname">{{ company }}</b></nav>
    <header class="hero"><span class="eyebrow">{{ logo ? company + ' · ' : '' }}Investor relations</span><h1>{{ headline || company }}</h1></header>
    <div class="veil-wrap">
      <div class="ghost" aria-hidden="true">
        <div class="g-big"><div v-for="n in 4" :key="n"><i class="w60" /><i class="w80 sm" /></div></div>
        <div class="g-panel"><i class="w30" /><i class="w20 lg" /><div class="g-bars"><span v-for="(h, n) in BARS" :key="n" :class="{ on: n === BARS.length - 1 }" :style="{ height: h + '%' }" /></div></div>
        <div class="g-tiles"><div v-for="n in 4" :key="n"><i class="w50 sm" /><i class="w70" /><i class="w60 sm" /></div></div>
        <div class="g-text"><i class="w40 lg" /><i class="w100" /><i class="w90" /><i class="w95" /><i class="w70" /></div>
      </div>
      <div class="veil" />
      <form class="card" @submit.prevent="go">
        <span class="lock" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8" /></svg></span>
        <h2>View {{ company }}'s investor page</h2>
        <p>Figures, story and updates are shared with investors. Enter your email to open the page.</p>
        <label><span>Your name <em>(optional)</em></span><input v-model="f.name" maxlength="120" autocomplete="name"></label>
        <label>Email<input v-model="f.email" type="email" required maxlength="254" autocomplete="email" placeholder="you@fund.com"></label>
        <p v-if="msg" class="err">{{ msg }}</p>
        <button class="b1" :disabled="busy">{{ busy ? 'Opening…' : 'View the page' }}</button>
        <span class="fine">{{ company }} will see that you viewed the page. You stay signed in on this device.</span>
      </form>
    </div>
  </div>
</template>
<style scoped>
.eg { font-size: 16.5px; color: #14161a; }
.top { display: flex; align-items: center; padding: 12px 0 18px; border-bottom: 1px solid #ecebe7; } .tlogo { height: 32px; width: auto; max-width: 180px; object-fit: contain; object-position: left center; display: block; } .tname { font-size: 20px; color: var(--c-navy); }
.hero { padding: 64px 0 40px; display: flex; flex-direction: column; gap: 18px; } .eyebrow { font-size: 14px; color: var(--c-muted); } .hero h1 { margin: 0; font-size: 32px; line-height: 1.12; letter-spacing: -0.03em; font-weight: 600; color: var(--c-navy); max-width: 680px; }
.veil-wrap { position: relative; min-height: 640px; }
.ghost { display: flex; flex-direction: column; gap: 40px; filter: blur(4px); opacity: .95; user-select: none; pointer-events: none; }
.ghost i { display: block; height: 12px; background: #dfe6ee; margin-bottom: 10px; } .ghost i.sm { height: 9px; background: #e8ecf1; } .ghost i.lg { height: 26px; background: #c9d6e5; }
.w20 { width: 20%; } .w30 { width: 30%; } .w40 { width: 40%; } .w50 { width: 50%; } .w60 { width: 60%; } .w70 { width: 70%; } .w80 { width: 80%; } .w90 { width: 90%; } .w95 { width: 95%; } .w100 { width: 100%; }
.g-big { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 2px solid #c9d6e5; } .g-big > div { padding: 22px 18px 0 0; } .g-big i:first-child { height: 30px; background: #c9d6e5; }
.g-panel { border: 1px solid #ecebe7; padding: 26px; } .g-bars { display: grid; grid-template-columns: repeat(8, 1fr); gap: 14px; align-items: end; height: 170px; margin-top: 26px; border-bottom: 1px solid #d9d6cf; } .g-bars span { background: #dbe4ee; } .g-bars span.on { background: #8fb3d6; }
.g-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; } .g-tiles > div { background: #f6f5f1; padding: 18px; }
.g-text { max-width: 640px; }
.veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255,255,255,.1) 0%, rgba(255,255,255,.45) 50%, rgba(255,255,255,.9) 100%); }
.card { position: absolute; top: 40px; left: 50%; transform: translateX(-50%); width: min(440px, 100%); background: #fff; border: 1px solid #e3e1dc; box-shadow: 0 18px 50px rgba(12, 26, 46, .12); padding: 30px 30px 24px; display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; }
.lock { width: 40px; height: 40px; background: #e6eef6; color: var(--c-navy); display: grid; place-items: center; } .lock svg { width: 20px; height: 20px; }
.card h2 { margin: 4px 0 0; font-size: 21px; line-height: 1.25; color: var(--c-navy); letter-spacing: -0.01em; } .card p { margin: 0; font-size: 14.5px; color: #3b414b; line-height: 1.5; }
.card label { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; color: #3b414b; } .card label em { font-style: normal; color: var(--c-muted); }
.card input { font: inherit; font-size: 15px; padding: 11px 12px; border: 1px solid #d5d2cb; background: #fff; } .card input:focus { outline: 2px solid #8fb3d6; outline-offset: -1px; border-color: #8fb3d6; }
.b1 { margin-top: 4px; background: var(--c-navy); color: #fff; border: 0; padding: 13px 18px; font: inherit; font-weight: 600; font-size: 15px; cursor: pointer; } .b1:disabled { opacity: .6; cursor: default; }
.err { color: #b54708 !important; font-size: 13.5px !important; } .fine { font-size: 12.5px; color: var(--c-muted); line-height: 1.45; }
@media (max-width: 760px) { .hero { padding: 36px 0 28px; } .hero h1 { font-size: 23px; } .g-big, .g-tiles { grid-template-columns: 1fr 1fr; } .card { top: 10px; padding: 24px 20px 20px; } .veil-wrap { min-height: 600px; } }
</style>
