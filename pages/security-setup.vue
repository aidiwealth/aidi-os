<script setup lang="ts">
// Finvry asks everyone to turn on two-step verification before using their workspace: a focused page, just the set-up.
definePageMeta({ layout: 'plain' })
useHead({ title: 'Protect your account' })
const { data: me, refresh } = await useFetch<{ email: string; mfa_required?: boolean }>('/api/auth/me', { key: 'me' })
async function done() { await refresh(); await refreshNuxtData('modules').catch(() => {}); await navigateTo('/') }
async function signOut() { await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); await navigateTo('/login') }
</script>
<template>
  <main class="ss">
    <div class="top"><BrandMark /></div>
    <MfaWizard @done="done" />
    <p class="foot">Signed in as <b>{{ me?.email }}</b> · <button class="lk" type="button" @click="signOut">Sign out</button></p>
  </main>
</template>
<style scoped>
.ss { width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 20px; } .top { display: flex; justify-content: center; } .top :deep(img) { height: 30px; }
.foot { margin: 0; text-align: center; font-size: 12.5px; color: var(--c-muted); } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
</style>
