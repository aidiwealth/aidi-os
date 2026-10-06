<script setup lang="ts">
// Storage used, the limit, packs and "Add storage" (paid from the wallet).
const props = defineProps<{ compact?: boolean }>()
const { data, refresh } = await useFetch<{ used: number; limit_gb: number | null; plan_gb: number | null; addon_gb: number; extra_gb: number; addons: { id: string; gb: number; expires_at: string; auto_renew: boolean }[]; pack: { gb: number; price: number; currency: string }; can_buy: boolean }>('/api/storage', { key: 'storage' })
const gb = (b: number) => (b / 1024 ** 3 >= 0.1 ? (b / 1024 ** 3).toFixed(2) + ' GB' : Math.max(0.1, b / 1024 ** 2).toFixed(1) + ' MB')
const pct = computed(() => (data.value?.limit_gb ? Math.min(100, (data.value.used / (data.value.limit_gb * 1024 ** 3)) * 100) : 0))
const price = computed(() => data.value ? new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value.pack.currency, maximumFractionDigits: 0 }).format(data.value.pack.price) : '')
const msg = ref(''); const busy = ref(false)
async function buy() { if (!confirm('Add ' + data.value!.pack.gb + ' GB of storage for ' + price.value + ' a month, paid from your wallet? It renews automatically; you can turn that off.')) return; busy.value = true; msg.value = ''; try { await $fetch('/api/storage/buy', { method: 'POST' }); await refresh(); msg.value = 'Storage added.' } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add storage.' } finally { busy.value = false } }
async function renew(id: string, on: boolean) { await $fetch('/api/storage/addons/' + id, { method: 'POST', body: { auto_renew: on } }); await refresh() }
</script>
<template>
  <div v-if="data" :class="['card', 'stc', { compact: props.compact }]">
    <div class="sh"><b>Storage</b><span>{{ gb(data.used) }}{{ data.limit_gb != null ? ' of ' + data.limit_gb + ' GB' : ' used (no limit)' }}</span></div>
    <div v-if="data.limit_gb != null" class="bar"><i :style="{ width: pct + '%' }" :class="{ warn: pct >= 80, full: pct >= 100 }" /></div>
    <template v-if="!props.compact">
      <p v-if="data.limit_gb != null" class="mut">Plan {{ data.plan_gb }} GB<template v-if="data.addon_gb"> + {{ data.addon_gb }} GB in packs</template><template v-if="data.extra_gb"> + {{ data.extra_gb }} GB from Finvry</template>. Files, decks, data room and generated documents all count.</p>
      <div v-for="a in data.addons" :key="a.id" class="pk"><span>+{{ a.gb }} GB · renews {{ new Date(a.expires_at).toLocaleDateString('en-GB') }}</span><label><input type="checkbox" :checked="a.auto_renew" @change="renew(a.id, ($event.target as HTMLInputElement).checked)"> Renew automatically</label></div>
      <div v-if="data.can_buy && data.limit_gb != null" class="row"><button class="btn secondary" :disabled="busy" @click="buy">Add {{ data.pack.gb }} GB · {{ price }}/month</button><span class="mut">Paid from your wallet.</span></div>
      <p v-if="msg" class="mut">{{ msg }}</p>
    </template>
    <p v-else-if="pct >= 80" class="warnm">{{ pct >= 100 ? 'Storage is full.' : 'Storage is nearly full.' }} <NuxtLink to="/settings">Add storage</NuxtLink></p>
  </div>
</template>
<style scoped>
.stc { display: flex; flex-direction: column; gap: 8px; } .stc.compact { padding: 10px 14px; gap: 6px; } .sh { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; } .sh span { color: var(--c-ink-soft); font-variant-numeric: tabular-nums; }
.bar { height: 7px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-blue-deep); } .bar i.warn { background: var(--c-warn); } .bar i.full { background: var(--c-danger); }
.mut { color: var(--c-muted); font-size: 12.5px; margin: 0; } .pk { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; border-top: 1px solid var(--c-rule); padding-top: 6px; } .pk label { display: flex; gap: 6px; align-items: center; color: var(--c-muted); } .pk input { width: auto; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .warnm { font-size: 12.5px; color: var(--c-warn); margin: 0; } .warnm a { color: var(--c-blue-deep); }
</style>
