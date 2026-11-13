<script setup lang="ts">
// Opening an invite-only part of an investor page (the data room, the cap table): the visitor's email gets a one-time
// code when it's on the company's list; anyone else can ask the company for access.
const props = withDefaults(defineProps<{ slug: string; company: string; what: 'room' | 'captable'; compact?: boolean }>(), { compact: false })
const emit = defineEmits<{ done: [] }>()
const step = ref<'email' | 'code' | 'ask' | 'asked'>('email')
const f = reactive({ email: '', code: '', name: '', company: '', note: '', website_hp: '' }), busy = ref(false), msg = ref('')
const api = '/api/public/c/' + props.slug + '/invite/'
const thing = computed(() => (props.what === 'room' ? 'data room' : 'cap table'))
const errOf = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
async function run(fn: () => Promise<void>) { busy.value = true; msg.value = ''; try { await fn() } catch (e) { msg.value = errOf(e) } finally { busy.value = false } }
const sendCode = () => run(async () => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) throw { data: { data: { error: { message: 'Enter a valid email address.' } } } }
  const r = await $fetch<{ invited: boolean }>(api + 'code', { method: 'POST', body: { email: f.email.trim() } })
  step.value = r.invited ? 'code' : 'ask'
})
const verify = () => run(async () => { await $fetch(api + 'verify', { method: 'POST', body: { email: f.email.trim(), code: f.code.trim() } }); emit('done') })
const ask = () => run(async () => { const r = await $fetch<{ invited?: boolean }>(api + 'request', { method: 'POST', body: { email: f.email.trim(), name: f.name.trim(), company: f.company.trim(), note: f.note.trim(), website_hp: f.website_hp || undefined } }); if (r.invited) { step.value = 'email'; await sendCode() } else step.value = 'asked' })
</script>

<template>
  <div class="ig" :class="{ compact }">
    <span class="lock" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8" /></svg></span>
    <template v-if="step === 'email'">
      <h2>{{ company }}'s {{ thing }} is invite-only</h2>
      <p>If {{ company }} invited you, enter that email and we'll send you a code.</p>
      <form class="row" @submit.prevent="sendCode"><input v-model="f.email" type="email" required maxlength="254" autocomplete="email" placeholder="you@fund.com"><button class="b1" :disabled="busy">{{ busy ? 'Sending…' : 'Send me a code' }}</button></form>
    </template>
    <template v-else-if="step === 'code'">
      <h2>Check your email</h2>
      <p>We sent a 6-digit code to <b>{{ f.email }}</b>. It works for 10 minutes.</p>
      <form class="row" @submit.prevent="verify"><input v-model="f.code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" class="code"><button class="b1" :disabled="busy || f.code.trim().length !== 6">{{ busy ? 'Checking…' : 'Open' }}</button></form>
      <button class="lk" type="button" @click="step = 'email'; f.code = ''">Use a different email</button>
    </template>
    <template v-else-if="step === 'ask'">
      <h2>Ask {{ company }} for access</h2>
      <p><b>{{ f.email }}</b> isn't on the list yet. {{ company }} will get your request and email you if they let you in.</p>
      <form class="col" @submit.prevent="ask">
        <input v-model="f.website_hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="two"><input v-model="f.name" required maxlength="120" autocomplete="name" placeholder="Your name"><input v-model="f.company" maxlength="200" autocomplete="organization" placeholder="Fund or company"></div>
        <textarea v-model="f.note" maxlength="1000" rows="2" placeholder="A note (optional)" />
        <div class="row"><button class="b1" :disabled="busy">{{ busy ? 'Sending…' : 'Request access' }}</button><button class="lk" type="button" @click="step = 'email'">Use a different email</button></div>
      </form>
    </template>
    <template v-else>
      <h2>Request sent</h2>
      <p>{{ company }} will email {{ f.email }} if they give you access.</p>
    </template>
    <p v-if="msg" class="err">{{ msg }}</p>
  </div>
</template>

<style scoped>
.ig { background: #fff; border: 1px solid #e3e1dc; padding: 28px 30px 24px; display: flex; flex-direction: column; gap: 10px; max-width: 520px; box-sizing: border-box; color: #14161a; }
.ig.compact { max-width: none; padding: 22px 24px; }
.lock { width: 40px; height: 40px; background: #e6eef6; color: var(--c-navy); display: grid; place-items: center; } .lock svg { width: 20px; height: 20px; }
h2 { margin: 4px 0 0; font-size: 20px; line-height: 1.25; color: var(--c-navy); letter-spacing: -0.01em; } p { margin: 0; font-size: 14.5px; color: #3b414b; line-height: 1.5; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .row input { flex: 1; min-width: 200px; } .col { display: flex; flex-direction: column; gap: 8px; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
input, textarea { font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid #d5d2cb; background: #fff; box-sizing: border-box; width: 100%; } .row input { width: auto; } input:focus, textarea:focus { outline: 2px solid #8fb3d6; outline-offset: -1px; border-color: #8fb3d6; }
.code { letter-spacing: .3em; font-family: 'SF Mono', Menlo, Consolas, monospace; max-width: 180px; }
.b1 { background: var(--c-navy); color: #fff; border: 0; padding: 11px 18px; font: inherit; font-weight: 600; font-size: 14.5px; cursor: pointer; } .b1:disabled { opacity: .6; cursor: default; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; align-self: flex-start; } .row .lk { align-self: center; }
.err { color: #b54708; font-size: 13.5px; } .hp { position: absolute; left: -9999px; width: 1px; height: 1px; }
@media (max-width: 600px) { .two { grid-template-columns: 1fr; } .ig { padding: 22px 18px; } }
</style>
