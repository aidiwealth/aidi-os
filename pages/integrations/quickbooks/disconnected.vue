<script setup lang="ts">
// Intuit "Disconnect URL": shown after the app is disconnected from QuickBooks.
definePageMeta({ layout: 'public' })
useHead({ title: 'QuickBooks disconnected' })
</script>
<template>
  <div class="wrap"><div class="card"><h1>QuickBooks is disconnected</h1><p>Your QuickBooks company is no longer connected, and we have deleted the access tokens. Figures you already saved in Financials stay where they are.</p><p>To connect again, sign in and go to Financials, or use the button below.</p><a class="btn" href="/integrations/quickbooks/connect">Reconnect QuickBooks</a></div></div>
</template>
<style scoped>
.wrap { max-width: 560px; margin: 60px auto; padding: 0 18px; } .card { display: flex; flex-direction: column; gap: 10px; } h1 { margin: 0; font-size: 22px; } p { margin: 0; color: var(--c-ink-soft); line-height: 1.55; } .btn { align-self: flex-start; margin-top: 6px; }
</style>
