// Finvry requires two-step verification: everyone signed in to a Finvry company workspace (on app.finvry.com, or a
// company workspace anywhere) sets up an authenticator app before using it, and is sent back to set-up for as long as
// it is off. Aidi staff using support access ("Log in as") are not asked. Answers are kept briefly per server.
import type { H3Event } from 'h3'
const on = new Map<string, { v: boolean; at: number }>(), kind = new Map<string, { v: string; at: number }>()
export const forgetMfa = (userId: string) => on.delete(userId)
async function mfaOn(userId: string) {
  const c = on.get(userId); if (c && Date.now() - c.at < (c.v ? 600e3 : 20e3)) return c.v
  const v = !!(await db().query('SELECT 1 FROM core.user_mfa WHERE user_id = $1 AND enabled_at IS NOT NULL', [userId])).rowCount
  on.set(userId, { v, at: Date.now() }); if (on.size > 5000) on.delete(on.keys().next().value!)
  return v
}
async function orgKind(orgId: string) {
  const c = kind.get(orgId); if (c && Date.now() - c.at < 600e3) return c.v
  const v = (await db().query<{ kind: string }>('SELECT kind FROM core.organizations WHERE id = $1', [orgId])).rows[0]?.kind ?? ''
  kind.set(orgId, { v, at: Date.now() }); return v
}
export async function mfaRequired(event: H3Event, s: { userId: string; orgId: string | null; platform?: boolean; support?: unknown }): Promise<boolean> {
  if (s.support || s.platform) return false
  const finvry = hostBrand(event) === 'finvry' || (!!s.orgId && (await orgKind(s.orgId)) === 'company')
  return finvry && !(await mfaOn(s.userId))
}
