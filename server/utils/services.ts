// Client Services shared rules.
export const SERVICES: Record<string, string> = {
  company_formation: 'Company formation', annual_compliance: 'Annual compliance', tax_filing: 'Tax filing',
  registered_agent: 'Registered agent', legal_review: 'Legal review', trust_setup: 'Trust set-up', banking_setup: 'Banking set-up', other: 'Other'
}
export const SERVICE_KEYS = ['company_formation', 'annual_compliance', 'tax_filing', 'registered_agent', 'legal_review', 'trust_setup', 'banking_setup', 'other'] as const
export const JOB_STATUSES = ['new', 'in_progress', 'waiting_client', 'completed', 'cancelled'] as const
export const STATUS_LABEL: Record<string, string> = { new: 'New', in_progress: 'In progress', waiting_client: 'Waiting on you', completed: 'Completed', cancelled: 'Cancelled' }
export const CLIENT_LINK_DAYS = 90

// Client link: a random token in the URL, only its hash stored. A new link replaces the old one.
export async function issueClientLink(jobId: string): Promise<string> {
  const token = randomToken()
  await db().query("UPDATE services.jobs SET client_token_hash = $2, client_token_expires = now() + make_interval(days => $3) WHERE id = $1",
    [jobId, sha256(token), CLIENT_LINK_DAYS])
  return useRuntimeConfig().public.appBaseUrl + '/job/' + token
}

export async function jobFromToken(token: string | undefined): Promise<{ id: string; title: string; service: string; status: string; due_date: string | null; client: string; contact_name: string; email: string; owner_email: string | null }> {
  if (!token || !/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw apiError('invalid_link', 'This link is not valid.', 404)
  const r = await db().query<{ id: string; title: string; service: string; status: string; due_date: string | null; client: string; contact_name: string; email: string; owner_email: string | null; client_token_expires: string }>(
    `SELECT j.id, j.title, j.service, j.status, to_char(j.due_date, 'YYYY-MM-DD') AS due_date, c.name AS client, c.contact_name, c.email,
            u.email AS owner_email, j.client_token_expires
       FROM services.jobs j JOIN services.clients c ON c.id = j.client_id LEFT JOIN core.users u ON u.id = j.owner_id
      WHERE j.client_token_hash = $1`, [sha256(token)])
  const row = r.rows[0]
  if (!row) throw apiError('invalid_link', 'This link is not valid.', 404)
  if (new Date(row.client_token_expires).getTime() < Date.now()) throw apiError('expired', 'This link has expired. Ask your contact at The Aidi Group for a new one.', 410)
  return row
}
