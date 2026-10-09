<script setup lang="ts">
// Tax by country: the same rule is added to service (job) invoices, workspace invoices and wealth fees billed there.
type Scope = 'services' | 'platform' | 'wealth'
interface R { country: string; label: string; rate: number; enabled: boolean; applies_to: Scope[] }
const { data, refresh } = await useFetch<{ rates: R[] }>('/api/platform/tax-rates', { key: 'tax-rates' })
const rows = ref<R[]>([])
watchEffect(() => { if (data.value) rows.value = data.value.rates.map((r) => ({ ...r, applies_to: [...r.applies_to] })) })
const SCOPES: { k: Scope; label: string }[] = [{ k: 'services', label: 'Service jobs' }, { k: 'platform', label: 'Workspace plans' }, { k: 'wealth', label: 'Wealth fees' }]
function toggle(r: R, k: Scope) { r.applies_to = r.applies_to.includes(k) ? r.applies_to.filter((x) => x !== k) : [...r.applies_to, k] }
const busy = ref(false), msg = ref(''), ok = ref(false)
async function save() { busy.value = true; msg.value = ''; ok.value = false; try { await $fetch('/api/platform/tax-rates', { method: 'POST', body: { rates: rows.value.map((r) => ({ ...r, rate: Number(r.rate) })) } }); ok.value = true; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false } }
</script>
<template>
  <div class="tx">
    <h2>Tax (VAT)</h2>
    <p class="mut">Added to every new invoice billed in that country: service job invoices, workspace plan invoices and wealth fees. Naira invoices are always billed as Nigeria. Existing invoices do not change.</p>
    <table><thead><tr><th>Country</th><th>Label</th><th>Rate %</th><th>Applies to</th><th>On</th><th /></tr></thead><tbody>
      <tr v-for="(r, i) in rows" :key="i"><td><input v-model="r.country" maxlength="2" class="cc" placeholder="NG"></td><td><input v-model="r.label" maxlength="30" class="lb"></td><td><input v-model.number="r.rate" type="number" min="0" max="50" step="0.01" class="rt"></td>
        <td><label v-for="s in SCOPES" :key="s.k" class="ch"><input type="checkbox" :checked="r.applies_to.includes(s.k)" @change="toggle(r, s.k)"> {{ s.label }}</label></td><td><input v-model="r.enabled" type="checkbox"></td><td><button class="lk" @click="rows.splice(i, 1)">Remove</button></td></tr>
    </tbody></table>
    <div class="row"><button class="lk" @click="rows.push({ country: '', label: 'VAT', rate: 0, enabled: true, applies_to: ['services', 'platform', 'wealth'] })">+ Add a country</button><button class="btn" :disabled="busy" @click="save">{{ busy ? 'Saving…' : 'Save tax' }}</button><span v-if="ok" class="okm">Saved.</span><span v-if="msg" class="err">{{ msg }}</span></div>
  </div>
</template>
<style scoped>
h2 { margin: 0 0 4px; } .mut { color: var(--c-muted); font-size: 13.5px; margin: 0 0 10px; } table { width: 100%; border-collapse: collapse; font-size: 13.5px; } th { text-align: left; font-weight: 500; color: var(--c-muted); padding: 6px; border-bottom: 1px solid var(--c-rule); } td { padding: 6px; border-bottom: 1px solid var(--c-rule); vertical-align: middle; }
input { font: inherit; padding: 6px 8px; border: 1px solid var(--c-rule-strong); } .cc { width: 52px; text-transform: uppercase; } .lb { width: 100px; } .rt { width: 80px; } .ch { display: inline-flex; gap: 4px; align-items: center; margin-right: 10px; white-space: nowrap; } .ch input, td > input[type=checkbox] { padding: 0; }
.row { display: flex; gap: 12px; align-items: center; margin-top: 12px; } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 13px; padding: 0; } .okm { color: var(--c-ok); } .err { color: var(--c-danger); }
</style>
