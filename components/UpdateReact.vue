<script setup lang="ts">
// Investor: react to the update with an emoji or leave a note for the company.
const props = defineProps<{ token: string; company: string }>()
const R: [string, string, string][] = [['up', '👍', 'Like'], ['love', '❤️', 'Love'], ['party', '🎉', 'Celebrate'], ['rocket', '🚀', 'Great progress'], ['clap', '👏', 'Well done'], ['think', '🤔', 'Questions']]
const mine = ref<string[]>([]); const note = ref(''); const sent = ref(false); const showNote = ref(false); const msg = ref('')
const route = useRoute()
async function toggle(k: string, on = !mine.value.includes(k)) { try { mine.value = (await $fetch<{ mine: string[] }>('/api/public/u/' + props.token + '/react', { method: 'POST', body: { emoji: k, on } })).mine } catch { msg.value = 'Could not save your reaction.' } }
async function sendNote() { if (!note.value.trim()) return; try { await $fetch('/api/public/u/' + props.token + '/react', { method: 'POST', body: { note: note.value } }); sent.value = true; note.value = '' } catch { msg.value = 'Could not send your note.' } }
onMounted(async () => {
  try { mine.value = (await $fetch<{ mine: string[] }>('/api/public/u/' + props.token + '/react')).mine } catch { /* ignore */ }
  const r = String(route.query.react ?? ''); if (R.some(([k]) => k === r) && !mine.value.includes(r)) await toggle(r, true)
  if (route.query.reply) showNote.value = true
})
</script>
<template>
  <div class="card ur"><b>React to this update</b><div class="em"><button v-for="[k, e, l] in R" :key="k" type="button" :class="{ on: mine.includes(k) }" :title="l" @click="toggle(k)">{{ e }}</button></div>
    <button v-if="!showNote && !sent" type="button" class="lk" @click="showNote = true">Leave a note for {{ company }}</button>
    <div v-if="showNote && !sent" class="nt"><textarea v-model="note" rows="3" maxlength="2000" :placeholder="'Your note to ' + company + ' (only they see it)'" /><button class="btn sm" type="button" :disabled="!note.trim()" @click="sendNote">Send note</button></div>
    <p v-if="sent" class="ok">Thanks. {{ company }} has your note.</p><p v-if="msg" class="error">{{ msg }}</p></div>
</template>
<style scoped>
.ur { margin: 18px 0; display: flex; flex-direction: column; gap: 10px; } .em { display: flex; gap: 8px; flex-wrap: wrap; } .em button { font-size: 22px; line-height: 1; padding: 8px 12px; background: #fff; border: 1px solid var(--c-rule); border-radius: 20px; cursor: pointer; transition: transform .1s; } .em button:hover { transform: scale(1.08); } .em button.on { background: var(--c-signal-soft); border-color: var(--c-blue-deep); }
.lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 13.5px; padding: 0; align-self: flex-start; } .nt { display: flex; flex-direction: column; gap: 8px; } .nt textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); } .btn.sm { align-self: flex-start; height: 32px; padding: 0 12px; font-size: 13px; } .ok { color: var(--c-ok); margin: 0; } .error { color: var(--c-danger); margin: 0; }
</style>
