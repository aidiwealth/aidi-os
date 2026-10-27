<script setup lang="ts">
// Public: start with Aidi Wealth. Four quick screens (where you are, what you want help with, roughly how much, then
// name and email), one question each, answered with cards. We then email a link to the onboarding conversation; an
// adviser approves before the dashboard opens. Bot-checked from the first screen.
definePageMeta({ layout: false })
useHead({ title: 'Let\'s begin · Aidi Wealth', meta: [{ name: 'description', content: 'Financial planning and investing with Aidi Wealth. A few taps, then a short conversation that builds your plan.' }] })
const HELP: [string, string, string][] = [['plan', 'A financial plan', 'Where you stand, what to do next'], ['investing', 'Investing', 'US stocks, ETFs and crypto'], ['retirement', 'Retirement', 'On track for when you stop'], ['children', 'Saving for children', 'Education and their future'], ['metals', 'Gold and silver', 'Held in a secure vault'], ['everything', 'Everything', 'The whole picture']]
const AMT: [string, string][] = [['under_50k', 'Under $50k'], ['50k_250k', '$50k – $250k'], ['250k_1m', '$250k – $1M'], ['over_1m', 'Over $1M']]
const f = reactive({ name: '', email: '', country: '', phone: '', help: [] as string[], amount: '', source: '', website_hp: '' })
const step = ref(1), busy = ref(false), done = ref(false), err = ref('')
const hc = ref<{ fresh: () => Promise<string> } | null>(null), human = ref(''), humanReady = ref(false)
const toggle = (k: string) => { f.help = f.help.includes(k) ? f.help.filter((x) => x !== k) : [...f.help, k] }
const canNext = computed(() => (step.value === 1 ? !!f.country : step.value === 2 ? f.help.length > 0 : step.value === 3 ? true : f.name.trim().length > 1 && /.+@.+\..+/.test(f.email)))
async function next() {
  if (!canNext.value) return
  if (step.value < 4) { step.value++; return }
  busy.value = true; err.value = ''
  try { const t = await hc.value?.fresh(); await $fetch('/api/public/wealth-request', { method: 'POST', body: { ...f, turnstile_token: t || undefined } }); done.value = true }
  catch (e) { err.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send. Please try again.' } finally { busy.value = false }
}
</script>
<template>
  <div class="aw">
    <aside class="lf">
      <a href="https://aidiwealth.com" class="br" aria-label="Aidi Wealth"><AidiWordmark /><span>Wealth</span></a>
      <h1>{{ done ? 'Check your email.' : step === 1 ? 'Let\'s start with where you are.' : step === 2 ? 'What matters to you?' : step === 3 ? 'Roughly how much?' : 'Last, how do we reach you?' }}</h1>
      <p>{{ done ? 'We\'ve sent a link to ' + f.email + '. It opens a short conversation, about 8 minutes, that builds your plan. An adviser then looks over your answers, usually within one working day.' : 'A few taps, then your email. We\'ll send a link to a short conversation with our assistant that builds your plan.' }}</p>
      <ul><li>No million-dollar minimum</li><li>Stocks, T-bills, gold and digital assets</li><li>A person reviews every plan</li></ul>
      <small>Investing involves risk, including loss of principal. Aidi Wealth is part of The Aidi Group.</small>
    </aside>
    <main class="rt">
      <div v-if="done" class="dn"><span class="ok" aria-hidden="true">✓</span><b>Request sent</b><span class="mut">Didn't get it? Check spam, or <button class="lk" @click="done = false; step = 4">try again</button>.</span></div>
      <form v-else class="fm" @submit.prevent="next">
        <div class="pg" aria-hidden="true"><i v-for="n in 4" :key="n" :class="{ on: n <= step }" /></div><span class="mut sm">{{ step }} of 4</span>
        <template v-if="step === 1"><h2>Where do you live?</h2><div class="cards two"><button v-for="[k, l, n] in [['US', 'United States', 'Investing in US markets, in dollars'], ['NG', 'Nigeria', 'Naira and dollar savings, US markets']]" :key="k" type="button" :class="{ on: f.country === k }" @click="f.country = k; step = 2"><b>{{ l }}</b><span>{{ n }}</span></button></div></template>
        <template v-else-if="step === 2"><h2>What would you like help with?</h2><span class="mut sm">Pick any</span><div class="cards"><button v-for="[k, l, n] in HELP" :key="k" type="button" :class="{ on: f.help.includes(k) }" :aria-pressed="f.help.includes(k)" @click="toggle(k)"><b>{{ l }}</b><span>{{ n }}</span></button></div></template>
        <template v-else-if="step === 3"><h2>Roughly how much do you have to invest?</h2><span class="mut sm">A guide only. Skip it if you prefer.</span><div class="cards two"><button v-for="[k, l] in AMT" :key="k" type="button" :class="{ on: f.amount === k }" @click="f.amount = k; step = 4"><b>{{ l }}</b></button></div></template>
        <template v-else><h2>Your details</h2><div class="g2"><label>Full name<input v-model="f.name" required maxlength="120" autocomplete="name" autofocus></label><label>Email<input v-model="f.email" type="email" required maxlength="254" autocomplete="email"></label><label>Phone (optional)<input v-model="f.phone" maxlength="40" autocomplete="tel"></label><label>How did you hear about us (optional)<input v-model="f.source" maxlength="120"></label></div></template>
        <input v-model="f.website_hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p v-if="err" class="error">{{ err }}</p>
        <HumanCheck ref="hc" v-model="human" v-model:ready="humanReady" />
        <div class="ac"><button v-if="step > 1" type="button" class="btn secondary" @click="step--">← Back</button><span /><button class="btn" :disabled="busy || !canNext || (step === 4 && !humanReady)">{{ busy ? 'Sending…' : step === 4 ? 'Send me the link' : step === 3 && !f.amount ? 'Skip' : 'Continue' }}</button></div>
      </form>
    </main>
  </div>
</template>
<style scoped>
.aw { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); background: #fff; }
.lf { background: var(--c-paper-2); padding: 36px 48px; display: flex; flex-direction: column; gap: 18px; } .br { display: flex; align-items: center; gap: 10px; color: var(--c-navy); text-decoration: none; } .br :deep(svg) { height: 20px; width: auto; } .br span { border-left: 1px solid var(--c-rule-strong); padding-left: 10px; font-size: 14px; color: var(--c-ink-soft); }
.lf h1 { font-family: Garamond, 'EB Garamond', 'Cormorant Garamond', serif; font-weight: 400; font-size: 44px; line-height: 1.08; color: var(--c-navy); margin: 48px 0 0; max-width: 460px; } .lf p { color: var(--c-ink-soft); font-size: 15px; line-height: 1.6; margin: 0; max-width: 440px; }
.lf ul { list-style: none; margin: auto 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; } .lf li::before { content: '✓  '; color: var(--c-blue-deep); } .lf small { font-size: 11.5px; color: var(--c-muted); }
.rt { padding: 48px; display: flex; align-items: center; } .fm, .dn { width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 14px; }
.pg { display: flex; gap: 4px; } .pg i { flex: 1; height: 3px; background: #e6ecf2; } .pg i.on { background: var(--c-navy); }
h2 { margin: 6px 0 0; font-size: 24px; font-weight: 600; } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .cards button { font: inherit; text-align: left; padding: 16px 14px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; transition: border-color .15s, background .15s; } .cards button:hover { border-color: var(--c-navy); } .cards button.on { border-color: var(--c-navy); background: #f7f9fb; box-shadow: inset 0 0 0 1px var(--c-navy); }
.cards b { display: block; font-weight: 500; font-size: 15px; } .cards span { display: block; font-size: 12.5px; color: var(--c-muted); margin-top: 2px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--c-muted); } input { font: inherit; font-size: 14px; padding: 10px; border: 1px solid var(--c-rule-strong); box-sizing: border-box; width: 100%; }
.ac { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 6px; } .ac .btn { padding: 10px 18px; }
.error { color: var(--c-danger); margin: 0; font-size: 13px; } .hp { position: absolute; left: -9999px; width: 1px; height: 1px; }
.dn { align-items: flex-start; } .ok { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--c-navy); color: #fff; font-size: 20px; } .dn b { font-size: 22px; } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
@media (max-width: 860px) { .aw { grid-template-columns: 1fr; } .lf { padding: 24px 16px; } .lf h1 { font-size: 32px; margin-top: 16px; } .lf ul, .lf small { display: none; } .rt { padding: 24px 16px 40px; } .cards, .g2 { grid-template-columns: 1fr; } }
</style>
