// What should we do next: advice by team from the company's figures (see server/utils/advice.ts).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'admin')
  await requireModule(event, 'financials')
  const q = getQuery(event)
  const org = (await currentOrg())!
  const ent = await companyEntityId().catch(() => null)
  const subject = String(q.subject || '') || (ent ? 'entity:' + ent : '')
  if (subject !== 'group' && !/^(entity|company):[0-9a-f-]{36}$/.test(subject)) throw apiError('invalid', 'Choose a company.')
  await subjectName(subject)
  if (q.cached === '1') return { subject, name: await subjectName(subject), advice: await lastAdvice(subject), cached: true }
  if (q.refresh === '1') await rateLimit('fin_advice', user.userId, 10, 60 * 60 * 1000)
  void org
  return { subject, name: await subjectName(subject), advice: await adviseCompany(subject, q.refresh === '1') }
})
