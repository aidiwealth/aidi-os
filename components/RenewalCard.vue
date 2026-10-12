<script setup lang="ts">
// A recurring service (virtual office, registered agent, plan…): price, status, the current period as a bar from the
// start to the next renewal, and the virtual office address. The services team can edit it; clients see it read-only.
import { US_STATES } from '~/shared/countries'
interface Rn { code: string; name: string; amount_minor?: number | null; currency?: string | null; interval?: string | null; status?: string | null; next?: string | null; started?: string | null; details?: Record<string, string> | null; failures?: number; last_error?: string | null; calendarOnly?: boolean }
const props = withDefaults(defineProps<{ r: Rn; editable?: boolean; busy?: boolean }>(), { editable: false, busy: false })
const emit = defineEmits<{ save: [v: { started_on: string; next_date: string; country: string; state: string; address: string }]; status: [s: 'active' | 'suspended' | 'cancelled'] }>()
const today = new Date().toISOString().slice(0, 10)
const day = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const money = computed(() => props.r.amount_minor == null || !props.r.currency ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: props.r.currency, maximumFractionDigits: 2 }).format(props.r.amount_minor / 100))
const per = computed(() => (props.r.interval === 'month' ? 'month' : 'year'))
const daysLeft = computed(() => (props.r.next ? Math.round((new Date(props.r.next + 'T12:00:00').getTime() - Date.now()) / 864e5) : null))
// Progress through the current period (start of period = next renewal minus one period).
const pct = computed(() => { if (!props.r.next) return 0; const n = new Date(props.r.next + 'T12:00:00'); const s = new Date(n); if (per.value === 'month') s.setMonth(s.getMonth() - 1); else s.setFullYear(s.getFullYear() - 1); return Math.max(0, Math.min(100, ((Date.now() - s.getTime()) / (n.getTime() - s.getTime())) * 100)) })
const st = computed(() => (props.r.calendarOnly ? 'cal' : props.r.status === 'suspended' ? 'paused' : props.r.failures ? 'retry' : props.r.status === 'cancelled' ? 'off' : 'on'))
const ST: Record<string, string> = { on: 'Active', paused: 'Paused', retry: 'Retrying payment', off: 'Cancelled', cal: 'Not billing yet' }
const icon = computed(() => (props.r.code === 'virtual_office' ? 'office' : props.r.code === 'registered_agent' ? 'agent' : props.r.code.startsWith('plan') || props.r.code === 'plan' ? 'plan' : 'repeat'))
const addr = computed(() => props.r.details ?? {})
// Edit
const ed = reactive({ open: false, started_on: '', next_date: '', country: 'United States', state: '', address: '' })
function open() { Object.assign(ed, { open: true, started_on: props.r.started ?? '', next_date: props.r.next ?? '', country: addr.value.country || 'United States', state: addr.value.state || '', address: addr.value.address || '' }) }
function fromStart() { if (!ed.started_on) return; const m = per.value === 'month' ? 1 : 12; const b = new Date(ed.started_on + 'T00:00:00Z'); for (let k = 1; k < 1200; k++) { const d = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + m * k, Math.min(b.getUTCDate(), 28))); const iso = d.toISOString().slice(0, 10); if (iso >= today) { ed.next_date = iso; break } } }
function save() { emit('save', { started_on: ed.started_on, next_date: ed.next_date, country: ed.country, state: ed.country === 'Nigeria' ? 'Lagos' : ed.state, address: ed.address }); ed.open = false }
</script>

