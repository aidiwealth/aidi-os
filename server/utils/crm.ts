// Investor CRM helpers: find or create a contact by email, and log what they did.
export async function crmContact(orgId: string, email: string, name?: string): Promise<string | null> {
  const e = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null
  return asPlatform(async () => {
    const r = await db().query<{ id: string }>('INSERT INTO crm.contacts (organization_id, name, email) VALUES ($1,$2,$3) ON CONFLICT (organization_id, email) DO UPDATE SET email = EXCLUDED.email RETURNING id', [orgId, (name || e.split('@')[0] || e).slice(0, 200), e])
    return r.rows[0]?.id ?? null
  })
}
export async function logActivity(orgId: string, email: string | null | undefined, kind: 'update_opened' | 'update_sent' | 'file_viewed' | 'deck_viewed', label: string, refId?: string | null): Promise<void> {
  if (!email) return
  try {
    const id = await crmContact(orgId, email)
    if (id) await asPlatform(() => db().query('INSERT INTO crm.activity (organization_id, contact_id, kind, label, ref_id) VALUES ($1,$2,$3,$4,$5)', [orgId, id, kind, label.slice(0, 300), refId ?? null]))
  } catch (err) { console.error('[crm] activity failed', err) }
}
export const STAGE_COLORS = ['grey', 'blue', 'purple', 'teal', 'amber', 'green', 'red'] as const
