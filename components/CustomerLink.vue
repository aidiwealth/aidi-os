<script setup lang="ts">
// The live sheet behind Revenue retention and Customers: last read, read now, unlink, and names that may be the same
// customer (merge with one click).
const props = defineProps<{ canEdit: boolean }>()
const emit = defineEmits<{ changed: [] }>()
interface Dup { names: string[]; to: string; reason: string }
interface L { url: string | null; name: string | null; synced_at: string | null; error: string | null; result: { customers?: number; possible?: Dup[] } | null }
const { data, refresh } = await useFetch<L>('/api/financials/customers/link', { server: false, default: () => ({ url: null, name: null, synced_at: null, error: null, result: null }) })
const busy = ref(''); const msg = ref('')
const ago = (t: string | null) => { if (!t) return 'not yet'; const m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function sync() { busy.value = 'sync'; msg.value = ''; try { const r = await $fetch<{ customers: number; possible: number }>('/api/financials/customers/sync', { method: 'POST' }); msg.value = r.customers + ' customers read' + (r.possible ? '; ' + r.possible + ' possible duplicate' + (r.possible === 1 ? '' : 's') + ' to check' : '') + '.'; await refresh(); emit('changed') } catch (e) { msg.value = err(e); await refresh() } finally { busy.value = '' } }
async function unlink() { if (!confirm('Stop reading this sheet? Customers already saved stay.')) return; busy.value = 'un'; try { await $fetch('/api/financials/customers/link', { method: 'DELETE' }); await refresh() } finally { busy.value = '' } }
async function merge(d: Dup) {
  busy.value = d.to; msg.value = ''
  try {
    const cs = await $fetch<{ customers: { id: string; name: string }[] }>('/api/financials/customers')
    const ids = cs.customers.filter((c) => d.names.includes(c.name)).map((c) => c.id), keep = cs.customers.find((c) => c.name === d.to)?.id ?? ids[0]
    if (ids.length >= 2 && keep) { await $fetch('/api/financials/customers/merge', { method: 'POST', body: { ids, keep } }); msg.value = 'Merged into ' + d.to + '; kept merged on every read.'; await sync() }
  } catch (e) { msg.value = err(e) } finally { busy.value = '' }
}
const dupes = computed(() => data.value?.result?.possible ?? [])
</script>
<template>
  <div v-if="data?.url" class="cl">
    <div class="r"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg></span>
      <div class="t"><b>Live from {{ data.name || 'a linked sheet' }}</b><span>Read {{ ago(data.synced_at) }} · every day{{ data.result?.customers ? ' · ' + data.result.customers + ' customers' : '' }}</span></div>
      <span v-if="data.error" class="er">{{ data.error }}</span>
      <a :href="data.url" target="_blank" rel="noopener" class="lk">Open sheet</a>
      <template v-if="props.canEdit"><button type="button" class="lk" :disabled="!!busy" @click="sync">{{ busy === 'sync' ? 'Reading…' : 'Read now' }}</button><button type="button" class="lk mu" :disabled="!!busy" @click="unlink">Unlink</button></template></div>
    <div v-if="dupes.length && props.canEdit" class="dp"><b>{{ dupes.length }} possible duplicate{{ dupes.length === 1 ? '' : 's' }}</b>
      <div v-for="d in dupes.slice(0, 6)" :key="d.names.join()" class="di"><span>{{ d.names.join('  ·  ') }}</span><button type="button" class="lk" :disabled="!!busy" @click="merge(d)">Merge as {{ d.to }}</button></div></div>
    <p v-if="msg" class="ms">{{ msg }}</p>
  </div>
</template>
<style scoped>
.cl { background: #fff; border: 1px solid var(--c-rule); padding: 10px 14px; margin: 0 0 12px; font-size: 13px; }
.r { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; } .ic { width: 30px; height: 30px; background: var(--c-signal-soft); color: var(--c-blue-deep); display: flex; align-items: center; justify-content: center; } .ic svg { width: 16px; height: 16px; }
.t { display: flex; flex-direction: column; margin-right: auto; } .t b { font-weight: 500; } .t span { font-size: 12px; color: var(--c-muted); }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; } .lk.mu { color: var(--c-muted); } .er { color: var(--c-danger); font-size: 12.5px; }
.dp { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 6px; } .di { display: flex; justify-content: space-between; gap: 12px; } .di span { color: var(--c-ink-soft); }
.ms { margin: 8px 0 0; color: var(--c-ink-soft); }
</style>
