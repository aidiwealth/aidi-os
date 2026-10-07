<script setup lang="ts">
// Intuit "Connect/Reconnect URL": choose which entity or company to connect, then sign in to QuickBooks.
const { data: subj } = await useFetch<{ entities: { id: string; name: string }[]; companies?: { id: string; name: string }[] }>('/api/financials/subjects', { key: 'qb-subj' })
const pick = ref('')
const opts = computed(() => [...(subj.value?.entities ?? []).map((e) => ({ v: 'entity:' + e.id, l: e.name })), ...(subj.value?.companies ?? []).map((c) => ({ v: 'company:' + c.id, l: c.name }))])
watchEffect(() => { if (!pick.value && opts.value.length === 1) pick.value = opts.value[0]!.v })
useHead({ title: 'Connect QuickBooks' })
</script>
<template>
  <section class="qc"><div class="card"><h1>Connect QuickBooks</h1><p class="mut">Bring your Profit &amp; Loss, Balance Sheet and Cash Flow into Financials. You will sign in to Intuit and approve read access; you check every figure before it is saved. You can disconnect at any time.</p>
    <label>Connect for<select v-model="pick"><option value="">Choose</option><option v-for="o in opts" :key="o.v" :value="o.v">{{ o.l }}</option></select></label>
    <a class="btn" :class="{ off: !pick }" :href="pick ? '/api/integrations/quickbooks/connect?subject=' + encodeURIComponent(pick) : undefined">Connect to QuickBooks</a></div></section>
</template>
<style scoped>
.qc { max-width: 560px; margin: 40px auto; } .card { display: flex; flex-direction: column; gap: 14px; } h1 { margin: 0; font-size: 22px; } .mut { color: var(--c-muted); margin: 0; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); } select { font: inherit; padding: 8px 10px; border: 1px solid var(--c-rule-strong); } .btn { align-self: flex-start; } .btn.off { opacity: .5; pointer-events: none; }
</style>