<template>
  <article class="rc" :class="'s-' + st">
    <header class="rh">
      <span class="ic" :data-i="icon"><svg v-if="icon === 'office'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 21V5l8-2v18M12 7l8 2v12M8 9h1M8 13h1M8 17h1M15 12h1M15 16h1M2 21h20" /></svg><svg v-else-if="icon === 'agent'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg><svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></svg></span>
      <div class="rt"><b>{{ r.name }}</b><span>{{ money ? money + ' / ' + per : 'Priced on its invoice' }}{{ r.calendarOnly ? ' · billing starts once its invoice is paid' : '' }}</span></div>
      <span class="pill" :class="st">{{ ST[st] }}</span>
    </header>

    <div v-if="r.next" class="per">
      <div class="dates"><span><em>{{ r.started ? 'Started' : 'This period' }}</em>{{ r.started ? day(r.started) : '—' }}</span><span class="nx"><em>Next renewal</em>{{ day(r.next) }}<i v-if="daysLeft != null">{{ daysLeft < 0 ? Math.abs(daysLeft) + ' days ago' : daysLeft === 0 ? 'today' : 'in ' + daysLeft + ' days' }}</i></span></div>
      <div class="bar"><i :style="{ width: pct + '%' }" /></div>
    </div>
    <p v-if="st === 'paused' || st === 'retry'" class="warn">{{ st === 'paused' ? 'Paused' + (r.last_error ? ': ' + r.last_error : '') : 'The last charge failed; we try again on ' + (r.next ? day(r.next) : 'the next date') + '.' }}</p>

    <div v-if="r.code === 'virtual_office' && (addr.address || addr.state)" class="addr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
      <div><em>Business address{{ addr.state ? ' · ' + addr.state + (addr.country && addr.country !== 'United States' ? ', ' + addr.country : '') : '' }}</em><span>{{ addr.address || 'Address being assigned' }}</span></div></div>

    <form v-if="editable && ed.open" class="ef" @submit.prevent="save">
      <label>Service started<input v-model="ed.started_on" type="date" :max="today" @change="fromStart"></label>
      <label>Next renewal<input v-model="ed.next_date" type="date" :min="today"></label>
      <template v-if="r.code === 'virtual_office'">
        <label>Country<select v-model="ed.country"><option>United States</option><option>Nigeria</option></select></label>
        <label>State<select v-if="ed.country === 'United States'" v-model="ed.state"><option value="">—</option><option v-for="s in US_STATES" :key="s" :value="s">{{ s }}</option></select><input v-else value="Lagos" disabled></label>
        <label class="w">Street address<textarea v-model="ed.address" rows="3" maxlength="500" placeholder="e.g. 17350 State Highway 249, STE 220, Houston, TX 77064" /></label>
      </template>
      <p class="hint w">Changing the start date works out the next renewal. The client's wallet renewal and compliance calendar move together.</p>
      <div class="w ea"><button type="button" class="btn secondary" @click="ed.open = false">Cancel</button><button class="btn" :disabled="busy">Save</button></div>
    </form>
    <footer v-if="editable && !ed.open" class="rf">
      <button type="button" class="lk" @click="open">Edit dates{{ r.code === 'virtual_office' ? ' and address' : '' }}</button>
      <template v-if="!r.calendarOnly"><button v-if="r.status === 'active'" type="button" class="lk" :disabled="busy" @click="emit('status', 'suspended')">Pause</button><button v-else-if="r.status === 'suspended'" type="button" class="lk" :disabled="busy" @click="emit('status', 'active')">Resume</button>
        <button type="button" class="lk red" :disabled="busy" @click="emit('status', 'cancelled')">Cancel service</button></template>
    </footer>
  </article>
</template>

<style scoped>
.rc { background: #fff; border: 1px solid var(--c-rule); padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.rh { display: flex; align-items: center; gap: 14px; } .rt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .rt b { font-size: 16px; } .rt span { font-size: 13.5px; color: var(--c-muted); }
.ic { flex: none; width: 42px; height: 42px; display: grid; place-items: center; background: var(--c-signal-soft); color: var(--c-blue-deep); } .ic svg { width: 21px; height: 21px; } .ic[data-i="agent"] { background: #eef0f6; color: var(--c-navy); }
.pill { font-size: 12px; font-weight: 600; padding: 4px 10px; white-space: nowrap; } .pill.on { background: #e9f6ee; color: #23784a; } .pill.paused, .pill.retry { background: #fff6e6; color: #a5650b; } .pill.off { background: var(--c-paper-2); color: var(--c-muted); } .pill.cal { background: #eef4ff; color: #2c5cc5; }
.per { display: flex; flex-direction: column; gap: 8px; } .dates { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; font-weight: 500; } .dates span { display: flex; flex-direction: column; gap: 2px; } .dates em { font-style: normal; font-size: 12px; font-weight: 400; color: var(--c-muted); }
.dates .nx { text-align: right; align-items: flex-end; } .dates i { font-style: normal; font-size: 12px; font-weight: 600; color: var(--c-blue-deep); }
.bar { height: 6px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-blue-deep); } .s-paused .bar i, .s-retry .bar i { background: var(--c-warn); }
.warn { margin: 0; font-size: 13px; color: #a5650b; }
.addr { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; background: #fbfaf7; border: 1px solid var(--c-rule); } .addr svg { width: 18px; height: 18px; color: var(--c-blue-deep); flex: none; margin-top: 2px; } .addr div { display: flex; flex-direction: column; gap: 2px; } .addr em { font-style: normal; font-size: 12px; color: var(--c-muted); } .addr span { font-size: 14px; white-space: pre-line; line-height: 1.5; }
.ef { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 14px; background: #fbfaf7; border: 1px solid var(--c-rule); } .ef label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--c-muted); } .ef .w { grid-column: 1 / -1; }
.ef input, .ef select, .ef textarea { font: inherit; font-size: 14px; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; } .ef textarea { resize: vertical; }
.hint { margin: 0; font-size: 12.5px; color: var(--c-muted); } .ea { display: flex; justify-content: flex-end; gap: 8px; }
.rf { display: flex; gap: 18px; padding-top: 12px; border-top: 1px solid var(--c-rule); } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); margin-left: auto; } .lk:disabled { opacity: .5; }
@media (max-width: 600px) { .ef { grid-template-columns: 1fr; } }
</style>
