<script setup lang="ts">
// Public: ask to work with Aidi Wealth. A short form; we email a link to start the onboarding conversation, and an
// adviser approves before the dashboard opens.
definePageMeta({ layout: 'public' })
useHead({ title: 'Work with Aidi Wealth', meta: [{ name: 'description', content: 'Financial planning and investing with Aidi Wealth. Tell us who you are and we will email you a link to start.' }] })
const HELP: [string, string][] = [['plan', 'A financial plan'], ['investing', 'Investing'], ['retirement', 'Retirement'], ['children', 'Saving for children'], ['metals', 'Gold and silver'], ['everything', 'Everything']]
const f = reactive({ name: '', email: '', country: 'US', phone: '', help: [] as string[], amount: '', source: '', website_hp: '' })
const hc = ref<{ fresh: () => Promise<string> } | null>(null), human = ref(''), humanReady = ref(false)
const busy = ref(false), done = ref(false), err = ref('')
const toggle = (k: string) => { f.help = f.help.includes(k) ? f.help.filter((x) => x !== k) : [...f.help, k] }
async function send() {
  busy.value = true; err.value = ''
  try { const t = await hc.value?.fresh(); await $fetch('/api/public/wealth-request', { method: 'POST', body: { ...f, turnstile_token: t || undefined } }); done.value = true }
  catch (e) { err.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send. Please try again.' } finally { busy.value = false }
}
</script>
<template>
  <section class="wr">
    <div v-if="done" class="card"><h1>Check your email</h1><p class="mut">We've sent a link to <b>{{ f.email }}</b>. It opens a short conversation, about 8 minutes, to set up your plan and account. An adviser then looks over your answers, usually within one working day.</p></div>
    <form v-else class="card" :class="{ gate: !humanReady }" @submit.prevent="send">
      <p class="lbl">Aidi Wealth</p><h1>Work with Aidi Wealth</h1><p class="mut">Tell us who you are. We'll email you a link to start: a short conversation instead of long forms.</p>
      <div class="g2"><label>Full name<input v-model="f.name" required maxlength="120" autocomplete="name"></label><label>Email<input v-model="f.email" type="email" required maxlength="254" autocomplete="email"></label>
        <label>Country<select v-model="f.country"><option value="US">United States</option><option value="NG">Nigeria</option></select></label><label>Phone<input v-model="f.phone" maxlength="40" autocomplete="tel"></label></div>
      <span class="ql">What would you like help with</span><div class="chips"><button v-for="[k, l] in HELP" :key="k" type="button" :class="{ on: f.help.includes(k) }" :aria-pressed="f.help.includes(k)" @click="toggle(k)">{{ l }}</button></div>
      <label>Roughly how much do you have to invest<select v-model="f.amount"><option value="">Prefer not to say</option><option value="under_50k">Under $50k</option><option value="50k_250k">$50k – $250k</option><option value="250k_1m">$250k – $1M</option><option value="over_1m">Over $1M</option></select></label>
      <label>How did you hear about us (optional)<input v-model="f.source" maxlength="120"></label>
      <input v-model="f.website_hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p v-if="err" class="error">{{ err }}</p>
      <button class="btn" :disabled="busy || !humanReady || !f.name || !f.email">{{ busy ? 'Sending…' : 'Request an invite' }}</button>
      <p class="fine">Aidi Wealth gives information and tools to help you plan. Investing involves risk, including the loss of what you invest.</p>
    </form>
    <HumanCheck ref="hc" v-model="human" v-model:ready="humanReady" />
  </section>
</template>
<style scoped>
.wr { max-width: 620px; margin: 32px auto; padding: 0 16px; } .card { padding: 28px; display: flex; flex-direction: column; gap: 12px; } .gate { opacity: .6; }
h1 { margin: 0; font-size: 26px; } .lbl { margin: 0; font-size: 12.5px; color: var(--c-muted); } .mut { color: var(--c-muted); margin: 0; font-size: 14px; line-height: 1.55; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--c-muted); } .ql { font-size: 12.5px; color: var(--c-muted); }
input, select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; box-sizing: border-box; width: 100%; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { font: inherit; font-size: 13px; padding: 6px 11px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; } .chips button.on { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
.btn { align-self: flex-start; padding: 10px 16px; } .error { color: var(--c-danger); margin: 0; font-size: 13px; } .fine { font-size: 12px; color: var(--c-muted); margin: 4px 0 0; } .hp { position: absolute; left: -9999px; width: 1px; height: 1px; }
@media (max-width: 600px) { .g2 { grid-template-columns: 1fr; } }
</style>
