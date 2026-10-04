<script setup lang="ts">
// Unsubscribe from a company's investor updates.
definePageMeta({ layout: 'plain' })
const token = useRoute().params.token as string
const done = ref<{ company: string; email: string } | null>(null); const msg = ref(''); const busy = ref(false)
useHead({ title: 'Unsubscribe', meta: [{ name: 'robots', content: 'noindex' }] })
async function go() { busy.value = true; try { done.value = await $fetch('/api/public/unsub/' + token, { method: 'POST' }) } catch { msg.value = 'This link is not valid.' } finally { busy.value = false } }
</script>
<template>
  <div class="box"><template v-if="done"><h1>You're unsubscribed</h1><p>{{ done.email }} will no longer receive investor updates from {{ done.company }}.</p></template>
    <template v-else><h1>Unsubscribe?</h1><p>Stop receiving investor updates from this company.</p><button class="btn" :disabled="busy" @click="go">Unsubscribe</button><p v-if="msg" class="error">{{ msg }}</p></template></div>
</template>
<style scoped>.box { max-width: 460px; background: #fff; padding: 36px; border: 1px solid var(--c-rule); } h1 { margin: 0 0 10px; } p { color: var(--c-ink-soft); } .error { color: var(--c-danger); }</style>
