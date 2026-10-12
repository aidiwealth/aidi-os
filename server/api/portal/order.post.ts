// A founder orders services: a job on the services desk, and an invoice for anything with a listed price (paid online
// or by transfer). Quoted services are priced by the team and invoiced after. The founder signs the Service Level
// Agreement for the order in the wizard; the signed copy is stored on the job and emailed to them and the team.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('portal_order', u.userId ?? u.clientId, 10, 60 * 60 * 1000)
  const raw = await readBody<Record<string, unknown>>(event)
  const b = OrderBody.safeParse(raw)
  if (!b.success) throw apiError('invalid', 'Choose at least one service.')
  const sig = SignBody.safeParse(raw?.sla)
  if (!sig.success) throw apiError('sla_required', 'Please sign the service agreement: type your full name, add your signature and tick the box to agree.')
  checkSignaturePng(sig.data.png, true)
  const out = await placeServiceOrder(u.clientId, { name: u.name, email: u.email }, b.data)
  let company: string | null = b.data.formation?.name ?? null
  if (!company && b.data.company_id) company = (await db().query<{ name: string }>('SELECT name FROM services.companies WHERE id = $1', [b.data.company_id])).rows[0]?.name ?? null
  try { await signJobAgreement({ clientId: u.clientId, jobId: out.job_id, codes: b.data.codes, company, notes: b.data.notes, voTerm: b.data.vo_term, signer: { name: sig.data.name, email: u.email }, sig: sig.data, ip: clientIp(event), ua: getHeader(event, 'user-agent') ?? '', userId: u.userId, portalLink: brands().finvry.url + '/client/jobs/' + out.job_id }) }
  catch (e) { console.error('[order] SLA signing failed', e) } // the order stands; the team can send the agreement again from the job
  return { ok: true, ...out }
})
