// Slack alerts through incoming webhooks: one webhook per channel (Aidi OS, Finvry, Critical), set by the Finvry team
// in the console, with each kind of event on or off. An alert never holds up or breaks what triggered it: it is sent
// in the background and failures are only logged. No bank details, ID numbers or message bodies beyond a short preview.
import { SLACK_EVENTS, type SlackChannel } from '~/shared/slack-events'
export interface SlackSettings { aidi: string; finvry: string; critical: string; off: string[] }
let cache: { at: number; v: SlackSettings } | null = null
const recent = new Map<string, number>()
export async function slackSettings(fresh = false): Promise<SlackSettings> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.v
  const v = (await asPlatform(() => db().query<{ value: Partial<SlackSettings> }>("SELECT value FROM platform.settings WHERE key = 'slack'")).catch(() => ({ rows: [] }))).rows[0]?.value ?? {}
  const s: SlackSettings = { aidi: String(v.aidi ?? ''), finvry: String(v.finvry ?? ''), critical: String(v.critical ?? ''), off: Array.isArray(v.off) ? v.off.map(String) : [] }
  cache = { at: Date.now(), v: s }
  return s
}
export const slackUrlOk = (u: string) => /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{10,200}$/.test(u)
const clip = (s: string, n = 280) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
// Escape what Slack treats as markup, so a company name cannot ping a channel or fake a link.
const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export async function postSlack(url: string, text: string, fields: [string, string][] = [], link?: { label: string; url: string }): Promise<boolean> {
  const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text: text } }]
  if (fields.length) blocks.push({ type: 'section', fields: fields.slice(0, 10).map(([k, v]) => ({ type: 'mrkdwn', text: '*' + safe(k) + '*\n' + safe(clip(v, 200)) })) })
  if (link) blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: link.label.slice(0, 70) }, url: link.url }] })
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text.replace(/\*/g, ''), blocks }), signal: AbortSignal.timeout(6000) })
  return r.ok
}
// Send an alert for an event (see shared/slack-events.ts). Returns at once; the post happens in the background.
export function slack(event: string, title: string, fields: [string, string][] = [], link?: { label: string; path: string; brand?: 'aidi' | 'finvry' }): void {
  const def = SLACK_EVENTS.find((e) => e.key === event)
  if (!def) return
  const k = event + '|' + title, now = Date.now()
  if ((recent.get(k) ?? 0) > now - 10 * 60_000) return
  recent.set(k, now); if (recent.size > 500) for (const [x, t] of recent) if (t < now - 10 * 60_000) recent.delete(x)
  void (async () => {
    try {
      const s = await slackSettings()
      const url = s[def.channel as SlackChannel]
      if (!url || !slackUrlOk(url) || s.off.includes(event)) return
      const base = brands()[link?.brand ?? (def.channel === 'aidi' ? 'aidi' : 'finvry')].url
      const ok = await postSlack(url, (def.channel === 'critical' ? ':rotating_light: ' : '') + '*' + safe(clip(title, 200)) + '*', fields, link ? { label: link.label, url: base + link.path } : undefined)
      if (!ok) console.error('[slack] post failed for', event)
    } catch (e) { console.error('[slack]', event, (e as Error).message) }
  })()
}

// An Aidi Wealth client's name, for alerts about what they did in their portal.
export async function wmClientName(id: string): Promise<string> {
  return (await db().query<{ name: string }>('SELECT name FROM wm.clients WHERE id = $1', [id]).catch(() => ({ rows: [] as { name: string }[] }))).rows[0]?.name ?? 'A client'
}
export function wmAlert(clientId: string, what: string, fields: [string, string][] = []): void {
  void wmClientName(clientId).then((n) => slack('aidi.wealth_message', n + ' ' + what, fields, { label: 'Open the client', path: '/wealth-mgmt/clients/' + clientId })).catch(() => {})
}
// Investor engagement alerts are for the group's own workspaces only, never a Finvry customer's investors.
export async function isAidiOrg(orgId: string): Promise<boolean> {
  return (await asPlatform(() => db().query<{ kind: string }>('SELECT kind FROM core.organizations WHERE id = $1', [orgId]))).rows[0]?.kind !== 'company'
}
export async function orgName(orgId: string): Promise<string> {
  return (await asPlatform(() => db().query<{ name: string }>('SELECT name FROM core.organizations WHERE id = $1', [orgId]))).rows[0]?.name ?? 'A company'
}
export const minorMoney = (minor: number | string, cur: string) => (cur === 'NGN' ? '₦' : cur === 'USD' ? '$' : cur + ' ') + (Number(minor) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })
