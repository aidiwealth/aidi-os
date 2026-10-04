<script setup lang="ts">
definePageMeta({ layout: 'plain' })
const brand = useBrand()
useHead({ title: 'Sign in' })
const route = useRoute()
const email = ref('')
const code = ref('')
const step = ref<'email' | 'code'>('email')
const busy = ref(false)
const error = ref(route.query.error === 'link' ? 'That sign-in link is invalid or has expired. Request a new code.' : '')

function message(e: unknown): string {
  const d = (e as { data?: { data?: { error?: { message?: string } }; message?: string } }).data
  return d?.data?.error?.message ?? d?.message ?? 'Something went wrong. Try again.'
}
async function requestCode() {
  busy.value = true; error.value = ''
  try { await $fetch('/api/auth/request', { method: 'POST', body: { email: email.value } }); step.value = 'code' }
  catch (e) { error.value = message(e) } finally { busy.value = false }
}
async function verify() {
  busy.value = true; error.value = ''
  try { await $fetch('/api/auth/verify-otp', { method: 'POST', body: { email: email.value, code: code.value } }); await navigateTo('/') }
  catch (e) { error.value = message(e) } finally { busy.value = false }
}
</script>

<template>
  <div class="box">
    <div class="brand"><BrandMark /></div>
    <form v-if="step === 'email'" @submit.prevent="requestCode">
      <h1>Sign in</h1>
      <p class="hint">We'll email you a sign-in link and a 6-digit code.</p>
      <label for="email" class="label">Email</label>
      <input id="email" v-model="email" type="email" autocomplete="email" required>
      <button class="btn" type="submit" :disabled="busy">{{ busy ? 'Sending…' : 'Email me a code' }}</button>
    </form>
    <form v-else @submit.prevent="verify">
      <h1>Check your email</h1>
      <p class="hint">If {{ email }} has access to {{ brand.name }}, a code is on its way. It expires in 10 minutes.</p>
      <label for="code" class="label">6-digit code</label>
      <input id="code" v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
      <button class="btn" type="submit" :disabled="busy">{{ busy ? 'Checking…' : 'Sign in' }}</button>
      <button class="link" type="button" @click="step = 'email'; code = ''">Use a different email</button>
    </form>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="brand.key === 'finvry' && step === 'email'" class="new">New to Finvry? <NuxtLink to="/start">Create a free account</NuxtLink></p>
  </div>
</template>

<style scoped>
.box { width: 100%; max-width: 400px; background: #fff; padding: 36px; border: 1px solid var(--c-rule); border-radius: 0; box-shadow: var(--shadow-pop); }
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; color: var(--c-navy); }
.w { display: flex; width: 62px; height: 25px; } .w :deep(svg) { width: 100%; height: 100%; display: block; } .d { width: 1px; height: 18px; background: var(--c-rule-strong); } .a { font-family: var(--font-serif); font-style: italic; font-size: 1.2rem; }
h1 { margin-bottom: 8px; }
.hint { color: var(--c-muted); margin: 0 0 20px; }
input { width: 100%; font: inherit; padding: 9px 12px; border: 1px solid var(--c-rule-strong); margin: 6px 0 16px; }
.btn { width: 100%; justify-content: center; }
.link { background: none; border: 0; color: var(--c-blue-deep); margin-top: 14px; cursor: pointer; font: inherit; padding: 0; }
.error { color: var(--c-danger); margin-top: 16px; }
.new { margin: 18px 0 0; font-size: 13.5px; color: var(--c-muted); }
</style>
