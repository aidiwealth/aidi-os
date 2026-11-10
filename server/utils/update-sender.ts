// Sending investor reports from the workspace's own address (e.g. company@termii.com) instead of Finvry's, the way
// Visible does it: the workspace adds its domain, puts the DNS records we show into its DNS, and once the email
// service has verified them, reports (live and test) go from that address. Until then they go from Finvry's address
// with the workspace's sender name, and replies go to its reply-to address.
export interface UpdateSender { email?: string; reply_to?: string; domain?: string; resend_id?: string; status?: string; records?: { record: string; name: string; type: string; value: string; priority?: number; status?: string }[] }
const FREE = /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|zoho|gmx|mail|yandex)\.[a-z.]+$/i

async function resend<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { resendApiKey } = useRuntimeConfig()
  if (!resendApiKey) throw apiError('not_configured', 'Email sending is not set up.', 503)
  const r = await fetch('https://api.resend.com' + path, { method: init.method ?? 'GET', headers: { Authorization: 'Bearer ' + resendApiKey, 'Content-Type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined })
  const text = await r.text()
  if (r.status === 401 || r.status === 403) throw apiError('email_key', 'The email service key can\'t manage sending domains yet. Ask your Finvry admin to give the key full access.', 502)
  if (!r.ok) throw apiError('email_service', 'The email service said: ' + text.slice(0, 200), 502)
  return (text ? JSON.parse(text) : {}) as T
}

export async function senderGet(orgId: string): Promise<UpdateSender> {
  const o = (await asPlatform(() => db().query<{ s: UpdateSender | null }>("SELECT settings->'update_sender' AS s FROM core.organizations WHERE id = $1", [orgId]))).rows[0]
  return o?.s ?? {}
}
async function senderSave(orgId: string, s: UpdateSender) {
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('update_sender', $2::jsonb) WHERE id = $1", [orgId, JSON.stringify(s)]))
}

// Who a report is sent as: the verified own address, else Finvry's address under the workspace's sender name.
export async function updateSendAs(orgId: string, fallbackReply: string | null): Promise<{ fromEmail?: string; replyTo?: string }> {
  const s = await senderGet(orgId)
  if (s.status === 'verified' && s.email) return { fromEmail: s.email, replyTo: s.reply_to || s.email }
  return { replyTo: s.reply_to || fallbackReply || undefined }
}

export async function senderSet(orgId: string, email: string, replyTo: string | null) {
  const e = email.trim().toLowerCase(), m = e.match(/^[a-z0-9._%+-]+@([a-z0-9-]+(\.[a-z0-9-]+)+)$/)
  if (!m) throw apiError('invalid', 'Enter an email address, e.g. company@yourcompany.com.')
  const domain = m[1]!
  if (FREE.test(domain)) throw apiError('invalid', 'Use an address on your company\'s own domain; ' + domain + ' addresses can\'t be sent from other services.')
  if (/(^|\.)(finvry\.com|theaidigroup\.com)$/.test(domain)) throw apiError('invalid', 'Use your company\'s own domain.')
  // One workspace per domain: another workspace that claimed it keeps it.
  const taken = (await asPlatform(() => db().query("SELECT 1 FROM core.organizations WHERE id <> $1 AND lower(settings->'update_sender'->>'domain') = $2", [orgId, domain]))).rowCount
  if (taken) throw apiError('taken', 'This domain is already set up by another workspace on Finvry. Contact support if it\'s yours.', 409)
  const cur = await senderGet(orgId)
  let s: UpdateSender
  if (cur.domain === domain && cur.resend_id) s = { ...cur, email: e }
  else {
    if (cur.resend_id) await senderRemoveDomain(cur.resend_id)
    const list = await resend<{ data: { id: string; name: string }[] }>('/domains')
    const have = list.data?.find((d) => d.name === domain)
    const made = have ? { id: have.id } : await resend<{ id: string }>('/domains', { method: 'POST', body: { name: domain } })
    s = { email: e, domain, resend_id: made.id, status: 'pending' }
  }
  if (replyTo !== null) s.reply_to = replyTo.trim().toLowerCase() || undefined
  await senderSave(orgId, s)
  return senderRefresh(orgId)
}

export async function senderRefresh(orgId: string, verify = false): Promise<UpdateSender> {
  const s = await senderGet(orgId)
  if (!s.resend_id) return s
  if (verify) await resend('/domains/' + s.resend_id + '/verify', { method: 'POST' }).catch(() => null)
  const d = await resend<{ status: string; records: UpdateSender['records'] }>('/domains/' + s.resend_id)
  s.status = d.status === 'verified' ? 'verified' : d.status === 'failed' ? 'failed' : 'pending'
  s.records = (d.records ?? []).map((r) => ({ record: r.record, name: r.name, type: r.type, value: r.value, priority: r.priority, status: r.status }))
  await senderSave(orgId, s)
  return s
}

async function senderRemoveDomain(id: string) {
  const users = (await asPlatform(() => db().query("SELECT count(*)::int AS n FROM core.organizations WHERE settings->'update_sender'->>'resend_id' = $1", [id]))).rows[0]?.n ?? 0
  if (users <= 1) await resend('/domains/' + id, { method: 'DELETE' }).catch(() => null)
}
export async function senderRemove(orgId: string) {
  const s = await senderGet(orgId)
  if (s.resend_id) await senderRemoveDomain(s.resend_id)
  await senderSave(orgId, s.reply_to ? { reply_to: s.reply_to } : {})
}
export async function senderReplyTo(orgId: string, replyTo: string) {
  const r = replyTo.trim().toLowerCase()
  if (r && !/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(r)) throw apiError('invalid', 'Enter a valid reply-to address.')
  const s = await senderGet(orgId); s.reply_to = r || undefined; await senderSave(orgId, s)
}
