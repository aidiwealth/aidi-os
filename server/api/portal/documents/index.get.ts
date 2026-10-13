// Every document shared with the client or uploaded by them (requests and chat), newest first, with the reason given.
// A file from messages shows the conversation it came from, not the message text. Each document gets a category
// (from the title, then the request's service or the conversation's type) so the client can filter by category and year.
const RULES: [RegExp, string][] = [
  [/\b(ein|cp ?575|147c|articles|certificate of (formation|incorporation)|formation|incorporat|bylaws|organizer|statement of information)\b/i, 'formation'],
  [/\b(tax|irs|1120|1065|5472|1099|w-?9|w-?8|k-?1|franchise|return|extension|7004)\b/i, 'tax'],
  [/\b(annual report|boi|beneficial|compliance|good standing|renewal|state notice)\b/i, 'compliance'],
  [/\b(registered agent|service of process|resign|mail|scan|letter|envelope|virtual)\b/i, 'mail'],
  [/\b(agreement|operating|contract|nda|resolution|consent|legal|amendment|signed)\b/i, 'legal'],
  [/\b(bank|statement|account|wire|ach)\b/i, 'bank'],
  [/\b(invoice|receipt|payment|billing)\b/i, 'billing'],
]
const BY_SERVICE: Record<string, string> = { company_formation: 'formation', tax_filing: 'tax', annual_compliance: 'compliance', registered_agent: 'mail', virtual_office: 'mail', legal_review: 'legal', bookkeeping: 'bank' }
const BY_THREAD: Record<string, string> = { state_notice: 'compliance', compliance: 'compliance', tax_notice: 'tax', bank_notice: 'bank', mail: 'mail', legal: 'legal', billing: 'billing' }

export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const r = await db().query<{ title: string; service: string | null; tcat: string | null; created_at: string }>(
    `SELECT * FROM (SELECT d.id, d.title, d.size_bytes, d.mime_type, e.kind, e.body AS reason, e.created_at, j.id AS job_id, j.title AS job, j.service, NULL::text AS tcat FROM services.job_events e JOIN services.jobs j ON j.id = e.job_id JOIN core.documents d ON d.id = e.document_id
        WHERE j.client_id = $1 AND e.visible_to_client AND e.kind IN ('document','client_document')
      UNION ALL SELECT d.id, d.title, d.size_bytes, d.mime_type, CASE WHEN m.from_team THEN 'document' ELSE 'client_document' END, 'Shared in messages' || coalesce(' · ' || t.subject, ''), m.created_at, NULL::uuid, 'Messages', NULL::text, coalesce(t.category, m.category) FROM services.messages m JOIN core.documents d ON d.id = m.document_id LEFT JOIN services.threads t ON t.id = m.thread_id WHERE m.client_id = $1) x
     ORDER BY created_at DESC LIMIT 500`, [u.clientId])
  return r.rows.map(({ service, tcat, ...d }) => {
    const byTitle = RULES.find(([re]) => re.test(d.title.replace(/[_-]+/g, ' ')))?.[1]
    const category = byTitle ?? (service && BY_SERVICE[service]) ?? (tcat && BY_THREAD[tcat]) ?? 'other'
    return { ...d, category, year: new Date(d.created_at).getUTCFullYear() }
  })
})
