<script setup lang="ts">
// Who investor reports come from: your own address (e.g. company@yourcompany.com, once its DNS records are added and
// verified) or Finvry's sending address under your sender name; and where replies go.
interface Rec { record: string; name: string; type: string; value: string; priority?: number; status?: string }
const { data, refresh } = await useFetch<{ email?: string; reply_to?: string; domain?: string; status?: string; records?: Rec[]; default_from: string }>('/api/updates/sender', { key: 'update-sender' })
const f = reactive({ email: '', reply_to: '' })
watchEffect(() => { if (data.value) { f.email = data.value.email ?? ''; f.reply_to = data.value.reply_to ?? '' } })
const busy = ref(''), msg = ref(''), ok = ref('')
async function act(action: string) {
  busy.value = action; msg.value = ''; ok.value = ''
  try { await $fetch('/api/updates/sender', { method: 'POST', body: { action, email: f.email, reply_to: f.reply_to } }); await refresh()
    ok.value = action === 'verify' ? (data.value?.status === 'verified' ? 'Verified. Reports now come from ' + data.value.email + '.' : 'Not verified yet. DNS changes can take up to a few hours; try again later.') : action === 'remove' ? 'Removed. Reports come from the Finvry address again.' : 'Saved.' }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = '' }
}
const copy = async (v: string) => { try { await navigator.clipboard.writeText(v); ok.value = 'Copied.' } catch { /* ignore */ } }
const verified = computed(() => data.value?.status === 'verified')
</script>
<template>
  <div v-if="data" class="rs">
    <div class="now"><span class="mut">Reports come from</span><b>{{ verified ? data.email : data.default_from.replace(/^[^<]*</, '').replace('>', '') }}</b>
      <span class="mut">{{ verified ? 'Your own address, verified.' : data.domain ? 'Your address is waiting for its DNS records to be verified.' : 'Finvry\'s sending address, under your sender name (set on each report).' }}</span></div>
    <label>Send from your own address<input v-model="f.email" type="email" placeholder="company@yourcompany.com" maxlength="254" autocomplete="off"></label>
    <p class="mut">Like other investor-update tools: add a few DNS records to your domain once, and reports (and test emails) come from this address. Gmail, Outlook and other personal addresses can't be used.</p>
    <label>Replies go to<input v-model="f.reply_to" type="email" :placeholder="f.email || 'you@yourcompany.com'" maxlength="254"></label>
    <div class="act"><button v-if="data.domain" class="lk red" :disabled="!!busy" @click="act('remove')">Stop using my address</button><span /><button class="btn secondary" :disabled="!!busy" @click="act('reply_to')">Save reply-to only</button><button class="btn" :disabled="!!busy || !f.email" @click="act('set')">{{ busy === 'set' ? 'Setting up…' : data.domain ? 'Save' : 'Set up this address' }}</button></div>
    <template v-if="data.domain && !verified">
      <h4>Add these records to {{ data.domain }}'s DNS</h4>
      <p class="mut">In your domain provider (GoDaddy, Cloudflare, Namecheap, Google Domains…), add each record below exactly, then press Verify. It can take a few minutes to a few hours.</p>
      <div class="tbl"><div class="rw hd"><span>Type</span><span>Name</span><span>Value</span><span>Priority</span><span>Status</span></div>
        <div v-for="(r, i) in data.records" :key="i" class="rw"><span>{{ r.type }}</span><button class="cp" :title="'Copy ' + r.name" @click="copy(r.name)">{{ r.name }}</button><button class="cp v" title="Copy value" @click="copy(r.value)">{{ r.value }}</button><span>{{ r.priority ?? '' }}</span><span :class="r.status === 'verified' ? 'okk' : 'pend'">{{ r.status === 'verified' ? 'Verified' : 'Waiting' }}</span></div></div>
      <div class="act"><span /><button class="btn" :disabled="!!busy" @click="act('verify')">{{ busy === 'verify' ? 'Checking…' : 'Verify' }}</button></div>
    </template>
    <p v-if="ok" class="okm">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.rs { display: flex; flex-direction: column; gap: 12px; } .now { background: #f4f3ef; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; } .now b { font-size: 15px; color: var(--c-navy); word-break: break-all; }
label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--c-muted); } input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); color: var(--c-ink); }
.mut { color: var(--c-muted); font-size: 12.5px; margin: 0; } h4 { margin: 8px 0 0; font-size: 14px; color: var(--c-navy); }
.act { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .act > span { flex: 1; } .lk { background: none; border: 0; font: inherit; font-size: 13px; cursor: pointer; } .red { color: var(--c-danger); }
.tbl { border: 1px solid var(--c-rule); overflow-x: auto; } .rw { display: grid; grid-template-columns: 60px minmax(140px, 1.2fr) minmax(200px, 2fr) 60px 70px; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--c-rule); font-size: 12.5px; align-items: center; min-width: 560px; }
.rw.hd { border-top: 0; color: var(--c-muted); background: #fbfaf8; } .cp { background: none; border: 0; padding: 0; font: inherit; font-family: ui-monospace, Menlo, monospace; font-size: 12px; text-align: left; color: var(--c-ink); cursor: copy; word-break: break-all; } .cp.v { max-height: 60px; overflow: hidden; }
.okk { color: var(--c-blue-deep); } .pend { color: var(--c-warn); } .okm { color: var(--c-blue-deep); margin: 0; font-size: 13px; } .error { color: var(--c-danger); margin: 0; }
</style>
