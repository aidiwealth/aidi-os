// Which data sources are connected for a subject (Financials).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'admin')
  const subject = String(getQuery(event).subject ?? '')
  const rows = (await db().query<{ provider: string; company_name: string | null; settings: Record<string, string>; created_at: string; last_pulled_at: string | null; refresh_expires_at: string | null }>('SELECT provider, company_name, settings, created_at, last_pulled_at, refresh_expires_at FROM financials.connections WHERE subject = $1', [subject])).rows
  const qb = rows.find((r) => r.provider === 'quickbooks'), gs = rows.find((r) => r.provider === 'gsheet')
  return { quickbooks: { configured: qbConfigured(), connected: !!qb, company: qb?.company_name ?? null, last_pulled_at: qb?.last_pulled_at ?? null, expires: qb?.refresh_expires_at ?? null }, gsheet: { url: gs?.settings?.url ?? '' } }
})
