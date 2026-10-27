// Wealth client: the onboarding conversation. GET where they are; POST an answer (quick answer or their own words),
// go back a question, or upload statements (multipart).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Your wealth account is not set up yet.', 404)
  if (getMethod(event) === 'GET') return (await onboardView(id)) ?? { status: 'none' }
  await rateLimit('wm_onboard', user.userId, 120, 60 * 60 * 1000)
  if ((getRequestHeader(event, 'content-type') ?? '').includes('multipart')) { await onboardUpload(id, (await readMultipartFormData(event)) ?? []); return onboardView(id) }
  const b = await readBody<{ step?: string; value?: unknown; text?: string; back?: boolean }>(event)
  if (typeof b?.step !== 'string') throw apiError('invalid', 'Missing step.')
  await onboardAnswer(id, { step: b.step, value: b.value, text: typeof b.text === 'string' ? b.text : undefined, back: !!b.back }, ipOrNull(event) ?? '0.0.0.0')
  return onboardView(id)
})
