<script setup lang="ts">
// Accept a portal invite: check your details, then you are signed in.
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
const { data, error } = await useFetch<{ name: string; email: string; phone: string | null; address: string | null; client: string; workspace: { firm: string } }>('/api/public/portal-invite/' + token)
useHead({ title: 'Welcome' })
const f = reactive({ name: '', phone: '', address: '' })
watchEffect(() => { if (data.value) Object.assign(f, { name: data.value.name, phone: data.value.phone ?? '', address: data.value.address ?? '' }) })
const msg = ref(''); const busy = ref(false)
async function go() { busy.value = true; msg.value = ''; try { await $fetch('/api/public/portal-invite/' + token, { method: 'POST', body: f }); await navigateTo('/client') } catch (e) { msg.value = portalErr(e) } finally { busy.value = false } }
</script>

<template>
  <section class="box card">
    <template v-if="error"><h1>{{ error.statusCode === 410 ? 'This invite has expired' : 'This link is not valid' }}</h1><p class="muted">{{ error.data?.data?.error?.message }}</p><NuxtLink to="/client/login" class="btn">Sign in with your email</NuxtLink></template>
    <form v-else-if="data" @submit.prevent="go">
      <p class="label">{{ data.workspace.firm }} · Client portal</p>
      <h1>Welcome, {{ data.client }}</h1>
      <p class="muted">Check your details. You will sign in as {{ data.email }}; next time we email you a code, so there is no password to remember.</p>
      <label class="label">Your name<input v-model="f.name" required maxlength="200"></label>
      <label class="label">Phone<input v-model="f.phone" maxlength="40"></label>
      <label class="label">Address<textarea v-model="f.address" rows="2" maxlength="500" /></label>
      <button class="btn" type="submit" :disabled="busy">{{ busy ? 'Opening…' : 'Open my portal' }}</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    </form>
  </section>
</template>

<style scoped>
.box { max-width: 480px; margin: 40px auto; } form { display: flex; flex-direction: column; gap: 14px; } h1 { margin: 0; } label { display: flex; flex-direction: column; gap: 6px; }
input, textarea { font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid var(--c-rule-strong); } .muted { color: var(--c-muted); margin: 0; font-size: 14px; } .error { color: var(--c-danger); }
</style>
