// Connecting a US bank (and keeping the connection healthy): connect, sign in again, reload its history, disconnect.
// Shared by the live balances strip and the Banking accounts section.
type PlaidFactory = { create: (o: Record<string, unknown>) => { open: () => void } }
const errMsg = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? d
function loadScript(): Promise<void> {
  return new Promise((res, rej) => {
    if ((window as unknown as { Plaid?: unknown }).Plaid) return res()
    const s = document.createElement('script'); s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'; s.onload = () => res(); s.onerror = () => rej(new Error('load')); document.head.appendChild(s)
  })
}
interface St { id: string; institution: string | null; error: string | null; syncing: boolean; payments: number }
export function usePlaidLink(changed: () => unknown) {
  const busy = ref(false), msg = ref('')
  // While a bank is bringing in payments: which banks, how many so far, and whether it has finished. Banks send a new
  // connection's history in the background, so a new bank counts as finished once its payments arrive (or after five
  // minutes, when it carries on quietly).
  const progress = ref<{ banks: string; payments: number; done: boolean; slow: boolean } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  const status = () => $fetch<{ items: St[] }>('/api/plaid/sync-status').then((r) => r.items).catch(() => null)
  // Follow these connections (reconnect, start over), or every connection not in `before` (a new bank).
  async function follow(w: { ids?: string[]; before?: Set<string> }) {
    clearTimeout(timer)
    const t0 = Date.now()
    progress.value = { banks: 'your bank', payments: 0, done: false, slow: false }
    const tick = async () => {
      const items = await status()
      if (items) {
        const mine = items.filter((i) => (w.ids ? w.ids.includes(i.id) : w.before ? !w.before.has(i.id) : false))
        const isNew = (i: St) => !!w.before && !w.before.has(i.id)
        const waiting = mine.some((i) => !i.error && (i.syncing || (isNew(i) && i.payments === 0)))
        const slow = waiting && Date.now() - t0 > 5 * 60_000
        progress.value = { banks: [...new Set(mine.map((i) => i.institution ?? 'your bank'))].join(' and ') || 'your bank', payments: mine.reduce((n, i) => n + i.payments, 0), done: !waiting || slow, slow }
        if (progress.value.done) { await changed(); timer = setTimeout(() => (progress.value = null), 8000); return }
      }
      timer = setTimeout(() => void tick(), 3000)
    }
    timer = setTimeout(() => void tick(), 1500)
  }
  if (getCurrentInstance()) onBeforeUnmount(() => clearTimeout(timer))
  const P = () => (window as unknown as { Plaid: PlaidFactory }).Plaid
  // replaces: a connection being made again for two years of history (its payments are swapped for the new ones).
  async function connect(replaces?: unknown) {
    const rep = typeof replaces === 'string' ? replaces : undefined
    busy.value = true; msg.value = ''
    try {
      await loadScript()
      const { link_token } = await $fetch<{ link_token: string }>('/api/plaid/link-token', { method: 'POST' })
      P().create({ token: link_token, onSuccess: async (public_token: string, meta: { institution?: { name?: string } }) => { try { const before = new Set((await status() ?? []).map((i) => i.id)); progress.value = { banks: meta.institution?.name ?? 'your bank', payments: 0, done: false, slow: false }; await $fetch('/api/plaid/exchange', { method: 'POST', body: { public_token, institution: meta.institution?.name, ...(rep ? { replaces: rep } : {}) } }); await changed(); void follow({ before }) } catch (e) { progress.value = null; msg.value = errMsg(e, 'Could not connect.') } }, onExit: () => { busy.value = false } }).open()
    } catch (e) { const x = e as { statusCode?: number }; msg.value = x.statusCode ? errMsg(e, 'Could not start the connection. Try again in a minute.') : 'Could not open the bank window. Check your connection or ad blocker.' } finally { busy.value = false }
  }
  // The bank needs the person to sign in again (update mode for that connection).
  async function reconnect(id: string) {
    busy.value = true; msg.value = ''
    try {
      await loadScript()
      const { link_token } = await $fetch<{ link_token: string }>('/api/plaid/link-token', { method: 'POST', body: { item: id } })
      P().create({ token: link_token, onSuccess: async () => { try { await $fetch('/api/plaid/items/' + id + '/reconnected', { method: 'POST' }); await changed(); void follow({ ids: [id] }) } catch { msg.value = 'Reconnected. Balances will update in a minute.' } finally { busy.value = false } }, onExit: () => { busy.value = false } }).open()
    } catch { msg.value = 'Could not start reconnecting. Try again in a minute.'; busy.value = false }
  }
  // Clear a bank's payments and bring the full history back (categories set by hand are kept).
  async function resync(id: string, name: string | null) {
    if (!await askConfirm('Its payments are cleared and brought in again from the bank. Categories you set are kept.', { title: 'Start over with ' + (name ?? 'this bank') + '?', ok: 'Start over' })) return
    msg.value = ''
    try { await $fetch('/api/plaid/items/' + id + '/resync', { method: 'POST' }); void follow({ ids: [id] }) } catch { msg.value = 'Could not start the resync. Try again in a minute.' }
  }
  // remove: its payments and balances leave Banking too.
  async function disconnect(id: string, name: string | null, remove = false) {
    if (!await askConfirm(remove ? 'The connection and every payment and balance it brought in are removed. Connect it again any time to start fresh.' : 'Balances stop updating. Payments already in stay as history.', { title: (remove ? 'Disconnect and delete ' : 'Disconnect ') + (name ?? 'this bank') + '?', ok: remove ? 'Disconnect and delete' : 'Disconnect', danger: true })) return
    msg.value = ''
    try { const r = await $fetch<{ removed: number }>('/api/plaid/items/' + id, { method: 'DELETE', query: remove ? { remove: '1' } : {} }); if (remove) msg.value = r.removed.toLocaleString('en-US') + ' payments removed.'; await changed() } catch { msg.value = 'Could not disconnect. Try again.' }
  }
  // Every live bank: clear and bring the payments in again.
  async function resetAll() {
    if (!await askConfirm('Every live bank\'s payments are cleared and brought in again from the banks. Categories you set are kept. It takes a few minutes.', { title: 'Start over with live banks?', ok: 'Start over' })) return
    msg.value = ''
    try { const r = await $fetch<{ connections: number }>('/api/plaid/reset', { method: 'POST' }); if (r.connections) void follow({ ids: (await status() ?? []).filter((i) => !i.error).map((i) => i.id) }) } catch { msg.value = 'Could not start over. Try again in a minute.' }
  }
  return { busy, msg, progress, connect, reconnect, resync, disconnect, resetAll }
}
