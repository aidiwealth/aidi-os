// Everything staff do on a wealth client: update details, household members, portal invite, family view link,
// external accounts, adviser links, KYC (Prembly BVN for Nigeria; manual for the US), and fees.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const c = (await db().query<{ id: string; name: string; country: 'US' | 'NG'; model: string; email: string | null; contact_name: string | null; entity_id: string | null; user_id: string | null }>('SELECT id, name, country, model, email, contact_name, entity_id, user_id FROM wm.clients WHERE id = $1', [id])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  const body = await readBody<Record<string, unknown>>(event)
  const a = String(body.action ?? '')
  const s = (k: string, max = 300) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '')
  const n = (k: string) => (body[k] === '' || body[k] == null ? null : Number(body[k]))
  if (a === 'update') {
    const model = s('model') || c.model
    if (model !== c.model) { const cfg = await wmSettings(); if (!cfg[c.country][model === 'managed' ? 'managed' : model === 'advisor' ? 'advisor' : 'self_directed']) throw apiError('model_off', 'That service model is switched off for this country.', 400) }
    await db().query('UPDATE wm.clients SET name = coalesce(nullif($2, \'\'), name), kind = coalesce(nullif($3, \'\'), kind), model = $4, status = coalesce(nullif($5, \'\'), status), tag = $6, contact_name = $7, email = $8, phone = $9, risk_profile = $10, notes = $11, updated_at = now() WHERE id = $1',
      [id, s('name', 200), s('kind'), model, s('status'), s('tag', 60) || null, s('contact_name', 200) || null, s('email', 254).toLowerCase() || null, s('phone', 40) || null, s('risk_profile', 60) || null, s('notes', 3000) || null])
    if (/^[0-9a-f-]{36}$/.test(s('entity_id')) && s('entity_id') !== c.entity_id) {
      if (!user.roles.some((r) => ['admin', 'gp'].includes(r))) throw apiError('forbidden', 'Only admins and partners can change the contracting entity.', 403)
      await db().query('UPDATE wm.clients SET entity_id = $2, updated_at = now() WHERE id = $1', [id, s('entity_id')])
      if (c.user_id) await db().query("UPDATE core.user_roles SET scope_entity_id = $2 WHERE user_id = $1 AND role_code = 'wealth_client'", [c.user_id, s('entity_id')])
    }
  } else if (a === 'delete') {
    if (!user.roles.includes('admin')) throw apiError('forbidden', 'Only admins can delete a wealth client.', 403)
    await db().query("UPDATE wealth.holdings SET wm_client_id = NULL WHERE wm_client_id = $1", [id]); await db().query('DELETE FROM wm.clients WHERE id = $1', [id])
  } else if (a === 'add_member') {
    if (!s('name')) throw apiError('invalid', 'Add a name.')
    await db().query('INSERT INTO wm.members (client_id, name, relationship, email) VALUES ($1,$2,$3,$4)', [id, s('name', 200), s('relationship', 60) || null, s('email', 254).toLowerCase() || null])
  } else if (a === 'remove_member') { await db().query('DELETE FROM wm.members WHERE id = $1 AND client_id = $2', [s('member_id'), id])
  } else if (a === 'view_link') {
    await db().query('UPDATE wm.view_links SET revoked = true WHERE client_id = $1', [id])
    const tok = newToken(); await db().query('INSERT INTO wm.view_links (client_id, token_hash) VALUES ($1,$2)', [id, sha256(tok)])
    return { ok: true, url: brands().aidi.url + '/wv/' + tok }
  } else if (a === 'revoke_link') { await db().query('UPDATE wm.view_links SET revoked = true WHERE client_id = $1', [id])
  } else if (a === 'invite') {
    if (!c.email) throw apiError('invalid', 'Add the client\'s email first.')
    const email = c.email, name = c.contact_name || c.name
    let uid = (await db().query<{ id: string }>('SELECT id FROM core.users WHERE email = $1', [email])).rows[0]?.id
    if (!uid) { const p = await one<{ id: string }>("INSERT INTO core.people (full_name, email, kind) VALUES ($1,$2,'client') ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id", [name, email]); uid = (await one<{ id: string }>('INSERT INTO core.users (person_id, email) VALUES ($1,$2) RETURNING id', [p.id, email])).id }
    await db().query('INSERT INTO core.memberships (user_id, invited_by) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, user.userId])
    if (!(await db().query("SELECT 1 FROM core.user_roles WHERE user_id = $1 AND role_code = 'wealth_client'", [uid])).rowCount) await db().query("INSERT INTO core.user_roles (user_id, role_code, scope_entity_id, granted_by) VALUES ($1,'wealth_client',$2,$3)", [uid, c.entity_id, user.userId])
    await db().query('UPDATE wm.clients SET user_id = $2, updated_at = now() WHERE id = $1', [id, uid])
    try { await sendInviteEmail(email, name, user.email) } catch (err) { console.error('[wm] invite email', err) }
  } else if (a === 'account') {
    if (body.delete && s('account_id')) await db().query('DELETE FROM wm.accounts WHERE id = $1 AND client_id = $2', [s('account_id'), id])
    else {
      const v = z.object({ institution: z.string().min(1).max(120), kind: z.enum(['bank', 'brokerage', 'crypto', 'savings', 'retirement', 'other']), name: z.string().max(120), currency: z.string().regex(/^[A-Z]{3}$/), balance: z.number().min(0), cash_part: z.number().min(0).nullable(), as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), managed_by: z.string().max(120) })
        .safeParse({ institution: s('institution', 120), kind: s('kind'), name: s('name', 120), currency: s('currency') || 'USD', balance: n('balance') ?? 0, cash_part: n('cash_part'), as_of: s('as_of') || new Date().toISOString().slice(0, 10), managed_by: s('managed_by', 120) })
      if (!v.success) throw apiError('invalid', 'Add the institution, type, currency and balance.')
      const d = v.data
      if (s('account_id')) await db().query('UPDATE wm.accounts SET institution = $3, kind = $4, name = $5, currency = $6, balance = $7, cash_part = $8, as_of = $9, managed_by = $10 WHERE id = $1 AND client_id = $2', [s('account_id'), id, d.institution, d.kind, d.name || null, d.currency, d.balance, d.cash_part, d.as_of, d.managed_by || null])
      else await db().query('INSERT INTO wm.accounts (client_id, institution, kind, name, currency, balance, cash_part, as_of, managed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, d.institution, d.kind, d.name || null, d.currency, d.balance, d.cash_part, d.as_of, d.managed_by || null])
    }
  } else if (a === 'link_firm') {
    if (body.delete) await db().query('DELETE FROM wm.client_firms WHERE id = $1 AND client_id = $2', [s('link_id'), id])
    else await db().query('INSERT INTO wm.client_firms (client_id, firm_id, adviser_name, started_on) VALUES ($1,$2,$3,$4) ON CONFLICT (client_id, firm_id) DO UPDATE SET adviser_name = EXCLUDED.adviser_name, started_on = EXCLUDED.started_on', [id, s('firm_id'), s('adviser_name', 120) || null, s('started_on') || null])
  } else if (a === 'kyc_bvn') {
    if (c.country !== 'NG') throw apiError('invalid', 'BVN checks are for Nigerian clients.')
    const bvn = s('bvn'); if (!/^\d{11}$/.test(bvn)) throw apiError('invalid', 'Enter the 11-digit BVN.')
    const r = await premblyBvn(bvn)
    await db().query("UPDATE wm.clients SET bvn_enc = $2, bvn_last4 = $3, nin_enc = coalesce($4, nin_enc), nin_last4 = coalesce($5, nin_last4), kyc_status = $6, kyc_provider = 'prembly', kyc_detail = $7, kyc_checked_at = now(), updated_at = now() WHERE id = $1",
      [id, encryptText(bvn), bvn.slice(-4), /^\d{11}$/.test(s('nin')) ? encryptText(s('nin')) : null, /^\d{11}$/.test(s('nin')) ? s('nin').slice(-4) : null, r.ok ? 'verified' : 'failed', JSON.stringify({ detail: r.detail, name: [r.data.firstName, r.data.middleName, r.data.lastName].filter(Boolean).join(' '), dob: r.data.dateOfBirth ?? null })])
    await audit({ event, actorUserId: user.userId, action: 'wm.kyc_bvn', objectType: 'wm_client', objectId: id, detail: { ok: r.ok } })
    return { ok: true, verified: r.ok, detail: r.detail }
  } else if (a === 'kyc_status') {
    await db().query("UPDATE wm.clients SET kyc_status = $2, kyc_provider = coalesce(nullif($3, ''), kyc_provider, 'manual'), kyc_checked_at = now(), updated_at = now() WHERE id = $1", [id, z.enum(['not_started', 'pending', 'verified', 'failed']).parse(s('status')), s('provider', 40)])
  } else if (a === 'advisory_invoice') {
    const cfg = await wmSettings(); const sum = await clientSummary(id); const annual = advisoryFee(sum.totals.invested + sum.totals.cash, cfg.advisory_tiers)
    const per = s('period', 40) || ('Q' + (Math.floor(new Date().getUTCMonth() / 3) + 1) + ' ' + new Date().getUTCFullYear())
    const f = await one<{ id: string }>("INSERT INTO wm.fees (client_id, kind, period, amount, currency, entity_id, method, note) VALUES ($1,'advisory',$2,$3,'USD',$4,'transfer',$5) RETURNING id", [id, per, Math.round((annual / 4) * 100) / 100, c.entity_id, 'Quarter of the yearly advisory fee on ' + Math.round(sum.totals.invested + sum.totals.cash).toLocaleString('en-US') + ' USD'])
    await issueFee(f.id)
  } else if (a === 'fee') {
    if (s('fee_id') && body.status) {
      await db().query("UPDATE wm.fees SET status = $2, paid_on = CASE WHEN $2 = 'paid' THEN coalesce($3::date, current_date) ELSE NULL END WHERE id = $1", [s('fee_id'), z.enum(['due', 'paid', 'waived']).parse(s('status')), s('paid_on') || null])
      if (s('status') === 'paid') await bookFee(s('fee_id')); else await db().query('DELETE FROM finance.journal WHERE wm_fee_id = $1', [s('fee_id')])
    } else {
      const kind = z.enum(['subscription', 'advisory', 'referral']).parse(s('kind'))
      const amt = n('amount'); if (amt == null || amt < 0) throw apiError('invalid', 'Enter the amount.')
      const nf = await one<{ id: string }>('INSERT INTO wm.fees (client_id, firm_id, kind, period, amount, currency, entity_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [id, s('firm_id') || null, kind, s('period', 40) || null, amt, s('currency') || (c.country === 'NG' ? 'NGN' : 'USD'), c.entity_id, s('note', 500) || null]); await taxFee(nf.id)
    }
  } else throw apiError('invalid', 'Unknown action.')
  await audit({ event, actorUserId: user.userId, action: 'wm.client_' + a, objectType: 'wm_client', objectId: id })
  return { ok: true }
})
