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
export function usePlaidLink(changed: () => unknown) {
  const busy = ref(false), msg = ref('')
  const P = () => (window as unknown as { Plaid: PlaidFactory }).Plaid
  async function connect() {
    busy.value = true; msg.value = ''
    try {
      await loadScript()
      const { link_token } = await $fetch<{ link_token: string }>('/api/plaid/link-token', { method: 'POST' })
      P().create({ token: link_token, onSuccess: async (public_token: string, meta: { institution?: { name?: string } }) => { try { await $fetch('/api/plaid/exchange', { method: 'POST', body: { public_token, institution: meta.institution?.name } }); await changed() } catch (e) { msg.value = errMsg(e, 'Could not connect.') } }, onExit: () => { busy.value = false } }).open()
    } catch (e) { const x = e as { statusCode?: number }; msg.value = x.statusCode ? errMsg(e, 'Could not start the connection. Try again in a minute.') : 'Could not open the bank window. Check your connection or ad blocker.' } finally { busy.value = false }
  }
  // The bank needs the person to sign in again (update mode for that connection).
  async function reconnect(id: string) {
    busy.value = true; msg.value = ''
    try {
      await loadScript()
      const { link_token } = await $fetch<{ link_token: string }>('/api/plaid/link-token', { method: 'POST', body: { item: id } })
      P().create({ token: link_token, onSuccess: async () => { try { await $fetch('/api/plaid/items/' + id + '/reconnected', { method: 'POST' }); await changed() } catch { msg.value = 'Reconnected. Balances will update in a minute.' } finally { busy.value = false } }, onExit: () => { busy.value = false } }).open()
    } catch { msg.value = 'Could not start reconnecting. Try again in a minute.'; busy.value = false }
  }
  // Clear a bank's payments and bring the full history back (categories set by hand are kept).
  async function resync(id: string, name: string | null) {
    if (!await askConfirm('Payments are reloaded from the bank. Your categories are kept.', { title: 'Resync ' + (name ?? 'this bank') + '?', ok: 'Resync' })) return
    msg.value = ''
    try { await $fetch('/api/plaid/items/' + id + '/resync', { method: 'POST' }); msg.value = 'Resyncing. Back in a minute or two.'; setTimeout(() => void changed(), 45000) } catch { msg.value = 'Could not start the resync. Try again in a minute.' }
  }
  async function disconnect(id: string, name: string | null) {
    if (!await askConfirm('Its balances stop updating. Payments already in stay.', { title: 'Disconnect ' + (name ?? 'this bank') + '?', ok: 'Disconnect', danger: true })) return
    await $fetch('/api/plaid/items/' + id, { method: 'DELETE' }); await changed()
  }
  return { busy, msg, connect, reconnect, resync, disconnect }
}
