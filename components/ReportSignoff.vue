<script setup lang="ts">
// Footer and sign-off for investor reports: closing line, signer photo, name, title, and the footer text.
const emit = defineEmits<{ close: [] }>()
const { data, refresh } = await useFetch<{ enabled: boolean; closing: string; name: string; title: string; photo_id: string | null; footer: string }>('/api/updates/signoff', { key: 'signoff' })
const f = reactive({ enabled: true, closing: 'Best,', name: '', title: '', photo_id: null as string | null, footer: '' })
watchEffect(() => { if (data.value) Object.assign(f, data.value) })
const busy = ref(''), msg = ref(''), ok = ref(false)
async function photo(ev: Event) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; busy.value = 'up'; const fd = new FormData(); fd.append('file', file)
  try { f.photo_id = (await $fetch<{ id: string }>('/api/updates/media', { method: 'POST', body: fd })).id } catch { msg.value = 'Could not upload the photo.' } finally { busy.value = '' } }
async function save() { busy.value = 'save'; msg.value = ''; try { await $fetch('/api/updates/signoff', { method: 'POST', body: { ...f } }); ok.value = true; await refresh(); setTimeout(() => emit('close'), 700) } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = '' } }
</script>
<template>
  <div class="so">
    <label class="cb"><input v-model="f.enabled" type="checkbox"> Sign off every investor report</label>
    <div class="g"><div class="ph"><img v-if="f.photo_id" :src="'/api/public/media/' + f.photo_id" alt=""><span v-else>{{ (f.name || '?').slice(0, 1).toUpperCase() }}</span><label class="up">{{ busy === 'up' ? 'Uploading…' : f.photo_id ? 'Change photo' : 'Add photo' }}<input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="photo"></label><button v-if="f.photo_id" type="button" class="lnk" @click="f.photo_id = null">Remove</button></div>
      <div class="fs"><label>Closing line<input v-model="f.closing" maxlength="120" placeholder="Best,"></label><label>Name<input v-model="f.name" maxlength="120" placeholder="Ada Okafor"></label><label>Title<input v-model="f.title" maxlength="160" placeholder="Co-founder & CEO, Zuri Labs"></label></div></div>
    <label>Footer text<textarea v-model="f.footer" rows="2" maxlength="400" placeholder="e.g. Zuri Labs Inc · 6472 Camden Ave, San Jose · Confidential: for investors only" /></label>
    <div class="pv"><p class="pl">Preview</p><div class="sig"><img v-if="f.photo_id" :src="'/api/public/media/' + f.photo_id" alt=""><div><em v-if="f.closing">{{ f.closing }}</em><b>{{ f.name || 'Your name' }}</b><span v-if="f.title">{{ f.title }}</span></div></div><p class="ft">{{ f.footer || 'Sent by your company with Finvry.' }} · Unsubscribe</p></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div class="act"><button type="button" class="btn secondary" @click="emit('close')">Cancel</button><button type="button" class="btn" :disabled="!!busy" @click="save">{{ ok ? 'Saved' : busy === 'save' ? 'Saving…' : 'Save' }}</button></div>
  </div>
</template>
<style scoped>
.so { display: flex; flex-direction: column; gap: 14px; } .cb { display: flex; gap: 8px; align-items: center; font-size: 14px; } label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--c-muted); }
input, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); color: var(--c-ink); } .cb input { width: auto; }
.g { display: grid; grid-template-columns: 120px 1fr; gap: 18px; align-items: start; } .ph { display: flex; flex-direction: column; align-items: center; gap: 8px; } .ph img, .ph > span { width: 84px; height: 84px; border-radius: 50%; object-fit: cover; background: var(--c-paper-2); display: grid; place-items: center; font-size: 30px; color: var(--c-muted); border: 1px solid var(--c-rule); }
.up { color: var(--c-blue-deep); cursor: pointer; font-size: 13px; } .lnk { background: none; border: 0; color: var(--c-muted); font: inherit; font-size: 12px; cursor: pointer; } .fs { display: flex; flex-direction: column; gap: 10px; }
.pv { background: #f4f3ef; padding: 16px; } .pl { margin: 0 0 10px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--c-muted); } .sig { display: flex; gap: 14px; align-items: center; background: #fff; padding: 16px 18px; border-top: 1px solid #e8e6e0; }
.sig img { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; box-shadow: 0 0 0 1px #e1ded6; } .sig div { display: flex; flex-direction: column; } .sig em { font-family: Georgia, serif; font-size: 14px; color: #4a4a4a; } .sig b { color: #0c1a2e; font-size: 15px; } .sig span { font-size: 12.5px; color: #6b6b6b; }
.ft { margin: 10px 0 0; font-size: 11.5px; color: #8a8a8a; } .act { display: flex; justify-content: flex-end; gap: 8px; } .error { color: var(--c-danger); margin: 0; }
</style>
