import { AIDI_ORG_SQL } from '~/server/utils/session'
// Switch the current session to another workspace the person belongs to.
import { z } from 'zod'
const Body = z.object({ organization_id: z.string().uuid() })
export default defineEventHandler(async (event) => {
  const s = await requireUser(event)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a workspace.')
  // Support sign-in sessions stay in the workspace they were opened for.
  if ((await asPlatform(() => db().query('SELECT 1 FROM core.sessions WHERE id = $1 AND impersonated_by IS NOT NULL', [s.sessionId]))).rowCount) throw apiError('forbidden', 'Support access is limited to this workspace. End it to switch.', 403)
  const ok = await asPlatform(() => db().query(
    `SELECT 1 FROM core.memberships m JOIN core.organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1 AND m.organization_id = $2 AND m.status = 'active' AND o.status = ANY($3::text[])
        ${hostBrand(event) === 'finvry' ? 'AND NOT ' + AIDI_ORG_SQL : ''}`, [s.userId, b.data.organization_id, LIVE_ORG_STATUSES]))
  if (!ok.rowCount) throw apiError('forbidden', hostBrand(event) === 'finvry' ? 'Aidi OS workspaces open at app.theaidigroup.com.' : 'You do not have access to that workspace.', 403)
  await db().query('UPDATE core.sessions SET organization_id = $2 WHERE id = $1', [s.sessionId, b.data.organization_id])
  forgetSessions((_, sid) => sid === s.sessionId)
  await db().query('UPDATE core.users SET last_org_id = $2 WHERE id = $1', [s.userId, b.data.organization_id])
  event.context.orgId = b.data.organization_id
  await audit({ event, actorUserId: s.userId, action: 'auth.switch_workspace', objectType: 'organization', objectId: b.data.organization_id })
  return { ok: true }
})
