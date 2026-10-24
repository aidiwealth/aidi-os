<script setup lang="ts">
// Accounts that come in by statement (banks the live feed does not reach, such as Nigerian banks): the same cards as
// live accounts, with the latest balance the statements show. Manage lists each account's statements, to add a newer
// one to the same account, delete one, or clear the account and start again.
interface Up { id: string; file_name: string | null; file_kind: string; period_start: string | null; period_end: string | null; added: number; read: number; created_at: string }
export interface UpAcc { key: string; label: string; entity_id: string | null; entity: string | null; currency: string; balance: number | null; as_of: string | null; count: number; from: string | null; to: string | null; sheet: boolean; uploads: Up[] }
const props = defineProps<{ data: { currency: string; total: number; accounts: UpAcc[] } | null; group?: boolean }>()
const emit = defineEmits<{ upload: [a: UpAcc | null]; changed: [] }>()
const { sf } = await useCoScope()
const manage = ref(false), open = ref(''), busy = ref(''), msg = ref('')
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€', KES: 'KSh ', GHS: 'GH₵', ZAR: 'R ' }
const fmt = (v: number | null, c: string) => (v === null ? '—' : (SYM[c] ?? c + ' ') + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const day = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
// "GTBank current ··1234" → bank "GTBank", the rest as the account, the digits as the number.
const parts = (l: string) => { const mk = l.match(/(?:··|\*{2,}|x{2,}|#)\s*(\d{3,})\s*$/i)?.[1] ?? null, rest = l.replace(/(?:··|\*{2,}|x{2,}|#)\s*\d{3,}\s*$/i, '').trim(), [bank, ...more] = rest.split(/\s+/); return { bank: bank ?? l, name: more.join(' ') || 'Account', mask: mk } }
async function del(a: UpAcc, u: Up) {
  if (!await askConfirm('Its ' + u.added + ' payment' + (u.added === 1 ? '' : 's') + ' are removed from ' + a.label + '.', { title: 'Delete this statement?', ok: 'Delete', danger: true })) return
  busy.value = u.id; msg.value = ''
  try { await sf('/api/treasury/uploads/' + u.id, { method: 'DELETE' }); emit('changed') } catch (e) { msg.value = err(e) } finally { busy.value = '' }
}
async function clear(a: UpAcc) {
  if (!await askConfirm('All ' + a.count.toLocaleString('en-US') + ' payments and statements are removed.', { title: 'Clear ' + a.label + '?', ok: 'Clear account', danger: true })) return
  busy.value = a.key; msg.value = ''
  try { await sf('/api/treasury/accounts/clear', { method: 'POST', body: { label: a.label, entity_id: a.entity_id } }); emit('changed') } catch (e) { msg.value = err(e) } finally { busy.value = '' }
}
</script>
<template>
  <div v-if="data && data.accounts.length" class="bf">
    <div class="top">
      <div class="tt"><span class="tag">Statements</span><b>Uploaded accounts</b><span class="tot">{{ fmt(data.total, data.currency) }}</span><span class="mut">{{ data.accounts.length }} account{{ data.accounts.length === 1 ? '' : 's' }}</span></div>
      <div class="acts"><button class="lk" type="button" @click="manage = !manage">{{ manage ? 'Done' : 'Manage' }}</button><button class="btn sm secondary" type="button" @click="emit('upload', null)">+ Add account</button></div>
    </div>
    <div class="cards">
      <button v-for="a in data.accounts" :key="a.key" type="button" class="bc" :title="'Upload a newer statement to ' + a.label" @click="emit('upload', a)">
        <div class="r1"><span class="inst">{{ parts(a.label).bank }}</span><span class="mask">{{ parts(a.label).mask ? '•• ' + parts(a.label).mask : a.currency }}</span></div>
        <div class="nm" :title="a.label">{{ parts(a.label).name }}<em v-if="group && a.entity">{{ a.entity }}</em></div>
        <div class="bal">{{ fmt(a.balance, a.currency) }}</div>
        <div class="av">{{ a.as_of ? 'As of ' + day(a.as_of) : day(a.from) + ' to ' + day(a.to) }}<span class="plus">+ Statement</span></div>
      </button>
    </div>
    <div v-if="manage" class="mg">
      <div v-for="a in data.accounts" :key="a.key" class="acc">
        <button class="ah" type="button" :aria-expanded="open === a.key" @click="open = open === a.key ? '' : a.key"><b>{{ a.label }}</b><span class="mut">{{ group && a.entity ? a.entity + ' · ' : '' }}{{ a.count.toLocaleString('en-US') }} payments{{ a.uploads.length ? ' · ' + a.uploads.length + ' statement' + (a.uploads.length === 1 ? '' : 's') : '' }}</span>
          <svg :class="{ up: open === a.key }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg></button>
        <div v-if="open === a.key" class="ab">
          <div v-for="u in a.uploads" :key="u.id" class="ur"><span class="fn">{{ u.file_name ?? 'Statement' }}</span><span class="mut">{{ day(u.period_start) }} – {{ day(u.period_end) }}</span>
            <button class="lk red" type="button" :disabled="busy === u.id" @click="del(a, u)">{{ busy === u.id ? 'Deleting…' : 'Delete' }}</button></div>
          <p v-if="!a.uploads.length" class="mut ur">Older upload or linked sheet</p>
          <div class="aa"><button class="lk" type="button" @click="emit('upload', a)">+ Upload statement</button><button class="lk red" type="button" :disabled="busy === a.key" @click="clear(a)">{{ busy === a.key ? 'Clearing…' : 'Clear account' }}</button></div>
        </div>
      </div>
    </div>
    <p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.bf { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; background: #fff; border: 1px solid var(--c-line-soft, var(--c-rule)); }
.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.tt { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; min-width: 0; } .tt b { font-size: 14px; font-weight: 600; color: var(--c-ink); }
.tag { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); align-self: center; }
.tot { font-size: 18px; font-weight: 600; color: var(--c-navy); font-variant-numeric: tabular-nums; } .mut { color: var(--c-muted); font-size: 12.5px; }
.acts { display: flex; align-items: center; gap: 12px; } .btn.sm { height: 30px; padding: 0 12px; font-size: 13px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; white-space: nowrap; } .lk.red { color: var(--c-danger); } .lk:disabled { opacity: .5; cursor: default; }
.cards { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
.bc { position: relative; flex: 0 0 216px; height: 128px; padding: 8px 13px; display: flex; flex-direction: column; color: #fff; overflow: hidden; border: 0; font: inherit; text-align: left; cursor: pointer;
  background: linear-gradient(135deg, #0c1a2e 0%, #183456 100%); }
.bc::after { content: ''; position: absolute; right: -36px; top: -46px; width: 120px; height: 120px; border-radius: 50%; background: rgba(120,170,230,.16); pointer-events: none; }
.r1 { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; opacity: .8; } .inst { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .mask { font-variant-numeric: tabular-nums; white-space: nowrap; }
.nm { margin-top: 3px; font-size: 12px; opacity: .75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .nm em { font-style: normal; margin-left: 6px; opacity: .8; }
.bal { margin-top: auto; font-size: 18px; font-weight: 600; letter-spacing: -.01em; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.av { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; opacity: .7; white-space: nowrap; } .plus { opacity: 0; transition: opacity .15s; } .bc:hover .plus, .bc:focus-visible .plus { opacity: 1; }
.mg { display: flex; flex-direction: column; border-top: 1px solid var(--c-rule); }
.acc { border-bottom: 1px solid var(--c-rule); }
.ah { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 0; background: none; border: 0; font: inherit; text-align: left; cursor: pointer; } .ah b { font-size: 13.5px; font-weight: 600; color: var(--c-ink); } .ah .mut { flex: 1; }
.ah svg { width: 16px; height: 16px; color: var(--c-muted); transition: transform .15s; } .ah svg.up { transform: rotate(180deg); }
.ab { display: flex; flex-direction: column; gap: 2px; padding: 0 0 10px; } .aa { display: flex; gap: 16px; justify-content: flex-end; padding-top: 6px; }
.ur { display: flex; align-items: center; gap: 10px; padding: 4px 0 4px 14px; font-size: 13px; margin: 0; } .ur .fn { color: var(--c-ink); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ur .lk { margin-left: auto; }
.error { color: var(--c-danger); font-size: 13px; margin: 0; }
</style>
