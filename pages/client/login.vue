<script setup lang="ts">
// Client portal sign-in: email, then the 6-digit code we send. No passwords.
definePageMeta({ layout: 'public' })
useHead({ title: 'Client portal sign-in' })
const step = ref<'email' | 'code'>('email')
const email = ref(''); const code = ref(''); const msg = ref(''); const busy = ref(false)
async function send() { busy.value = true; msg.value = ''; try { await $fetch('/api/portal/auth/request', { method: 'POST', body: { email: email.value } }); step.value = 'code' } catch (e) { msg.value = portalErr(e) } finally { busy.value = false } }
async function verify() { busy.value = true; msg.value = ''; try { await $fetch('/api/portal/auth/verify', { method: 'POST', body: { email: email.value, code: code.value } }); await navigateTo('/client') } catch (e) { msg.value = portalErr(e) } finally { busy.value = false } }
</script>

<template>
  <section class="box card">
    <p class="label">Client portal</p>
    <h1>Sign in</h1>
    <form v-if="step === 'email'" @submit.prevent="send"><label class="label">Email<input v-model="email" type="email" required autocomplete="email" maxlength="254"></label>
      <button class="btn" type="submit" :disabled="busy">{{ busy ? 'Sending…' : 'Email me a code' }}</button></form>
    <form v-else @submit.prevent="verify"><p class="muted">If {{ email }} has access, we have sent it a 6-digit code. It expires in 10 minutes.</p>
      <label class="label">Code<input v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required class="code"></label>
      <button class="btn" type="submit" :disabled="busy || code.length !== 6">{{ busy ? 'Checking…' : 'Sign in' }}</button>
      <button type="button" class="link" @click="step = 'email'; code = ''">Use a different email</button></form>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p>
  </section>
</template>

<style scoped>
.box { max-width: 420px; margin: 40px auto; display: flex; flex-direction: column; gap: 6px; } h1 { margin: 0 0 12px; }
form { display: flex; flex-direction: column; gap: 14px; } label { display: flex; flex-direction: column; gap: 6px; }
input { font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid var(--c-rule-strong); } .code { font-size: 24px; letter-spacing: .4em; font-family: ui-monospace, Menlo, monospace; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; align-self: flex-start; } .muted { color: var(--c-muted); margin: 0; font-size: 14px; } .error { color: var(--c-danger); }
</style>
