// Staff: open a savings plan (rate from settings, certificate PDF), confirm or reject requested deposits/withdrawals,
// record deposits/withdrawals made with the vendor, close a plan.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ action: z.enum(['create', 'txn', 'confirm', 'reject', 'close']), client_id: z.string().uuid().optional(), plan_id: z.string().uuid().optional(), txn_id: z.string().uuid().optional(),
    name: z.string().trim().max(120).optional(), currency: z.enum(['USD', 'NGN']).optional(), target: z.number().min(0).nullable().optional(), monthly: z.number().min(0).nullable().optional(), matures_on: z.string().optional(), rate: z.number().min(0).max(100).optional(),
    kind: z.enum(['deposit', 'withdrawal']).optional(), amount: z.number().positive().optional(), txn_date: z.string().optional(), note: z.string().max(300).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the details.')
  const d = b.data
  if (d.action === 'create') {
    if (!d.client_id) throw apiError('invalid', 'Choose the client.')
    const r = await railsFor(d.client_id)
    if (!r.cfg.savings) throw apiError('off', 'Savings plans are switched off for this country.', 400)
    if (r.c.model !== 'self_directed') throw apiError('invalid', 'Savings plans are for self-directed (subscription) clients.', 400)
    const rate = d.rate ?? r.cfg.savings_rate, cur = d.currency ?? 'USD', name = d.name || (cur + ' savings plan')
    const p = await one<{ id: string }>('INSERT INTO wm.savings_plans (client_id, name, currency, rate, target, monthly, provider, vendor, matures_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [d.client_id, name, cur, rate, d.target ?? null, d.monthly ?? null, r.cfg.savings_provider, r.cfg.savings_vendor || null, d.matures_on || null])
    const md = ['# Savings plan certificate', '', '**' + r.c.name + '**', '', '| Detail | |', '|---|---|', '| Plan | ' + name + ' |', '| Currency | ' + cur + ' |', '| Interest rate | ' + rate + '% a year, credited monthly |', '| Started | ' + new Date().toISOString().slice(0, 10) + ' |', '| Matures | ' + (d.matures_on || 'Open-ended') + ' |', '| Held with | ' + (r.cfg.savings_provider === 'manual' ? (r.cfg.savings_vendor || 'Partner') : r.cfg.savings_provider) + ' |', '', 'Interest is calculated on the confirmed balance each month. Rates can change for new deposits with notice.']
    const doc = await storePdf(await legalPdf(r.c.country === 'US' ? 'Aidi Wealth LLC' : 'Aidi Finance Limited', [{ title: 'Savings plan certificate', md: md.join('\n') }]), 'Savings certificate - ' + r.c.name + '.pdf', null).catch(() => null)
    if (doc) await db().query('UPDATE wm.savings_plans SET certificate_doc_id = $2 WHERE id = $1', [p.id, doc])
    await audit({ event, actorUserId: user.userId, action: 'wm.savings_open', objectType: 'wm_savings', objectId: p.id })
    return { ok: true, id: p.id }
  }
  if (d.action === 'txn') { if (!d.plan_id || !d.kind || !d.amount) throw apiError('invalid', 'Add the type and amount.'); await db().query("INSERT INTO wm.savings_txns (plan_id, kind, amount, status, txn_date, note, created_by) VALUES ($1,$2,$3,'confirmed',coalesce($4::date, current_date),$5,$6)", [d.plan_id, d.kind, d.amount, d.txn_date || null, d.note || null, user.userId]) }
  else if (d.action === 'confirm' || d.action === 'reject') await db().query("UPDATE wm.savings_txns SET status = $2 WHERE id = $1 AND status = 'requested'", [d.txn_id, d.action === 'confirm' ? 'confirmed' : 'rejected'])
  else if (d.action === 'close') await db().query("UPDATE wm.savings_plans SET status = 'closed' WHERE id = $1", [d.plan_id])
  await audit({ event, actorUserId: user.userId, action: 'wm.savings_' + d.action, objectType: 'wm_savings', objectId: d.plan_id ?? d.txn_id })
  return { ok: true }
})
