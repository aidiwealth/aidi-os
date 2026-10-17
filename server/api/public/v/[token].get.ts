// A shared forecast or cap table: what it is and who shared it. The figures come from /open (after the email, if
// the link asks for one), so every view is recorded.
export default defineEventHandler(async (event) => {
  const l = await findShare(String(getRouterParam(event, 'token') ?? ''))
  if (!l || !l.active) throw apiError('not_found', 'This link is not valid.', 404)
  if (l.expired) throw apiError('expired', 'This link has expired. Ask the company for a new one.', 410)
  setOrgContext(l.organization_id)
  const obj = await shareObject(l.kind, l.object_id)
  if (!obj) throw apiError('not_found', 'This link is not valid.', 404)
  const company = (await currentOrg())?.name ?? ''
  return { kind: l.kind, title: obj.name, company, logo: logoUrl(await companyLogoId().catch(() => null)), require_email: l.require_email, workspace: await publicWorkspace() }
})
