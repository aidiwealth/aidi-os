<script setup lang="ts">
// Attach a document (a SAFE, note, share purchase agreement, certificate or side letter) to a holder already on the cap
// table, and to one of their SAFEs / notes or share issuances. Filed in Documents under Financing and, unless unticked,
// in the data room's Financing room, in a folder for its funding round.
interface H { id: string; name: string }
interface C { id: string; holder_id: string; kind: string; amount: number; currency?: string; issued_on: string | null }
interface I { id: string; holder_id: string; class_id: string; shares: number; issued_on: string | null }
const props = defineProps<{ open: boolean; ct: string; holders: H[]; convertibles: C[]; issuances: I[]; classes: { id: string; name: string }[]; preset: { holder_id?: string; convertible_id?: string; issuance_id?: string } }>()
const emit = defineEmits<{ close: []; done: [] }>()
const ROUNDS = ['', 'Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Bridge', 'Common', 'Other']
const f = reactive({ holder_id: '', link: '', kind: 'safe', round: '', room: true, busy: false, msg: '' })
const files = ref<File[]>([])
watch(() => props.open, (o) => {
  if (!o) return
  const p = props.preset
  Object.assign(f, { holder_id: p.holder_id ?? props.holders[0]?.id ?? '', link: p.convertible_id ? 'c:' + p.convertible_id : p.issuance_id ? 'i:' + p.issuance_id : '', kind: p.issuance_id ? 'spa' : 'safe', round: '', room: true, busy: false, msg: '' })
  if (!p.convertible_id && !p.issuance_id) { const c = props.convertibles.find((x) => x.holder_id === f.holder_id); const i = props.issuances.find((x) => x.holder_id === f.holder_id); f.link = c ? 'c:' + c.id : i ? 'i:' + i.id : ''; f.kind = c ? (c.kind === 'note' ? 'note' : 'safe') : i ? 'spa' : 'other' }
  files.value = []
}, { immediate: true })
const cls = (id: string) => props.classes.find((c) => c.id === id)?.name ?? 'shares'
const money = (v: number, c?: string) => (c && c !== 'USD' ? c + ' ' : '$') + Math.round(v).toLocaleString('en-US')
const links = computed(() => [...props.convertibles.filter((c) => c.holder_id === f.holder_id).map((c) => ({ v: 'c:' + c.id, l: (c.kind === 'note' ? 'Note' : 'SAFE') + ' · ' + money(c.amount, c.currency) + (c.issued_on ? ' · ' + c.issued_on : '') })),
  ...props.issuances.filter((i) => i.holder_id === f.holder_id).map((i) => ({ v: 'i:' + i.id, l: Number(i.shares).toLocaleString('en-US') + ' ' + cls(i.class_id) + (i.issued_on ? ' · ' + i.issued_on : '') }))])
watch(() => f.link, (v) => { if (v.startsWith('c:')) { const c = props.convertibles.find((x) => 'c:' + x.id === v); f.kind = c?.kind === 'note' ? 'note' : 'safe' } else if (v.startsWith('i:') && ['safe', 'note'].includes(f.kind)) f.kind = 'spa' })
function pick(e: Event) { const list = Array.from(((e.target as HTMLInputElement).files ?? []) as ArrayLike<File>); for (const x of list) if (!files.value.some((y) => y.name === x.name && y.size === x.size)) files.value.push(x); files.value = files.value.slice(0, 10) }
async function save() {
  if (!f.holder_id || !files.value.length) { f.msg = 'Choose the holder and add the document.'; return }
  f.busy = true; f.msg = ''
  const fd = new FormData(); fd.append('ct', props.ct); fd.append('holder_id', f.holder_id); fd.append('kind', f.kind); fd.append('room', f.room ? '1' : '0')
  if (f.round) fd.append('round', f.round)
  if (f.link.startsWith('c:')) fd.append('convertible_id', f.link.slice(2)); else if (f.link.startsWith('i:')) fd.append('issuance_id', f.link.slice(2))
  for (const x of files.value) fd.append('file', x, x.name)
  try { await $fetch('/api/equity/docs', { method: 'POST', body: fd }); emit('done'); emit('close') }
  catch (e) { f.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not attach it.' } finally { f.busy = false }
}
</script>
<template>
  <AppModal :open="open" title="Attach a document" wide @close="emit('close')">
    <div class="ad">
      <div class="g2"><label class="label w">Holder<select v-model="f.holder_id" @change="f.link = ''"><option v-for="h in holders" :key="h.id" :value="h.id">{{ h.name }}</option></select></label>
        <label class="label">For<select v-model="f.link"><option value="">The holder in general</option><option v-for="l in links" :key="l.v" :value="l.v">{{ l.l }}</option></select></label>
        <label class="label">Document<select v-model="f.kind"><option value="safe">SAFE</option><option value="note">Convertible note</option><option value="spa">Share purchase agreement</option><option value="certificate">Share certificate</option><option value="side_letter">Side letter</option><option value="other">Other</option></select></label>
      <label class="label">Funding round<select v-model="f.round"><option v-for="r in ROUNDS" :key="r" :value="r">{{ r || 'Work it out (from the class or document)' }}</option></select></label></div>
      <DropZone accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.xlsx" multiple :disabled="f.busy" label="Drop the signed document here" hint="PDF, Word or image · or click to choose" @change="pick" />
      <ul v-if="files.length" class="fl"><li v-for="(x, i) in files" :key="x.name + x.size"><span>{{ x.name }}</span><button type="button" class="lk" @click="files.splice(i, 1)">Remove</button></li></ul>
      <label class="ck"><input v-model="f.room" type="checkbox"> Also add it to the data room (Financing room, in a folder for its round)</label>
      <p class="mut">It is filed in Documents under Financing either way.</p>
      <p v-if="f.msg" class="error">{{ f.msg }}</p>
    </div>
    <template #foot><button class="btn secondary" @click="emit('close')">Cancel</button><button class="btn" :disabled="f.busy || !files.length" @click="save">{{ f.busy ? 'Attaching…' : 'Attach' }}</button></template>
  </AppModal>
</template>
<style scoped>
.ad { display: flex; flex-direction: column; gap: 14px; } .g2 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 14px; } .w { grid-column: 1 / -1; }
label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-ink-soft); min-width: 0; margin: 0; text-transform: none; letter-spacing: 0; } select { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); text-overflow: ellipsis; }
@media (max-width: 700px) { .g2 { grid-template-columns: 1fr; } }
.fl { list-style: none; margin: 0; padding: 0; font-size: 13.5px; } .fl li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--c-rule); }
.ck { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .mut { margin: 0; font-size: 12.5px; color: var(--c-muted); } .error { color: var(--c-danger); font-size: 13px; margin: 0; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
</style>
