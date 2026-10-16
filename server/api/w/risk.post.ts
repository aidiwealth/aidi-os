// Wealth client: set your risk level, from the questionnaire (answers) or by choosing a level directly.
import { z } from 'zod'
import { RISK_LEVELS, RISK_QUESTIONS, levelFromAnswers } from '~/shared/risk'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const client = await wmClientOfUser(user.userId)
  if (!client) throw apiError('not_found', 'Your wealth account is not set up yet.', 404)
  const b = z.object({ answers: z.record(z.string(), z.number().int().min(1).max(5)).optional(), level: z.enum(RISK_LEVELS.map((l) => l.code) as [string, ...string[]]).optional() }).safeParse(await readBody(event))
  if (!b.success || (!b.data.answers && !b.data.level)) throw apiError('invalid', 'Answer the questions or choose a level.')
  if (b.data.answers && RISK_QUESTIONS.some((q) => !b.data.answers![q.id])) throw apiError('invalid', 'Answer every question.')
  const level = b.data.level ?? levelFromAnswers(b.data.answers!)
  await db().query("UPDATE wm.clients SET risk_profile = $2, risk_answers = coalesce($3::jsonb, risk_answers), risk_set_by = 'client', risk_set_at = now(), updated_at = now() WHERE id = $1", [client, level, b.data.answers ? JSON.stringify(b.data.answers) : null])
  await audit({ event, actorUserId: user.userId, action: 'wm.risk_level', objectType: 'wm_client', objectId: client, detail: { level, by: 'client' } })
  return { ok: true, level }
})
