<script setup lang="ts">
// Revenue retention and Customers in a group: each company builds its own customer numbers; the group combines them.
// (The company is chosen at the top of Financials; this says what is shown and offers to move misplaced data.)
import type { CustScopeInfo } from '~/composables/useCustomers'
const props = defineProps<{ info: CustScopeInfo | null | undefined; currency: string; canEdit?: boolean }>()
const emit = defineEmits<{ moved: [msg: string] }>()
const { scope } = useCustScope()
const route = useRoute()
const ents = computed(() => props.info?.entities ?? [])
const cur = computed(() => ents.value.find((e) => e.id === scope.value))
const withData = computed(() => ents.value.filter((e) => e.has_data).length)
const behind = computed(() => (props.info?.common_last ? ents.value.filter((e) => e.last && e.last === props.info!.common_last && ents.value.some((x) => x.last && x.last > e.last!)) : []))
// Data added before the group had its companies sits on the main company: move it to the company it belongs to.
const mv = reactive({ open: false, to: '', busy: false, msg: '' })
const targets = computed(() => ents.value.filter((e) => e.id !== scope.value && !e.has_data))
async function move() {
  mv.busy = true; mv.msg = ''
  try { const r = await $fetch<{ moved: number; to: string }>('/api/financials/customers/move', { method: 'POST', query: { cust: scope.value }, body: { to: mv.to } }); mv.open = false; emit('moved', r.moved + ' customers moved to ' + r.to + '.'); await navigateTo({ query: { ...route.query, s: 'entity:' + mv.to } }) }
  catch (e) { mv.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not move them.' } finally { mv.busy = false }
}
const mon = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
</script>
<template>
  <div v-if="ents.length > 1" class="csb">
    <p v-if="!scope" class="mut">Group: {{ withData }} of {{ ents.length }} companies combined in {{ currency }}. Choose a company to edit its customers.<template v-if="behind.length">{{ ' ' + behind.map((e) => e.name + ' has figures to ' + mon(e.last!)).join('; ') }}: the group opens on {{ mon(info!.common_last!) }}.</template></p>
    <p v-else class="mut">{{ cur?.name }} only{{ cur?.currency ? ', in ' + cur.currency : '' }}.<button v-if="canEdit && cur?.has_data && targets.length" type="button" class="lk" @click="mv.open = !mv.open; mv.to = targets[0]!.id">Belongs to another company?</button></p>
    <div v-if="mv.open" class="mv"><span>Move all of {{ cur?.name }}'s customer revenue, settings and linked sheet to</span><select v-model="mv.to" aria-label="Company"><option v-for="e in targets" :key="e.id" :value="e.id">{{ e.name }}</option></select><button type="button" class="btn sm" :disabled="mv.busy" @click="move">{{ mv.busy ? 'Moving…' : 'Move' }}</button><button type="button" class="btn secondary sm" @click="mv.open = false">Cancel</button><span v-if="mv.msg" class="err">{{ mv.msg }}</span></div>
  </div>
</template>
<style scoped>
.csb { display: flex; flex-direction: column; gap: 6px; margin: 0 0 14px; }
.seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--c-rule-strong); align-self: flex-start; background: #fff; }
.seg button { background: none; border: 0; border-right: 1px solid var(--c-rule); padding: 8px 14px; font: inherit; font-size: 14px; color: var(--c-ink-soft); cursor: pointer; display: flex; gap: 6px; align-items: baseline; }
.seg button:last-child { border-right: 0; } .seg button.on { background: var(--c-navy); color: #fff; } .seg em { font-style: normal; font-size: 11.5px; opacity: .7; }
.lk { background: none; border: 0; padding: 0; margin-left: 8px; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .mv { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13.5px; padding: 10px 12px; border: 1px solid var(--c-rule); background: #fff; } .mv select { font: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); } .err { color: var(--c-danger); }
.mut { margin: 0; font-size: 13px; color: var(--c-muted); line-height: 1.5; max-width: 110ch; }
</style>
