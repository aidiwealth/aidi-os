// Save a checked cap table proposal into a cap table. "replace" clears it first; "add" keeps it and adds what is new,
// matching holders, classes and plans by name and skipping rows that are already there; "new" makes a new cap table.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const body = (await readBody(event)) as { proposal?: unknown; mode?: string; ct?: string; name?: string; attach?: { docs?: { name: string; id: string }[]; room?: boolean } }
  const mode = z.enum(['replace', 'add', 'new']).parse(body.mode ?? 'add')
  const ct = mode === 'new' ? (await one<{ id: string }>('INSERT INTO equity.captables (name, is_main, created_by) VALUES ($1, NOT EXISTS (SELECT 1 FROM equity.captables), $2) RETURNING id', [String(body.name ?? '').trim().slice(0, 120) || 'Imported cap table', user.userId])).id : await capTableId(body.ct)
  const p0 = ProposalSchema.safeParse(body.proposal)
  if (!p0.success) throw apiError('invalid', 'Check ' + (p0.error.issues[0]?.path.join('.') || 'the cap table') + '.')
  const p = tidy(p0.data), today = new Date().toISOString().slice(0, 10), asOf = p.as_of ?? today
  const key = (x: string) => x.trim().toLowerCase().replace(/\s+/g, ' ')
  const c = await db().connect(), n = { classes: 0, holders: 0, issuances: 0, plans: 0, grants: 0, convertibles: 0, skipped: 0 }
  try {
    await c.query('BEGIN')
    if (mode === 'replace') for (const t of ['grants', 'convertibles', 'issuances', 'plans', 'classes', 'holders']) await c.query('DELETE FROM equity.' + t + ' WHERE captable_id = $1', [ct])
    const ids = async (t: string) => new Map((await c.query<{ id: string; name: string }>('SELECT id, name FROM equity.' + t + ' WHERE captable_id = $1', [ct])).rows.map((r) => [key(r.name), r.id]))
    const H = await ids('holders'), C = await ids('classes'), P = await ids('plans')
    for (const h of p.holders) if (!H.has(key(h.name))) { H.set(key(h.name), (await c.query<{ id: string }>('INSERT INTO equity.holders (captable_id, name, email, kind) VALUES ($4, $1,$2,$3) RETURNING id', [h.name, h.email, h.kind, ct])).rows[0]!.id); n.holders++ }
    for (const x of p.classes) if (!C.has(key(x.name))) { C.set(key(x.name), (await c.query<{ id: string }>('INSERT INTO equity.classes (captable_id, name, kind, liq_pref, participating, seniority, issue_price) VALUES ($7, $1,$2,$3,$4,$5,$6) RETURNING id', [x.name, x.kind, x.kind === 'common' ? 0 : x.liq_pref, x.participating, x.kind === 'common' ? 0 : x.seniority, x.issue_price, ct])).rows[0]!.id); n.classes++ }
    for (const x of p.plans) {
      if (!P.has(key(x.name))) { P.set(key(x.name), (await c.query<{ id: string }>('INSERT INTO equity.plans (captable_id, name, reserved) VALUES ($3, $1,$2) RETURNING id', [x.name, x.reserved, ct])).rows[0]!.id); n.plans++ }
      else await c.query('UPDATE equity.plans SET reserved = GREATEST(reserved, $2) WHERE id = $1', [P.get(key(x.name)), x.reserved])
    }
    for (const i of p.issuances) {
      const h = H.get(key(i.holder))!, cl = C.get(key(i.class))!, on = i.issued_on ?? asOf
      if ((await c.query('SELECT 1 FROM equity.issuances WHERE captable_id = $6 AND holder_id = $1 AND class_id = $2 AND shares = $3 AND (issued_on = $4 OR certificate IS NOT DISTINCT FROM $5)', [h, cl, i.shares, on, i.certificate, ct])).rowCount) { n.skipped++; continue }
      await c.query('INSERT INTO equity.issuances (captable_id, holder_id, class_id, shares, price, issued_on, certificate, notes) VALUES ($8, $1,$2,$3,$4,$5,$6,$7)', [h, cl, i.shares, i.price, on, i.certificate, i.source ? 'From ' + i.source : null, ct]); n.issuances++
    }
    for (const g of p.grants) {
      const h = H.get(key(g.holder))!, pl = P.get(key(g.plan))!, on = g.granted_on ?? asOf
      if ((await c.query('SELECT 1 FROM equity.grants WHERE captable_id = $5 AND holder_id = $1 AND plan_id = $2 AND shares = $3 AND granted_on = $4', [h, pl, g.shares, on, ct])).rowCount) { n.skipped++; continue }
      await c.query('INSERT INTO equity.grants (captable_id, plan_id, holder_id, kind, shares, strike, granted_on, vest_start, vest_months, cliff_months, exercised) VALUES ($11, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [pl, h, g.kind, g.shares, g.strike, on, g.vest_start ?? on, g.vest_months ?? 0, g.cliff_months ?? 0, Math.min(g.exercised, g.shares), ct]); n.grants++
    }
    for (const v of p.convertibles) {
      const h = H.get(key(v.holder))!, on = v.issued_on ?? asOf
      if ((await c.query("SELECT 1 FROM equity.convertibles WHERE captable_id = $4 AND holder_id = $1 AND kind = $2 AND amount = $3 AND status = 'outstanding'", [h, v.kind, v.amount, ct])).rowCount) { n.skipped++; continue }
      await c.query('INSERT INTO equity.convertibles (captable_id, holder_id, kind, amount, currency, valuation_cap, discount_pct, post_money, mfn, interest_pct, issued_on, maturity_on) VALUES ($12, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [h, v.kind, v.amount, p.currency, v.valuation_cap, v.discount_pct, v.kind === 'safe' ? v.post_money : false, v.mfn, v.interest_pct, on, v.maturity_on, ct]); n.convertibles++
    }
    await c.query('UPDATE equity.captables SET updated_at = now() WHERE id = $1', [ct])
    await c.query('COMMIT')
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e } finally { c.release() }
  // With the founder's permission: each source document is attached to the holders (and SAFEs / notes / share
  // issuances) it was read from, filed under Financing, and put in the data room's Financing room by round.
  let attached = 0
  const docs = (body.attach?.docs ?? []).filter((d) => d && typeof d.id === 'string' && /^[0-9a-f-]{36}$/.test(d.id) && typeof d.name === 'string').slice(0, 50)
  if (docs.length) {
    const from = (src: string | null | undefined) => docs.filter((d) => (src ?? '').toLowerCase().includes(d.name.toLowerCase()) || (src ?? '').toLowerCase().includes(d.name.toLowerCase().replace(/\.[a-z0-9]+$/, '')))
    const holderId = async (name: string) => (await db().query<{ id: string }>('SELECT id FROM equity.holders WHERE captable_id = $1 AND lower(name) = lower($2) LIMIT 1', [ct, name.trim()])).rows[0]?.id
    const tryAttach = async (a: Parameters<typeof attachHolderDoc>[0]) => { try { await attachHolderDoc(a); attached++ } catch (e) { console.error('[equity] attach', (e as Error).message) } }
    for (const v of p.convertibles) for (const d of from(v.source)) {
      const h = await holderId(v.holder); if (!h) continue
      const cv = (await db().query<{ id: string }>('SELECT id FROM equity.convertibles WHERE captable_id = $1 AND holder_id = $2 AND kind = $3 AND amount = $4 ORDER BY created_at DESC LIMIT 1', [ct, h, v.kind, v.amount])).rows[0]?.id
      await tryAttach({ captableId: ct, holderId: h, convertibleId: cv ?? null, documentId: d.id, kind: v.kind === 'note' ? 'note' : 'safe', hint: d.name, toRoom: body.attach?.room !== false, userId: user.userId })
    }
    for (const i of p.issuances) for (const d of from(i.source)) {
      const h = await holderId(i.holder); if (!h) continue
      const is = (await db().query<{ id: string }>('SELECT i.id FROM equity.issuances i JOIN equity.classes c ON c.id = i.class_id WHERE i.captable_id = $1 AND i.holder_id = $2 AND i.shares = $3 AND lower(c.name) = lower($4) ORDER BY i.created_at DESC LIMIT 1', [ct, h, i.shares, i.class])).rows[0]?.id
      await tryAttach({ captableId: ct, holderId: h, issuanceId: is ?? null, documentId: d.id, kind: /certificate|cert\b/i.test(d.name + ' ' + (i.source ?? '')) ? 'certificate' : 'spa', hint: d.name, toRoom: body.attach?.room !== false, userId: user.userId })
    }
  }
  await audit({ event, actorUserId: user.userId, action: 'equity.imported', objectType: 'equity_import', detail: { mode, ...n, documents_attached: attached } })
  return { ok: true, ct, ...n, attached }
})
