<script setup lang="ts">
import { isNigeria } from '~/shared/countries'
// Finvry sign-up: you, your company and country, a plan (naira for Nigeria, dollars elsewhere), then the emailed code.
definePageMeta({ layout: false })
useHead({ title: 'Create your Finvry account' })
const brand = useBrand()
interface Plan { code: string; name: string; description: string; seat_limit: number | null; usd: number | null; ngn: number | null }
const { data } = await useFetch<{ plans: Plan[] }>('/api/public/signup')
const step = ref(1)
const f = reactive({ website: '', name: '', email: '', company: '', country: 'United States', entity_type: '', state: 'Delaware', plan: 'company_free', code: '' })
const TYPES: Record<string, string> = { us_llc: 'LLC (United States)', us_corp: 'C-Corp / Inc (United States)', ng_ltd: 'Limited company (Nigeria)', other: 'Other / not formed yet' }
const STEPS = [{ t: 'About you', d: 'Your name and work email' }, { t: 'Your company', d: 'Name, country and type' }, { t: 'Choose a plan', d: 'Start free, upgrade any time' }, { t: 'Verify your email', d: 'Enter the 6-digit code' }]
const FEATS: Record<string, string[]> = { company_free: ['Financials and boards', 'Decks with analytics', 'Investor page and data room'], company_startup: ['Everything in Free', 'Investor updates and contacts', 'Fundraising pipeline'], company_scale: ['Everything in Startup', 'More seats, storage and AI', 'Priority support'] }
const ngn = computed(() => isNigeria(f.country))
const amount = (p: Plan) => { const v = ngn.value ? p.ngn : p.usd; return v === null ? 'Contact us' : v === 0 ? (ngn.value ? '₦0' : '$0') : (ngn.value ? '₦' : '$') + v.toLocaleString('en-US') }
const msg = ref(''); const busy = ref(false)
const hc = ref<{ fresh: () => Promise<string> } | null>(null), human = ref(''), humanReady = ref(false)
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Please try again.' }
function next() { msg.value = ''; if (step.value === 1 && (!f.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))) { msg.value = 'Add your name and a valid email.'; return } if (step.value === 2 && !f.company.trim()) { msg.value = 'Add your company name.'; return } step.value++ }
watch(() => f.country, (c) => { if (!isNigeria(c) && f.entity_type === 'ng_ltd') f.entity_type = '' })
async function create() { busy.value = true; msg.value = ''; try { const tt = await hc.value?.fresh(); await $fetch<{ emailed: boolean }>('/api/public/signup', { method: 'POST', body: { turnstile_token: tt || undefined, website: f.website, name: f.name, email: f.email, company: f.company, country: f.country, entity_type: f.entity_type || undefined, state: f.entity_type === 'us_llc' || f.entity_type === 'us_corp' ? f.state : undefined, plan: f.plan } }); step.value = 4; startCooldown(); await nextTick(); boxes.value[0]?.focus() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
// six code boxes: type, paste, backspace
const digits = ref<string[]>(['', '', '', '', '', '']); const boxes = ref<HTMLInputElement[]>([])
function onDigit(i: number, e: Event) { const v = (e.target as HTMLInputElement).value.replace(/\D/g, ''); if (v.length > 1) { fill(v); return } digits.value[i] = v; if (v && i < 5) boxes.value[i + 1]?.focus(); sync() }
function onKey(i: number, e: KeyboardEvent) { if (e.key === 'Backspace' && !digits.value[i] && i > 0) boxes.value[i - 1]?.focus() }
function fill(v: string) { const s = v.replace(/\D/g, '').slice(0, 6).split(''); digits.value = [...s, ...Array(6 - s.length).fill('')]; boxes.value[Math.min(s.length, 5)]?.focus(); sync() }
function onPaste(e: ClipboardEvent) { e.preventDefault(); fill(e.clipboardData?.getData('text') ?? '') }
function sync() { f.code = digits.value.join(''); if (f.code.length === 6 && !busy.value) verify() }
async function verify() { busy.value = true; msg.value = ''; try { await $fetch('/api/auth/verify-otp', { method: 'POST', body: { email: f.email, code: f.code } }); await navigateTo('/') } catch (e) { msg.value = err(e); digits.value = ['', '', '', '', '', '']; f.code = ''; boxes.value[0]?.focus() } finally { busy.value = false } }
const cool = ref(0); let t: ReturnType<typeof setInterval> | null = null
function startCooldown() { cool.value = 30; if (t) clearInterval(t); t = setInterval(() => { cool.value--; if (cool.value <= 0 && t) clearInterval(t) }, 1000) }
async function resend() { msg.value = ''; try { const tt = await hc.value?.fresh(); await $fetch('/api/auth/request', { method: 'POST', body: { email: f.email, turnstile_token: tt || undefined } }); startCooldown() } catch (e) { msg.value = err(e) } }
onBeforeUnmount(() => { if (t) clearInterval(t) })
const pct = computed(() => Math.round(((step.value - 1) / 3) * 100))
</script>

<template>
  <div class="su">
    <aside class="side">
      <a class="mk" href="https://finvry.com"><BrandMark light /></a>
      <div class="pitch"><h2>The OS for every founder.</h2><p>Investor metrics, fundraising, requirements and engagement in one place. Set up in minutes.</p></div>
      <ol class="rail"><li v-for="(s, i) in STEPS" :key="s.t" :class="{ on: step === i + 1, done: step > i + 1 }"><span class="n">{{ step > i + 1 ? '✓' : i + 1 }}</span><span><b>{{ s.t }}</b><em>{{ s.d }}</em></span></li></ol>
      <ul class="trust"><li>Free plan, no card needed</li><li>Bring figures from QuickBooks or Google Sheets</li><li>Your data stays yours; export any time</li></ul>
      <p class="legal"><a href="/legal/terms">Terms</a> · <a href="/legal/privacy">Privacy</a> · <a href="https://finvry.com">finvry.com</a></p>
    </aside>
    <main class="pane">
      <div v-if="brand.key !== 'finvry'" class="form"><h1>Create an account</h1><p class="hint">Sign-up is on Finvry. <a href="https://app.finvry.com/start">Go to app.finvry.com/start →</a></p></div>
      <div v-else class="form">
        <div class="prog"><span>Step {{ step }} of 4</span><i><b :style="{ width: Math.max(6, pct) + '%' }" /></i></div>
        <form v-if="step === 1" :class="{ gate: !humanReady }" @submit.prevent="next"><h1>Create your account</h1><p class="hint">Start free. No card needed.</p>
          <label class="fl">Your full name<input v-model="f.name" required maxlength="120" autocomplete="name" placeholder="Ada Okafor" autofocus></label>
          <label class="fl">Work email<input v-model="f.email" type="email" required maxlength="254" autocomplete="email" placeholder="ada@yourcompany.com"></label>
          <button class="go" type="submit">Continue</button></form>
        <form v-else-if="step === 2" @submit.prevent="next"><h1>About your company</h1><p class="hint">We use this to set your currency and filing reminders.</p>
          <label class="fl">Company name<input v-model="f.company" required maxlength="200" autocomplete="organization" placeholder="Acme Technologies"></label>
          <label class="fl">Country<CountrySelect v-model="f.country" required /></label>
          <label class="fl">Company type <small>optional</small><select v-model="f.entity_type"><option value="">Choose</option><option v-for="(l, k) in TYPES" v-show="k !== 'ng_ltd' || ngn" :key="k" :value="k">{{ l }}</option></select></label>
          <label v-if="f.entity_type === 'us_llc' || f.entity_type === 'us_corp'" class="fl">State of formation<select v-model="f.state"><option>Delaware</option><option>Wyoming</option><option>Other US state</option></select></label>
          <p class="note">{{ f.entity_type && f.entity_type !== 'other' ? 'We will add your usual filing deadlines to your compliance calendar, with reminders. ' : '' }}You will be billed in {{ ngn ? 'naira' : 'US dollars' }}.</p>
          <input v-model="f.website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          <button class="go" type="submit">Continue</button><button class="back" type="button" @click="step--">← Back</button></form>
        <form v-else-if="step === 3" @submit.prevent="create"><h1>Choose a plan</h1><p class="hint">Paid plans start with a 14-day free trial. Change plan any time.</p>
          <div class="plans"><label v-for="p in data?.plans ?? []" :key="p.code" class="pc" :class="{ on: f.plan === p.code, pop: p.code === 'company_startup' }"><input v-model="f.plan" type="radio" :value="p.code" class="sr">
            <span class="ph"><b>{{ p.name }}</b><i v-if="p.code === 'company_startup'">Most popular</i></span><span class="pp"><strong>{{ amount(p) }}</strong><em>{{ (ngn ? p.ngn : p.usd) ? '/ month' : p.code === 'company_free' ? 'forever' : '' }}</em></span>
            <ul><li v-for="x in FEATS[p.code] ?? [p.description]" :key="x">{{ x }}</li></ul></label></div>
          <button class="go" type="submit" :disabled="busy">{{ busy ? 'Creating your account…' : 'Create account' }}</button><button class="back" type="button" @click="step--">← Back</button></form>
        <form v-else @submit.prevent="verify"><h1>Check your email</h1><p class="hint">We sent a 6-digit code to <b>{{ f.email }}</b>. It expires in 10 minutes.</p>
          <div class="otp" @paste="onPaste"><input v-for="(d, i) in digits" :key="i" :ref="(el) => { if (el) boxes[i] = el as HTMLInputElement }" :value="d" inputmode="numeric" autocomplete="one-time-code" maxlength="6" :aria-label="'Digit ' + (i + 1)" @input="onDigit(i, $event)" @keydown="onKey(i, $event)"></div>
          <button class="go" type="submit" :disabled="busy || f.code.length !== 6">{{ busy ? 'Checking…' : 'Open Finvry' }}</button>
          <p class="hint sm">Didn't get it? Check spam, or <button type="button" class="lnk" :disabled="cool > 0" @click="resend">{{ cool > 0 ? 'resend in ' + cool + 's' : 'send a new code' }}</button>. <button type="button" class="lnk" @click="step = 1">Use a different email</button></p></form>
        <HumanCheck v-show="step < 4" ref="hc" v-model="human" v-model:ready="humanReady" />
        <p v-if="msg" class="error" role="alert">{{ msg }}</p>
        <p v-if="step < 4" class="foot">Already have an account? <NuxtLink to="/login">Sign in</NuxtLink></p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.su { min-height: var(--vh100, 100vh); display: grid; grid-template-columns: minmax(340px, 44%) 1fr; font-family: var(--font-body); background: #fff; }
.su * { box-sizing: border-box; border-radius: 0; }
.side { background: #0c1a2e; color: rgba(255,255,255,.72); padding: 44px 56px; display: flex; flex-direction: column; gap: 44px; position: relative; overflow: hidden; }
.mk { color: #fff; text-decoration: none; width: fit-content; }
.pitch h2 { font-family: var(--font-heading); color: #fff; font-size: clamp(30px, 3vw, 42px); line-height: 1.05; letter-spacing: -.035em; margin: 0 0 14px; font-weight: 600; } .pitch p { margin: 0; font-size: 16px; max-width: 380px; }
.rail { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; } .rail li { display: flex; gap: 14px; padding: 14px 0; border-top: 1px solid rgba(255,255,255,.1); } .rail li:last-child { border-bottom: 1px solid rgba(255,255,255,.1); }
.rail .n { width: 28px; height: 28px; flex: none; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.25); font-size: 13px; font-weight: 600; color: rgba(255,255,255,.6); }
.rail b { display: block; color: rgba(255,255,255,.75); font-weight: 600; font-size: 15px; } .rail em { display: block; font-style: normal; font-size: 13px; color: rgba(255,255,255,.45); }
.rail li.on .n { background: #5fa8d3; border-color: #5fa8d3; color: #0c1a2e; } .rail li.on b { color: #fff; } .rail li.done .n { background: rgba(255,255,255,.12); border-color: transparent; color: #fff; }
.trust { list-style: none; padding: 0; margin: auto 0 0; display: grid; gap: 10px; font-size: 14px; } .trust li { display: flex; gap: 10px; } .trust li:before { content: ''; width: 8px; height: 8px; background: #5fa8d3; margin-top: 7px; flex: none; }
.legal { margin: 0; font-size: 12.5px; color: rgba(255,255,255,.45); } .legal a { color: inherit; }
.pane { display: flex; align-items: center; justify-content: center; padding: 48px 32px; }
.form { width: 100%; max-width: 460px; }
.prog { display: flex; align-items: center; gap: 14px; margin-bottom: 34px; font-size: 13px; color: var(--c-muted); font-weight: 500; } .prog i { flex: 1; height: 3px; background: #e6e9ee; display: block; } .prog b { display: block; height: 100%; background: #0c1a2e; transition: width .3s; }
h1 { font-family: var(--font-heading); font-size: 32px; letter-spacing: -.03em; line-height: 1.1; margin: 0 0 8px; color: #0c1a2e; font-weight: 600; } .hint { color: var(--c-muted); margin: 0 0 26px; font-size: 15px; } .hint.sm { font-size: 13.5px; margin: 18px 0 0; }
form { display: flex; flex-direction: column; gap: 16px; } .fl { display: flex; flex-direction: column; gap: 7px; font-size: 13.5px; font-weight: 500; color: #3b4658; } .fl small { font-weight: 400; color: var(--c-muted); }
input, select, :deep(select) { font: inherit; font-size: 15.5px; padding: 12px 14px; border: 1px solid #cfd5dd; background: #fff; color: #0c1a2e; width: 100%; } input:focus, select:focus { outline: none; border-color: #0c1a2e; box-shadow: 0 0 0 3px rgba(95,168,211,.25); }
.note { margin: -4px 0 0; font-size: 13px; color: var(--c-muted); }
.go { height: 50px; border: 0; background: #0c1a2e; color: #fff; font: inherit; font-weight: 600; font-size: 15.5px; cursor: pointer; margin-top: 6px; } .go:hover { background: #1c547d; } .go:disabled { opacity: .5; cursor: default; }
.back { background: none; border: 0; color: var(--c-muted); font: inherit; font-size: 14px; cursor: pointer; align-self: flex-start; padding: 0; } .back:hover { color: #0c1a2e; }
.plans { display: grid; gap: 10px; } .pc { position: relative; border: 1px solid #dfe3e9; padding: 16px 18px; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; transition: border-color .15s; }
.pc:hover { border-color: #9aa5b4; } .pc.on { border-color: #0c1a2e; box-shadow: inset 0 0 0 1px #0c1a2e; background: #f7f9fb; } .sr { position: absolute; opacity: 0; width: 1px; height: 1px; }
.ph { display: flex; align-items: center; gap: 10px; } .ph b { font-size: 17px; color: #0c1a2e; font-weight: 600; } .ph i { font-style: normal; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; background: #5fa8d3; color: #0c1a2e; padding: 2px 7px; }
.pp { text-align: right; } .pp strong { font-size: 22px; color: #0c1a2e; letter-spacing: -.02em; font-weight: 600; } .pp em { font-style: normal; font-size: 12.5px; color: var(--c-muted); margin-left: 4px; }
.pc ul { grid-column: 1 / -1; list-style: none; padding: 0; margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: #4b5668; } .pc li:before { content: '✓ '; color: #1c547d; }
.otp { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; } .otp input { text-align: center; font-size: 26px; font-weight: 600; padding: 14px 0; font-family: ui-monospace, Menlo, monospace; }
.lnk { background: none; border: 0; color: #1c547d; font: inherit; cursor: pointer; padding: 0; text-decoration: underline; text-underline-offset: 2px; } .lnk:disabled { color: var(--c-muted); text-decoration: none; cursor: default; }
.error { color: var(--c-danger); margin: 16px 0 0; font-size: 14px; } .foot { margin: 26px 0 0; font-size: 14px; color: var(--c-muted); } .hp { position: absolute; left: -9999px; width: 1px; height: 1px; }
@media (max-width: 900px) { .su { grid-template-columns: 1fr; } .side { padding: 28px 24px; gap: 22px; } .pitch, .trust, .legal, .rail em { display: none; } .rail { flex-direction: row; gap: 8px; } .rail li { border: 0 !important; padding: 0; } .rail b { display: none; } .pane { align-items: flex-start; padding: 32px 20px; } }
.gate { opacity: .45; pointer-events: none; transition: opacity .4s; }
</style>
