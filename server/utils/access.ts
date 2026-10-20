// Who can create a Finvry account. Sign-up runs in one of three modes, set by the Finvry team (platform.settings
// 'access'): invite_only (default: people ask for access and are approved in batches; a partner or community code
// skips the queue), open (anyone signs up), closed (requests are kept, nobody new gets in). A weekly cap limits new
// accounts; a monthly cap limits new service orders. Everything is enforced on the server.
import { createHash, randomBytes } from 'node:crypto'
export type AccessMode = 'invite_only' | 'open' | 'closed'
export interface AccessSettings { mode: AccessMode; weekly_cap: number; services_month_cap: number; demo_url: string }
export const INVITE_DAYS = 14
export async function accessSettings(): Promise<AccessSettings> {
  const v = (await asPlatform(() => db().query<{ value: Partial<AccessSettings> }>("SELECT value FROM platform.settings WHERE key = 'access'"))).rows[0]?.value ?? {}
  const mode: AccessMode = v.mode === 'open' || v.mode === 'closed' ? v.mode : 'invite_only'
  return { mode, weekly_cap: Math.max(0, Number(v.weekly_cap ?? 25) || 0), services_month_cap: Math.max(0, Number(v.services_month_cap ?? 20) || 0), demo_url: String(v.demo_url ?? '') }
}
export const hashInvite = (t: string) => createHash('sha256').update(t).digest('hex')
export const newInvite = () => { const token = randomBytes(24).toString('base64url'); return { token, hash: hashInvite(token) } }
// New accounts let in this week (Monday to Sunday, UTC): invitations sent plus sign-ups with a partner code.
export async function approvedThisWeek(): Promise<number> {
  return (await asPlatform(() => db().query<{ n: number }>(`SELECT
    (SELECT count(*) FROM platform.access_requests WHERE invited_at >= date_trunc('week', now()))
  + (SELECT count(*) FROM core.organizations WHERE kind = 'company' AND created_at >= date_trunc('week', now()) AND settings->>'signup_via' = 'partner') AS n`))).rows[0]!.n
}
export interface InviteRow { id: string; name: string; email: string; company: string; website: string | null; country: string }
export async function inviteFor(token: string): Promise<InviteRow | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  return (await asPlatform(() => db().query<InviteRow>("SELECT id, name, email, company, website, country FROM platform.access_requests WHERE invite_hash = $1 AND status = 'approved' AND invite_expires > now() AND signed_up_org IS NULL", [hashInvite(token)]))).rows[0] ?? null
}
// Marks that would make the Finvry team look twice: regulated money businesses, personal email, no company yet.
const REGULATED = /\b(broker|dealer|funding portal|crowdfund|crypto|exchange|forex|lending|loans?|microfinance|deposit|bank(ing)? licen|investment advis|asset manag|fund manag|wealth manag|money transmi|remittance)/i
const PERSONAL = /@(gmail|yahoo|hotmail|outlook|live|icloud|aol|proton(mail)?|gmx|mail|yandex)\./i
export function accessFlags(r: { email: string; company: string; website?: string | null; needs_note?: string | null; stage: string }): string[] {
  const f: string[] = []
  if (REGULATED.test([r.company, r.website ?? '', r.needs_note ?? ''].join(' '))) f.push('regulated')
  if (PERSONAL.test(r.email)) f.push('personal_email')
  if (r.stage === 'idea') f.push('idea_stage')
  return f
}
