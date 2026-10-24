<script setup lang="ts">
// Documents out for signature on this cap table: who has signed, board approval, and what reached the cap table.
interface S { id: string; role: string; name: string; email: string; title: string | null; sent_at: string | null; viewed_at: string | null; signed_at: string | null }
export interface EDoc { id: string; kind: string; title: string; status: string; applied_id: string | null; consent_id: string | null; consent_outside: boolean; document_id: string | null; created_at: string; completed_at: string | null; signers: S[] }
const props = defineProps<{ docs: EDoc[] }>()
const emit = defineEmits<{ changed: []; consent: [ids: string[]]; send: [type: 'convertible' | 'grant' | 'issuance'] }>()
const KIND: Record<string, string> = { safe: 'SAFE', grant: 'Equity grant', purchase: 'Stock purchase', consent: 'Board consent' }
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const msg = ref(''), busy = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function act(body: Record<string, unknown>, key: string) { busy.value = key; msg.value = ''; try { await $fetch('/api/equity/esign', { method: 'POST', body }); emit('changed') } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + id + '/download'); window.open(r.url, '_blank') } catch (e) { msg.value = err(e) } }
const consentOf = (d: EDoc) => props.docs.find((x) => x.id === d.consent_id)
function approval(d: EDoc) {
  if (d.kind === 'safe' || d.kind === 'consent') return ''
  if (d.consent_outside) return 'Approved outside Finvry'
  const c = consentOf(d); if (!c) return 'Needs board approval'
  return c.status === 'signed' ? 'Board approved' : 'Board consent waiting for signatures'
}
function state(d: EDoc) {
  if (d.status === 'void') return 'Withdrawn'
  const left = d.signers.filter((s) => !s.signed_at).length
  if (d.status === 'sent') return left + ' of ' + d.signers.length + ' still to sign'
  if (d.kind === 'consent') return 'Signed ' + day(d.completed_at)
  return d.applied_id ? 'Signed · on the cap table' : 'Signed · waiting for board approval'
}
</script>
<template>
  <div class="ed">
    <div class="card pad0"><div class="ch"><h3>Documents for signature</h3><div class="row"><button class="btn secondary sm" @click="emit('send', 'convertible')">SAFE</button><button class="btn secondary sm" @click="emit('send', 'grant')">Option grant</button><button class="btn secondary sm" @click="emit('send', 'issuance')">Share purchase</button><button class="btn sm" @click="emit('consent', [])">Board consent</button></div></div>
      <p v-if="msg" class="error pad">{{ msg }}</p>
      <div v-for="d in docs" :key="d.id" class="dc" :class="{ off: d.status === 'void' }">
        <div class="dh"><span class="dt"><b>{{ d.title }}</b><em>{{ KIND[d.kind] }} · sent {{ day(d.created_at) }} · {{ state(d) }}</em><em v-if="approval(d)" :class="{ warn: approval(d) === 'Needs board approval' }">{{ approval(d) }}</em></span>
          <span class="da"><button v-if="d.document_id" class="lk" @click="openDoc(d.document_id)">Signed PDF</button>
            <template v-if="approval(d) === 'Needs board approval' && d.status !== 'void'"><button class="lk" @click="emit('consent', [d.id])">Draft board consent</button><button class="lk" :disabled="busy === d.id" @click="act({ action: 'approve', id: d.id, outside: true }, d.id)">Approved outside Finvry</button></template>
            <button v-if="d.status === 'sent'" class="lk red" :disabled="busy === d.id" @click="act({ action: 'void', id: d.id }, d.id)">Withdraw</button></span></div>
        <div class="sg"><span v-for="s in d.signers" :key="s.id" :class="{ ok: s.signed_at }"><b>{{ s.name }}</b><em>{{ s.role === 'company' ? 'Company' : s.role === 'holder' ? 'Holder' : 'Director' }} · {{ s.signed_at ? 'signed ' + day(s.signed_at) : s.viewed_at ? 'opened, not signed' : 'not opened' }}</em><button v-if="!s.signed_at && d.status === 'sent'" class="lk" :disabled="busy === s.id" @click="act({ action: 'remind', signer_id: s.id }, s.id)">Remind</button></span></div>
      </div>
      <EmptyState v-if="!docs.length" compact icon="sign" title="Nothing sent for signature yet" text="Send a SAFE, option grant or share purchase to sign." />
    </div>
  </div>
</template>
<style scoped>
.ch { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); flex-wrap: wrap; } .ch h3 { margin: 0; font-size: 15px; } .row { display: flex; gap: 6px; flex-wrap: wrap; } .pad0 { padding: 0; } .pad { padding: 8px 16px; }
.dc { padding: 12px 16px; border-bottom: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 8px; } .dc.off { opacity: .55; }
.dh { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; } .dt { display: flex; flex-direction: column; gap: 2px; } .dt b { font-size: 14px; font-weight: 600; } .dt em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .dt em.warn { color: #9a6700; }
.da { display: flex; gap: 14px; flex-wrap: wrap; justify-content: flex-end; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); }
.sg { display: flex; gap: 8px; flex-wrap: wrap; } .sg span { display: flex; align-items: center; gap: 8px; border: 1px solid var(--c-rule); padding: 6px 10px; font-size: 12.5px; } .sg b { font-weight: 500; } .sg em { font-style: normal; color: var(--c-muted); } .sg .ok { background: var(--c-paper-3); }
.error { color: var(--c-danger); margin: 0; }
</style>
