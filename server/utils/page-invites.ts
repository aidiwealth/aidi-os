// Invite-only parts of the investor page (the data room, the cap table). The company lists who may see them, by email
// or by domain ("@fund.com"). A visitor proves their email with a one-time code; a cookie then lets them back in for 30
// days, checked against the list each time, so taking someone off it shuts them out at once. People in the company's
// own workspace always get in.
import type { H3Event } from 'h3'
export type Locked = 'room' | 'captable'
export const inviteCookie = (orgId: string) => 'fvin_' + orgId.replace(/-/g, '').slice(0, 12)
export const SESSION_DAYS = 30

export async function inviteOnly(orgId: string): Promise<Set<Locked>> {
  const r = (await asPlatform(() => db().query<{ invite_only: Locked[] }>('SELECT invite_only FROM financials.public_pages WHERE organization_id = $1', [orgId]))).rows[0]
  return new Set(r?.invite_only ?? [])
}
// Is this email (or its domain) on the company's list?
export async function onInviteList(orgId: string, email: string): Promise<boolean> {
  const e = email.toLowerCase(), dom = '@' + (e.split('@')[1] ?? '')
  return !!(await asPlatform(() => db().query("SELECT 1 FROM financials.page_invites WHERE organization_id = $1 AND status = 'invited' AND email IN ($2, $3)", [orgId, e, dom]))).rowCount
}
// Who the visitor is, when they're let in: their verified email, 'team' for the company's own people, else null.
export async function invitedViewer(event: H3Event, orgId: string): Promise<string | null> {
  const s = await readSession(event).catch(() => null)
  if (s?.orgId === orgId) return 'team'
  const id = getCookie(event, inviteCookie(orgId))
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null
  const row = (await asPlatform(() => db().query<{ email: string }>('SELECT email FROM financials.page_invite_sessions WHERE id = $1 AND organization_id = $2 AND expires_at > now()', [id, orgId]))).rows[0]
  if (!row || !(await onInviteList(orgId, row.email))) return null
  await asPlatform(() => db().query("UPDATE financials.page_invites SET views = views + CASE WHEN last_seen_at IS NULL OR last_seen_at < now() - interval '30 minutes' THEN 1 ELSE 0 END, last_seen_at = now() WHERE organization_id = $1 AND email IN ($2, $3)", [orgId, row.email, '@' + row.email.split('@')[1]]))
  return row.email
}
// Whether a part of the page is shut for this visitor.
export async function lockedFor(event: H3Event, orgId: string, part: Locked): Promise<boolean> {
  if (!(await inviteOnly(orgId)).has(part)) return false
  return !(await invitedViewer(event, orgId))
}

// The published page a visitor's request is about (by its address), with what it keeps invite-only.
export async function pageBySlug(event: H3Event): Promise<{ organization_id: string; slug: string; invite_only: Locked[] }> {
  const slug = String(getRouterParam(event, 'slug') ?? '').toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) throw apiError('not_found', 'This page does not exist.', 404)
  const p = (await asPlatform(() => db().query<{ organization_id: string; slug: string; invite_only: Locked[]; published: boolean }>('SELECT organization_id, slug, invite_only, published FROM financials.public_pages WHERE slug = $1', [slug]))).rows[0]
  if (!p?.published || !p.invite_only.length) throw apiError('not_found', 'This page does not exist.', 404)
  return p
}

// A data room opened by its short address (finvry.com/<handle>/<name>) is shut while the company keeps its data room
// invite-only and the visitor isn't let in. Links with a long private token stay as the company shared them.
export async function roomShut(event: H3Event, ref: string, orgId: string): Promise<{ slug: string } | null> {
  if (!ref.startsWith('@')) return null
  const pg = (await asPlatform(() => db().query<{ slug: string; invite_only: Locked[] }>('SELECT slug, invite_only FROM financials.public_pages WHERE organization_id = $1', [orgId]))).rows[0]
  if (!pg?.invite_only.includes('room') || await invitedViewer(event, orgId)) return null
  return { slug: pg.slug }
}
