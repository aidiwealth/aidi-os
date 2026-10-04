<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useHead({ title: 'Messages' })
const { data, refresh } = await usePortalFetch<{ id: string; from_team: boolean; body: string; created_at: string; author: string | null }[]>('/api/portal/messages')
const text = ref(''); const msg = ref(''); const busy = ref(false)
async function send() { busy.value = true; msg.value = ''; try { await $fetch('/api/portal/messages', { method: 'POST', body: { body: text.value } }); text.value = ''; await refresh() } catch (e) { msg.value = portalErr(e) } finally { busy.value = false } }
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>
<template>
  <section v-if="data" class="wrap">
    <ClientTabs />
    <h1>Messages</h1>
    <form class="card comp" @submit.prevent="send"><textarea v-model="text" rows="3" maxlength="5000" placeholder="Write to our team" required /><div class="row"><span class="mut">We reply here and by email.</span><button class="btn" type="submit" :disabled="busy || !text.trim()">Send</button></div><p v-if="msg" class="error">{{ msg }}</p></form>
    <div class="thread"><div v-for="m in data" :key="m.id" class="m" :class="{ team: m.from_team }"><span class="w">{{ m.from_team ? (m.author ?? 'Our team') : 'You' }} · {{ when(m.created_at) }}</span><p>{{ m.body }}</p></div>
      <p v-if="!data.length" class="mut">No messages yet.</p></div>
  </section>
</template>
<style scoped>
.wrap { max-width: 760px; } h1 { margin: 0 0 14px; } .comp { display: flex; flex-direction: column; gap: 10px; } textarea { font: inherit; font-size: 14.5px; padding: 10px 12px; border: 1px solid var(--c-rule-strong); }
.row { display: flex; justify-content: space-between; align-items: center; } .mut { color: var(--c-muted); font-size: 13px; } .error { color: var(--c-danger); margin: 0; }
.thread { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; } .m { background: #fff; border: 1px solid var(--c-rule); padding: 12px 16px; max-width: 85%; align-self: flex-end; } .m.team { align-self: flex-start; border-left: 3px solid var(--c-blue-deep); }
.w { font-size: 12px; color: var(--c-muted); } .m p { margin: 6px 0 0; white-space: pre-wrap; font-size: 14.5px; }
</style>
