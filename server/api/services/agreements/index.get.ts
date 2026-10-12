// The services team: agreement templates (current wording and version) and every signed or pending agreement.
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const templates = []
  for (const code of AGREEMENT_CODES) templates.push({ ...(await agreementTemplate(code)), label: AGREEMENT_LABEL[code], fields: AGREEMENT_FIELDS[code] })
  const rows = (await asPlatform(() => db().query(
    `SELECT s.id, s.code, s.title, s.version, s.status, to_char(s.effective_date, 'YYYY-MM-DD') AS effective_date, s.signed_at, s.signer_name, s.signer_email, s.signature_kind, s.job_id, s.client_id, s.organization_id, s.created_at,
            coalesce(c.name, o.name) AS party, j.title AS job
       FROM legal.signatures s LEFT JOIN services.clients c ON c.id = s.client_id LEFT JOIN core.organizations o ON o.id = s.organization_id LEFT JOIN services.jobs j ON j.id = s.job_id
      WHERE s.status <> 'void' ORDER BY coalesce(s.signed_at, s.created_at) DESC LIMIT 1000`))).rows
  return { templates, signatures: rows }
})
