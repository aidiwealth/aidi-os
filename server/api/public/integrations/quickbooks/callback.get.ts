// Intuit sends the user back here after they approve: store the tokens (encrypted), then return to Financials.
export default defineEventHandler(async (event) => {
  const q = getQuery(event), origin = publicOrigin(event)
  if (q.error) return sendRedirect(event, '/financials?qb=cancelled')
  const st = readState(String(q.state ?? ''))
  if (!st || !q.code || !q.realmId) return sendRedirect(event, '/financials?qb=failed')
  setOrgContext(st.o)
  const t = await qbExchange(String(q.code), origin)
  await db().query(`INSERT INTO financials.connections (organization_id, subject, provider, realm_id, access_enc, refresh_enc, expires_at, refresh_expires_at, connected_by) VALUES ($1,$2,'quickbooks',$3,$4,$5, now() + make_interval(secs => $6), now() + make_interval(secs => $7), $8)
    ON CONFLICT (organization_id, subject, provider) DO UPDATE SET realm_id = EXCLUDED.realm_id, access_enc = EXCLUDED.access_enc, refresh_enc = EXCLUDED.refresh_enc, expires_at = EXCLUDED.expires_at, refresh_expires_at = EXCLUDED.refresh_expires_at, connected_by = EXCLUDED.connected_by, updated_at = now()`,
    [st.o, st.s, String(q.realmId), encryptText(t.access_token), encryptText(t.refresh_token), t.expires_in, t.x_refresh_token_expires_in, st.u])
  try { const c = await qbConn(st.s); if (c) { const info = await qbGet<{ CompanyInfo?: { CompanyName?: string } }>(c, '/companyinfo/' + c.realm_id); await db().query('UPDATE financials.connections SET company_name = $2 WHERE id = $1', [c.id, info.CompanyInfo?.CompanyName ?? null]) } } catch { /* name is optional */ }
  await audit({ event, actorUserId: st.u, action: 'integrations.quickbooks_connect', objectType: 'organization', objectId: st.o, detail: { subject: st.s } })
  return sendRedirect(event, '/financials?qb=connected&subject=' + encodeURIComponent(st.s))
})
