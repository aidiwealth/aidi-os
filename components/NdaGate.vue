<script setup lang="ts">
// Read and sign a company's NDA before viewing. The signature id is remembered in this browser for this company.
const props = defineProps<{ company: string; text: string; kind: 'page' | 'room' | 'update'; refKey: string; orgKey: string }>()
const emit = defineEmits<{ signed: [id: string] }>()
const f = reactive({ name: '', email: '', company: '', signature: '', agree: false })
const msg = ref(''); const busy = ref(false)
async function sign() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/public/nda', { method: 'POST', body: { kind: props.kind, ref: props.refKey, ...f } }); try { localStorage.setItem('finvry-nda-' + props.orgKey, r.id) } catch { /* private mode */ } emit('signed', r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not sign.' } finally { busy.value = false } }
</script>
<template>
  <div class="ng"><p class="label">Confidential</p><h1>{{ company }} asks you to sign an NDA</h1><p class="lead">Read the agreement, then sign by typing your full name to continue.</p>
    <div class="txt" v-html="renderMarkdown(text)" />
    <form class="frm" @submit.prevent="sign"><div class="g2"><label class="label">Full name<input v-model="f.name" required maxlength="200" autocomplete="name"></label><label class="label">Email<input v-model="f.email" type="email" required maxlength="254" autocomplete="email"></label></div>
      <label class="label">Company or fund (optional)<input v-model="f.company" maxlength="200" autocomplete="organization"></label>
      <label class="label">Signature: type your full name<input v-model="f.signature" required maxlength="200" class="sig" :placeholder="f.name || 'Your full name'"></label>
      <label class="cb"><input v-model="f.agree" type="checkbox" required> I have read and agree to this NDA, and I am signing it electronically.</label>
      <button class="btn" type="submit" :disabled="busy || !f.agree">{{ busy ? 'Signing…' : 'Sign and continue' }}</button><p v-if="msg" class="error">{{ msg }}</p></form></div>
</template>
<style scoped>
.ng { max-width: 760px; margin: 0 auto; } .ng h1 { margin: 4px 0 6px; } .lead { color: var(--c-ink-soft); } .txt :deep(p) { margin: 0 0 8px; } .txt :deep(ol), .txt :deep(ul) { padding-left: 20px; margin: 0 0 8px; } .txt { font-family: inherit; font-size: 13.5px; line-height: 1.6; background: #f6f5f1; color: #1d1d1f; padding: 16px; max-height: 340px; overflow-y: auto; border: 1px solid var(--c-rule); }
.frm { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
input { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: #1d1d1f; } .sig { font-family: 'Brush Script MT', cursive; font-size: 24px; } .cb { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; } .cb input { width: auto; margin-top: 3px; }
.btn { align-self: flex-start; } .error { color: var(--c-danger); margin: 0; } @media (max-width: 640px) { .g2 { grid-template-columns: 1fr; } }
</style>
