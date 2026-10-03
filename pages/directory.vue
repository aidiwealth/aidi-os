<script setup lang="ts">
useHead({ title: 'Fund services' })
interface Pro { id: string; name: string; firm: string | null; title: string | null; services: string[]; jurisdictions: string[]; bio: string | null; website: string | null; photo_url: string | null; featured: boolean }
const { data } = await useFetch<{ professionals: Pro[]; services: Record<string, string> }>('/api/directory')
const svc = ref(''); const country = ref('')
const countries = computed(() => [...new Set((data.value?.professionals ?? []).flatMap((p) => p.jurisdictions))].sort())
const shown = computed(() => (data.value?.professionals ?? []).filter((p) => (!svc.value || p.services.includes(svc.value)) && (!country.value || p.jurisdictions.includes(country.value))))
const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()
const open = ref<Pro | null>(null)
const f = reactive({ message: '', consent: false })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
function ask(p: Pro) { open.value = p; f.message = ''; f.consent = false; msg.value = ''; ok.value = '' }
async function send() {
  if (!open.value) return
  busy.value = true; msg.value = ''
  try { await $fetch('/api/directory/' + open.value.id + '/intro', { method: 'POST', body: { message: f.message, consent: f.consent } }); ok.value = 'Sent. ' + open.value.name + ' will reply to you by email; a copy is in your inbox.'; open.value = null }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send.' } finally { busy.value = false }
}
</script>

<template>
  <section v-if="data">
    <div class="head"><div><h1>Fund services</h1><p class="lead">Independent fund lawyers, administrators, auditors and advisers for the regulated side of running a fund: formation, KYC, money movement, tax and filings.</p></div>
      <div class="tools"><select v-model="svc" aria-label="Service"><option value="">All services</option><option v-for="(l, k) in data.services" :key="k" :value="k">{{ l }}</option></select>
        <select v-model="country" aria-label="Country"><option value="">All countries</option><option v-for="c in countries" :key="c" :value="c">{{ c }}</option></select></div></div>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p>
    <div class="grid">
      <article v-for="p in shown" :key="p.id" class="card pro" :class="{ feat: p.featured }">
        <div class="ph"><img v-if="p.photo_url" :src="p.photo_url" :alt="p.name" class="av"><span v-else class="av ini">{{ initials(p.name) }}</span>
          <div><h2>{{ p.name }}</h2><p class="sub">{{ [p.title, p.firm].filter(Boolean).join(', ') }}</p></div><span v-if="p.featured" class="badge">Featured</span></div>
        <p v-if="p.bio" class="bio">{{ p.bio }}</p>
        <div class="tags"><span v-for="s in p.services" :key="s" class="tag">{{ data.services[s] ?? s }}</span></div>
        <p v-if="p.jurisdictions.length" class="sub">{{ p.jurisdictions.join(' · ') }}</p>
        <div class="acts"><button class="btn" type="button" @click="ask(p)">Request an introduction</button><a v-if="p.website" :href="p.website" target="_blank" rel="noopener" class="btn secondary">Website</a></div>
      </article>
    </div>
    <p v-if="!shown.length" class="card muted">No professionals match yet. More firms are being added.</p>
    <p class="fine">Professionals listed are independent firms. Finvry does not provide legal, regulatory, tax or fund administration services, and does not endorse or supervise the professionals listed.</p>

    <div v-if="open" class="modal" role="dialog" aria-modal="true" @click.self="open = null">
      <form class="card dlg" @submit.prevent="send">
        <h2>Introduction to {{ open.name }}</h2>
        <p class="sub">{{ [open.title, open.firm].filter(Boolean).join(', ') }}</p>
        <label class="label">What do you need?<textarea v-model="f.message" rows="6" maxlength="2000" required placeholder="e.g. We are forming a $15m Delaware fund with a Nigerian feeder and need fund counsel and an administrator." /></label>
        <label class="chk"><input v-model="f.consent" type="checkbox" required> Share my name, email and organisation with {{ open.name }} so they can reply</label>
        <p v-if="msg" class="error">{{ msg }}</p>
        <div class="row"><button class="btn" type="submit" :disabled="busy || !f.consent">Send</button><button class="btn secondary" type="button" @click="open = null">Cancel</button></div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; } .lead { color: var(--c-muted); margin: 6px 0 0; max-width: 640px; }
.tools { display: flex; gap: 8px; } select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.pro { display: flex; flex-direction: column; gap: 10px; } .pro.feat { border-top: 3px solid var(--c-blue-deep); }
.ph { display: flex; gap: 12px; align-items: center; } .ph h2 { margin: 0; } .badge { margin-left: auto; font-size: 11px; font-weight: 500; color: var(--c-blue-deep); background: var(--c-signal-soft); padding: 2px 8px; align-self: flex-start; }
.av { width: 48px; height: 48px; object-fit: cover; flex: none; } .ini { display: grid; place-items: center; background: var(--c-navy); color: #fff; font-weight: 600; }
.sub { font-size: 12.5px; color: var(--c-muted); margin: 0; } .bio { font-size: 13.5px; line-height: 1.55; margin: 0; color: var(--c-ink-soft); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; } .tag { font-size: 12px; background: var(--c-paper-2); padding: 3px 8px; color: var(--c-ink-soft); }
.acts { display: flex; gap: 8px; margin-top: auto; padding-top: 4px; }
.fine { font-size: 12px; color: var(--c-muted); margin-top: 18px; max-width: 760px; }
.modal { position: fixed; inset: 0; background: rgba(15,17,21,.45); display: grid; place-items: center; z-index: 80; padding: 16px; }
.dlg { width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 12px; } .dlg h2 { margin: 0; } .dlg label { display: flex; flex-direction: column; gap: 6px; }
.chk { flex-direction: row !important; align-items: flex-start; font-size: 13px; color: var(--c-ink-soft); } .chk input { margin-top: 3px; }
.row { display: flex; gap: 10px; } .muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); margin: 0; }
</style>
