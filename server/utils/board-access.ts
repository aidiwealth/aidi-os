// Shared board links: open to anyone with the link, or only to the people the company invited (by email, or a whole
// firm as @fund.com). Invited people confirm their email with a one-time code; a cookie keeps them in for 30 days on
// that device while they stay on the list. People in the company's own workspace are never asked.
import type { H3Event } from 'h3'
export interface SharedBoard { id: string; organization_id: string; name: string; note: string | null; kpis: string[]; charts: BoardChart[]; period: string; count: number; forecast_id: string | null; sections: { forecast?: boolean; statements?: boolean }; documents: string[]; share_access: 'public' | 'invited'; share_emails: string[] }
export const BOARD_SESSION_DAYS = 30
export const boardCookie = (boardId: string) => 'fvbd_' + boardId.replace(/-/g, '').slice(0, 12)

// The board behind a share link (on, not expired); the request then acts for its workspace.
export async function boardByToken(event: H3Event): Promise<SharedBoard> {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) throw apiError('not_found', 'This link is not valid.', 404)
  const b = (await asPlatform(() => db().query<SharedBoard & { share_enabled: boolean; expired: boolean }>(
    `SELECT id, organization_id, name, note, kpis, charts, period, count, share_enabled, forecast_id, sections, documents, share_access, share_emails,
            (share_expires IS NOT NULL AND share_expires < now()) AS expired FROM financials.boards WHERE share_token = $1`, [token]))).rows[0]
  if (!b || !b.share_enabled) throw apiError('not_found', 'This link is not valid.', 404)
  if (b.expired) throw apiError('expired', 'This link has expired. Ask the company for a new one.', 410)
  setOrgContext(b.organization_id)
  return b
}

export function onBoardList(b: Pick<SharedBoard, 'share_emails'>, email: string): boolean {
  const e = email.trim().toLowerCase(), dom = '@' + (e.split('@')[1] ?? '')
  return (b.share_emails ?? []).some((x) => x === e || x === dom)
}

// May this visitor see the board? For invite-only boards: the company's own team, or a confirmed invited email.
export async function boardAccess(event: H3Event, b: SharedBoard): Promise<{ ok: boolean; email: string | null }> {
  if (b.share_access !== 'invited') return { ok: true, email: null }
  const s = await readSession(event).catch(() => null)
  if (s?.orgId === b.organization_id) return { ok: true, email: null }
  const id = getCookie(event, boardCookie(b.id))
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return { ok: false, email: null }
  const r = (await asPlatform(() => db().query<{ email: string }>(
    "UPDATE financials.board_sessions SET views = views + CASE WHEN last_viewed_at < now() - interval '30 minutes' THEN 1 ELSE 0 END, last_viewed_at = now() WHERE id = $1 AND board_id = $2 AND organization_id = $3 AND expires_at > now() RETURNING email",
    [id, b.id, b.organization_id]))).rows[0]
  return r && onBoardList(b, r.email) ? { ok: true, email: r.email } : { ok: false, email: null }
}
export async function requireBoardAccess(event: H3Event, b: SharedBoard): Promise<{ email: string | null }> {
  const a = await boardAccess(event, b)
  if (!a.ok) throw apiError('invite_only', 'This board is only for people the company invited.', 403)
  return { email: a.email }
}

// Who has opened an invite-only board, for the company.
export async function boardViewers(boardId: string): Promise<{ email: string; views: number; last_viewed_at: string }[]> {
  return (await db().query<{ email: string; views: number; last_viewed_at: string }>(
    'SELECT email, sum(views)::int AS views, max(last_viewed_at) AS last_viewed_at FROM financials.board_sessions WHERE board_id = $1 GROUP BY email ORDER BY 3 DESC', [boardId])).rows
}
