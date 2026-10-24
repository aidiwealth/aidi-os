<script setup lang="ts">
// A board consent (action by written consent of the directors) approving grants and share issues waiting on the cap
// table. AI drafts it from the list; directors sign by link; the approved items then go on the cap table.
const props = defineProps<{ open: boolean; ct: string; pending: { id: string; title: string }[]; preselect: string[]; me: { name: string; email: string } }>()
const emit = defineEmits<{ close: []; sent: [v: { id: string; my_link: string | null }] }>()
const pick = ref<string[]>([]), dirs = ref<{ name: string; email: string }[]>([]), date = ref(new Date().toISOString().slice(0, 10)), also = ref('')
const doc = ref<{ title: string; body: string } | null>(null), busy = ref(false), msg = ref('')
watch(() => props.open, (o) => { if (!o) return; pick.value = props.preselect.length ? [...props.preselect] : props.pending.map((p) => p.id); dirs.value = [{ name: props.me.name, email: props.me.email }]; doc.value = null; msg.value = ''; also.value = '' }, { immediate: true })
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
async function draft() { busy.value = true; msg.value = ''; try { doc.value = await $fetch('/api/equity/esign', { method: 'POST', body: { action: 'prepare_consent', ct: props.ct, doc_ids: pick.value, directors: dirs.value.map((d) => d.name.trim()).filter(Boolean), date: date.value, also: also.value } }) } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function send() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ id: string; my_link: string | null }>('/api/equity/esign', { method: 'POST', body: { action: 'send', ct: props.ct, kind: 'consent', title: doc.value!.title, body: doc.value!.body, consent_for: pick.value, signers: dirs.value.filter((d) => d.name.trim()).map((d) => ({ role: 'director', name: d.name.trim(), email: d.email.trim(), title: 'Director' })) } }); emit('sent', r) }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const ok = computed(() => dirs.value.length && dirs.value.every((d) => d.name.trim() && /@/.test(d.email)) && (pick.value.length || also.value.trim()))
</script>
<template>
  <AppModal :open="open" title="Board consent" wide @close="emit('close')">
    <div class="ec">
      <template v-if="!doc">
        <p class="lead">A written board consent for the items below. AI drafts it; directors sign by link.</p>
        <div class="box"><p class="bh">What it approves</p><label v-for="p in pending" :key="p.id" class="chk"><input v-model="pick" type="checkbox" :value="p.id"> {{ p.title }}</label><p v-if="!pending.length" class="mut">No grants or share issues are waiting for approval.</p>
          <label class="label">Anything else to approve (optional)<textarea v-model="also" rows="2" maxlength="3000" placeholder="e.g. Increase the option pool by 500,000 shares; adopt the 2026 Equity Incentive Plan" /></label></div>
        <div class="box"><p class="bh">Directors</p><div v-for="(d, i) in dirs" :key="i" class="dr"><input v-model="d.name" placeholder="Full name" maxlength="200"><input v-model="d.email" type="email" placeholder="Email" maxlength="254"><button class="lk red" :disabled="dirs.length < 2" @click="dirs.splice(i, 1)">Remove</button></div><button class="lk" @click="dirs.push({ name: '', email: '' })">+ Add a director</button></div>
        <label class="label sm">Effective date<input v-model="date" type="date"></label>
      </template>
      <template v-else><label class="label">Title<input v-model="doc.title" maxlength="200"></label><label class="label">Consent (Markdown; edit anything)<textarea v-model="doc.body" rows="18" class="mono" /></label><p class="mut">Each director gets a private link. Not legal advice.</p></template>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <template #foot><template v-if="!doc"><span class="sp" /><button class="btn secondary" @click="emit('close')">Cancel</button><button class="btn" :disabled="busy || !ok" @click="draft">{{ busy ? 'Drafting…' : 'Draft with AI' }}</button></template>
      <template v-else><button class="btn secondary" :disabled="busy" @click="doc = null">Back</button><span class="sp" /><button class="btn" :disabled="busy" @click="send">{{ busy ? 'Sending…' : 'Send to directors' }}</button></template></template>
  </AppModal>
</template>
<style scoped>
.ec { display: flex; flex-direction: column; gap: 12px; } .lead { margin: 0; color: var(--c-ink-soft); font-size: 14px; line-height: 1.55; } .mut { margin: 0; color: var(--c-muted); font-size: 13px; }
.box { border: 1px solid var(--c-rule); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; } .bh { margin: 0; font-weight: 600; font-size: 13.5px; }
.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } .label.sm { max-width: 220px; } .chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
.ec input:not([type="checkbox"]), .ec textarea { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px !important; line-height: 1.5; }
.dr { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; align-self: flex-start; } .lk.red { color: var(--c-danger); } .error { color: var(--c-danger); margin: 0; }
</style>
