// Notice of intent to resign as registered agent. When a registered agent renewal is still unpaid 30 days after it
// was due (a wallet subscription or a services invoice), the client gets a letter on Finvry letterhead in their
// message centre and by email (PDF attached). One notice per due date. A suspended registered agent renewal resumes
// by itself once the client's wallet covers it.
import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

export interface RaLetter {
  issuer: { name: string; legal?: string; address: string; phone?: string; email?: string; website?: string }
  agent: string
  to: { name: string; company: string; address?: string | null }
  reference: string; date: string; due: string; amount: string; payBy: string; state?: string | null; payUrl: string
}
// Finvry colours: navy and green.
const NAVY = rgb(0, 24 / 255, 58 / 255), BLUE = rgb(28 / 255, 84 / 255, 125 / 255), SKY = rgb(5 / 255, 135 / 255, 74 / 255)
const TINT = rgb(238 / 255, 244 / 255, 249 / 255), MUT = rgb(0.38, 0.41, 0.46), INK = rgb(0.1, 0.12, 0.16), WHITE = rgb(1, 1, 1)
const clean = (s: string) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/—/g, '-').replace(/[^\x20-\x7E -ÿ–\n]/g, '')

export async function raNoticePdf(L: RaLetter): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit)
  pdf.setTitle('Notice of intent to resign as registered agent'); pdf.setAuthor(clean(L.issuer.name)); pdf.setProducer('Finvry')
  const reg = await pdf.embedFont(Buffer.from(GARAMOND_TTF.regular, 'base64'), { subset: true })
  const bold = await pdf.embedFont(Buffer.from(GARAMOND_TTF.semibold, 'base64'), { subset: true })
  const W = 612, H = 792, M = 50
  const page: PDFPage = pdf.addPage([W, H])
  const text = (t: string, x: number, y: number, size = 11, font: PDFFont = reg, color = INK) => page.drawText(clean(t), { x, y, size, font, color })
  const right = (t: string, xr: number, y: number, size = 11, font: PDFFont = reg, color = INK) => text(t, xr - font.widthOfTextAtSize(clean(t), size), y, size, font, color)
  const center = (t: string, y: number, size: number, font: PDFFont, color = INK) => text(t, (W - font.widthOfTextAtSize(clean(t), size)) / 2, y, size, font, color)
  const wrap = (t: string, width: number, size: number, font: PDFFont = reg) => { const out: string[] = []; for (const para of clean(t).split('\n')) { let line = ''; for (const w of para.split(/\s+/).filter(Boolean)) { const tt = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(tt, size) > width && line) { out.push(line); line = w } else line = tt } out.push(line) } return out }
  // Address lines: as written; a one-line address splits at commas, keeping "City, ST 12345" together.
  const addr = (a?: string | null) => { const ls = (a ?? '').split(/\s*\n\s*/).map((s) => s.trim()).filter(Boolean); if (ls.length !== 1) return ls
    const p = ls[0]!.split(/\s*,\s*/).filter(Boolean); if (p.length > 2 && /^[A-Za-z]{2}\s*\d{5}/.test(p[p.length - 1]!)) p.splice(-2, 2, p[p.length - 2] + ', ' + p[p.length - 1]); return p }

  // Letterhead: sender (left), Finvry logo and contact (right).
  let y = H - M - 4
  text(L.issuer.name.toUpperCase(), M, y, 11, bold, NAVY); y -= 15
  for (const l of addr(L.issuer.address)) { text(l.toUpperCase(), M, y, 10.5, reg, INK); y -= 14 }
  const lg = LOGO_PNG.finvry, img = await pdf.embedPng(Buffer.from(lg.b64, 'base64')), lh = 26, lw = lh * lg.w / lg.h
  page.drawImage(img, { x: W - M - lw, y: H - M - lh + 8, width: lw, height: lh })
  let ry = H - M - lh - 8
  for (const l of [L.issuer.phone ? 'T: ' + L.issuer.phone : '', L.issuer.email ?? ''].filter(Boolean)) { right(l, W - M, ry, 10, reg, MUT); ry -= 13 }

  // Recipient (left) and the reference box (right).
  y = Math.min(y, ry) - 26
  const top = y
  for (const l of [L.to.name, L.to.company, ...addr(L.to.address)].filter(Boolean)) { for (const s of wrap(l.toUpperCase(), 280, 10.5)) { text(s, M, y, 10.5, reg, INK); y -= 14 } }
  const bw = 214, bx = W - M - bw, bh = 118, by = top + 12 - bh
  page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: TINT })
  page.drawRectangle({ x: bx, y: by, width: 3, height: bh, color: SKY })
  text('Reference', bx + 16, top - 6, 10.5, bold, NAVY); text(L.reference, bx + 16, top - 20, 11, bold, INK)
  let ky = top - 46
  for (const [k, v] of [['Date', L.date], ['Due date', L.due], ['Amount', L.amount]] as [string, string][]) { text(k + ':', bx + 16, ky, 10.5, reg, MUT); right(v, bx + bw - 14, ky, 10.5, reg, INK); ky -= 18 }
  y = Math.min(y, by) - 26

  // Banner.
  const bH = 116, bY = y - bH
  page.drawRectangle({ x: M, y: bY, width: W - 2 * M, height: bH, color: NAVY })
  page.drawLine({ start: { x: M + 22, y: bY }, end: { x: M + 58, y: bY + bH }, thickness: 0.8, color: rgb(0.12, 0.26, 0.42) })
  page.drawLine({ start: { x: W - M - 58, y: bY + bH }, end: { x: W - M - 22, y: bY }, thickness: 0.8, color: rgb(0.12, 0.26, 0.42) })
  page.drawRectangle({ x: M, y: bY, width: W - 2 * M, height: 3, color: SKY })
  center('NOTICE OF INTENT TO RESIGN', bY + bH - 42, 21, bold, WHITE)
  center('AS REGISTERED AGENT', bY + bH - 66, 21, bold, WHITE)
  center('If you have recently submitted payment, please disregard this notice.', bY + 20, 10.5, reg, rgb(0.74, 0.85, 0.93))
  y = bY - 30

  // Body.
  const co = L.to.company
  const paras = [
    L.agent + ' currently serves as the registered agent for ' + co + ' through ' + L.issuer.name + '. Payment for the Registered Agent service was due on ' + L.due + ' and remains unpaid.',
    'This is a formal notice that ' + L.agent + ', the registered agent for ' + co + ', intends to resign as registered agent. Please be advised that without a registered agent, the status and/or standing of ' + co + ' may be adversely affected.',
    'If payment is not received by ' + L.payBy + ', ' + L.agent + ' may file its resignation' + (L.state ? ' with the ' + L.state + ' Secretary of State' : ' with the state') + ' without further notice.']
  for (const p of paras) { for (const s of wrap(p, W - 2 * M - 20, 12)) { text(s, M + 10, y, 12); y -= 16 } y -= 6 }
  y -= 18
  text('Renew today by one of these payment options:', M + 10, y, 16, bold, NAVY); y -= 18
  text('It is very important that you submit your payment for Registered Agent service to avoid issues with the state.', M + 10, y, 11, reg, BLUE); y -= 34

  // Payment options: three columns with simple drawn icons.
  const colW = (W - 2 * M) / 3
  const opts: [string, string[]][] = [['Online', [L.payUrl.replace(/^https?:\/\//, '')]], ['By mail', addr(L.issuer.address)], [L.issuer.phone ? 'By phone' : 'By email', [L.issuer.phone || L.issuer.email || '']]]
  opts.forEach(([h, lines], i) => {
    const x = M + 10 + i * colW, iy = y - 6
    page.drawRectangle({ x, y: iy - 16, width: 30, height: 30, color: TINT })
    if (i === 0) { page.drawRectangle({ x: x + 7, y: iy - 5, width: 16, height: 11, borderColor: NAVY, borderWidth: 1.1 }); page.drawLine({ start: { x: x + 5, y: iy - 8 }, end: { x: x + 25, y: iy - 8 }, thickness: 1.3, color: NAVY }) }
    else if (i === 1) { page.drawRectangle({ x: x + 7, y: iy - 8, width: 16, height: 12, borderColor: NAVY, borderWidth: 1.1 }); page.drawLine({ start: { x: x + 7, y: iy + 4 }, end: { x: x + 15, y: iy - 3 }, thickness: 1, color: NAVY }); page.drawLine({ start: { x: x + 23, y: iy + 4 }, end: { x: x + 15, y: iy - 3 }, thickness: 1, color: NAVY }) }
    else text(L.issuer.phone ? 'T' : '@', x + 10, iy - 7, 15, bold, NAVY)
    text(h, x + 40, iy + 4, 11.5, bold, NAVY)
    let ly = iy - 10; for (const l of lines) for (const s of wrap(l, colW - 50, 9.5)) { text(s, x + 40, ly, 9.5, reg, INK); ly -= 12 }
  })

  // Footer.
  page.drawLine({ start: { x: M, y: 78 }, end: { x: W - M, y: 78 }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) })
  text(L.issuer.name.toUpperCase() + (L.issuer.legal && L.issuer.legal !== L.issuer.name ? '  ·  ' + L.issuer.legal.toUpperCase() : ''), M, 62, 10, bold, NAVY)
  text(addr(L.issuer.address).join(', ').toUpperCase(), M, 49, 9, reg, MUT)
  right(L.issuer.website ?? 'finvry.com', W - M, 62, 10, reg, BLUE)
  return pdf.save()
}

const fmt = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' })
const long = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

interface Cand { source: 'subscription' | 'invoice'; source_id: string; client_id: string; due: string; amount: number; currency: string; reference: string; company_id: string | null; company_hint: string | null }

// Send every notice that is due. Runs inside the daily wallet cron (as the platform).
export async function runRaNotices(): Promise<number> {
  const subs = (await db().query<Cand>(`SELECT 'subscription' AS source, s.id AS source_id, s.client_id, to_char(s.overdue_since, 'YYYY-MM-DD') AS due, s.amount_minor::float / 100 AS amount, s.currency,
      'RA-' || upper(substr(replace(s.id::text, '-', ''), 1, 8)) AS reference, NULL::uuid AS company_id, s.details->>'company' AS company_hint
    FROM wallet.subscriptions s WHERE s.code = 'registered_agent' AND s.client_id IS NOT NULL AND s.status IN ('active', 'suspended') AND s.overdue_since <= current_date - 30
      AND NOT EXISTS (SELECT 1 FROM services.ra_notices n WHERE n.source = 'subscription' AND n.source_id = s.id AND n.due_date = s.overdue_since)`)).rows
  const invs = (await db().query<Cand>(`SELECT 'invoice' AS source, i.id AS source_id, i.client_id, to_char(i.due_date, 'YYYY-MM-DD') AS due, i.currency, i.number AS reference, i.company_id, NULL AS company_hint,
      coalesce((SELECT sum((l->>'amount')::numeric) FROM jsonb_array_elements(i.lines) l WHERE l->>'description' ILIKE '%registered agent%'), i.amount)::float AS amount
    FROM services.invoices i WHERE i.status = 'sent' AND i.due_date <= current_date - 30 AND EXISTS (SELECT 1 FROM jsonb_array_elements(i.lines) l WHERE l->>'description' ILIKE '%registered agent%')
      AND NOT EXISTS (SELECT 1 FROM services.ra_notices n WHERE n.source = 'invoice' AND n.source_id = i.id AND n.due_date = i.due_date)`)).rows
  let n = 0
  for (const c of [...subs, ...invs]) { try { if (await sendRaNotice(c)) n++ } catch (e) { console.error('[ra notice] failed', c.source, c.source_id, e) } }
  return n
}

async function sendRaNotice(c: Cand): Promise<boolean> {
  const cl = (await db().query<{ organization_id: string; name: string; contact_name: string | null; emails_muted: boolean }>('SELECT organization_id, name, contact_name, emails_muted FROM services.clients WHERE id = $1', [c.client_id])).rows[0]
  if (!cl) return false
  const cos = (await db().query<{ id: string; name: string; address: string | null; jurisdiction: string | null; registered_agent: string }>("SELECT id, name, address, jurisdiction, registered_agent FROM services.companies WHERE client_id = $1 ORDER BY (registered_agent = 'ours') DESC, created_at", [c.client_id])).rows
  const ours = cos.filter((x) => x.registered_agent === 'ours')
  const co = (c.company_id ? cos.find((x) => x.id === c.company_id) : undefined) ?? (c.company_hint ? cos.find((x) => x.name.toLowerCase() === c.company_hint!.toLowerCase()) : undefined) ?? (ours.length === 1 ? ours[0] : undefined)
  const company = co?.name ?? (ours.length ? ours.map((x) => x.name).join(', ') : cl.name)
  // Claim the notice first so a second run never sends it twice.
  const claim = await db().query<{ id: string }>('INSERT INTO services.ra_notices (organization_id, client_id, source, source_id, due_date, amount, currency, company) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id', [cl.organization_id, c.client_id, c.source, c.source_id, c.due, c.amount, c.currency, company])
  const nid = claim.rows[0]?.id; if (!nid) return false
  try {
    const set = (await db().query<{ b: { us?: { issuer?: string; address?: string; phone?: string; email?: string } } | null }>("SELECT settings->'cs_billing' AS b FROM core.organizations WHERE id = $1", [cl.organization_id])).rows[0]?.b?.us ?? {}
    const issuer = { name: 'Finvry', legal: set.issuer || 'Aidi Ventures LLC', address: set.address || '6472 Camden Ave, Suite 204\nSan Jose, CA', phone: set.phone || '', email: set.email || 'hello@finvry.com', website: 'finvry.com' }
    const agent = agentFor(await raAgents(), co?.jurisdiction ?? ours[0]?.jurisdiction ?? null).name
    const finvry = brands().finvry.url
    const payUrl = c.source === 'invoice' ? finvry + '/bill/' + billToken(c.source_id) : finvry + '/wallet'
    const today = new Date(), payBy = new Date(today.getTime() + 30 * 86400000)
    const money = (c.currency === 'NGN' ? 'NGN ' : '$') + c.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const bytes = await raNoticePdf({ issuer, to: { name: cl.contact_name || cl.name, company, address: co?.address ?? null }, reference: c.reference, date: fmt(today.toISOString().slice(0, 10)), due: fmt(c.due), amount: money, payBy: long(payBy), state: usState(co?.jurisdiction ?? ours[0]?.jurisdiction ?? null), payUrl, agent })
    // Store the letter as a document of the services team, attached to a new conversation with the client.
    const id = randomUUID(), file = 'Notice of intent to resign as registered agent - ' + company.replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 80) + '.pdf'
    await putObject({ key: 'documents/' + id + '.pdf', body: bytes, contentType: 'application/pdf' })
    await db().query("INSERT INTO core.documents (id, organization_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by, area) VALUES ($1,$2,$3,'other','normal',$4,'application/pdf',$5,$6,NULL,'services')",
      [id, cl.organization_id, cl.name + ' — ' + file, 'documents/' + id + '.pdf', bytes.length, createHash('sha256').update(bytes).digest('hex')])
    const how = c.source === 'invoice' ? 'Pay the invoice online: ' + payUrl : 'Top up your Finvry wallet (' + payUrl + ') and we collect the renewal automatically.'
    const body = '**Notice of intent to resign as registered agent**\n\n' + agent + ' currently serves as the registered agent for ' + company + ' through Finvry. Payment of ' + money + ' for the Registered Agent service was due on ' + long(new Date(c.due + 'T12:00:00Z')) + ' and remains unpaid.\n\nThis is a formal notice that ' + agent + ', the registered agent for ' + company + ', intends to resign as registered agent. Without a registered agent, the status and/or standing of ' + company + ' may be adversely affected.\n\n**Please pay by ' + long(payBy) + '.** ' + how + ' If payment is not received by then, ' + agent + ' may file its resignation with the state without further notice.\n\nThe notice is attached. If you have recently submitted payment, please disregard this notice.'
    const thread = await postMessage({ orgId: cl.organization_id, clientId: c.client_id, fromTeam: true, body, documentId: id, category: 'legal', subject: 'Notice of intent to resign as registered agent — ' + company })
    let emailed = 0
    if (!cl.emails_muted) {
      const to = await clientRecipients(c.client_id)
      const link = to.portal ? finvry + '/client/messages?thread=' + thread : payUrl
      for (const e of to.emails) { try { await sendRaNoticeEmail({ to: e, company, agent, amount: money, due: long(new Date(c.due + 'T12:00:00Z')), payBy: long(payBy), link, portal: to.portal, file: { filename: file, content: bytes } }); emailed++ } catch (err) { console.error('[ra notice] email failed', err) } }
    }
    await db().query('UPDATE services.ra_notices SET document_id = $2, thread_id = $3, emailed = $4 WHERE id = $1', [nid, id, thread, emailed])
    // 30 days unpaid: the agent resigns. Pause the registered agent renewal (no further charges), mark the company and
    // stop the renewal reminders. The team undoes this by setting the agent back to ours and resuming the renewal.
    const on = today.toISOString().slice(0, 10)
    await db().query("UPDATE wallet.subscriptions SET status = 'suspended', last_error = $2, details = details || $3::jsonb, updated_at = now() WHERE client_id = $1 AND code = 'registered_agent' AND status <> 'cancelled'", [c.client_id, 'Registered agent resigned on ' + fmt(on) + ' (renewal unpaid)', JSON.stringify({ paused: 'resigned', paused_on: on })])
    const ids = co ? [co.id] : ours.map((x) => x.id)
    if (ids.length) await db().query("UPDATE services.companies SET registered_agent = 'none', agent_resigned_on = $2 WHERE id = ANY($1::uuid[]) AND registered_agent = 'ours'", [ids, on])
    await db().query("UPDATE compliance.obligations o SET active = false FROM core.entities e WHERE e.id = o.entity_id AND e.organization_id = (SELECT workspace_id FROM services.clients WHERE id = $1) AND o.active AND (o.service_code = 'registered_agent' OR o.category = 'registered_agent')", [c.client_id])
    return true
  } catch (e) { await db().query('DELETE FROM services.ra_notices WHERE id = $1', [nid]); throw e }
}

// A suspended registered agent renewal starts again on its own once the client's wallet covers it.
export async function resumeRaRenewals(): Promise<number> {
  const subs = (await db().query<{ id: string; organization_id: string; name: string; amount_minor: string; currency: string; interval: string; overdue_since: string }>("SELECT id, organization_id, name, amount_minor::text, currency, interval, to_char(overdue_since, 'YYYY-MM-DD') AS overdue_since FROM wallet.subscriptions WHERE code = 'registered_agent' AND status = 'suspended' AND overdue_since IS NOT NULL AND amount_minor > 0 AND coalesce(details->>'paused', '') NOT IN ('resigned', 'arrears')")).rows
  let n = 0
  for (const s of subs) {
    const w = await walletOf(s.organization_id), amt = Number(s.amount_minor)
    if (w.currency !== s.currency || w.balance_minor < amt) continue
    try {
      await postLedger(s.organization_id, 'debit', amt, 'service', s.name + ' (renewal)', { reference: 'sub:' + s.id + ':' + s.overdue_since })
      await db().query("UPDATE wallet.subscriptions SET status = 'active', next_charge_at = overdue_since + CASE WHEN interval = 'month' THEN interval '1 month' ELSE interval '1 year' END, failures = 0, last_error = NULL, overdue_since = NULL, updated_at = now() WHERE id = $1", [s.id])
      n++
    } catch (e) { console.error('[ra resume] failed', s.id, e) }
  }
  return n
}

// A client who still owes for an earlier period of a recurring service (virtual office, registered agent) for 30 days
// or more: pause the next renewal so we don't charge for a new period. A virtual office resumes by itself once those
// invoices are paid; a registered agent has resigned by then (see the notice) and the team restarts it.
const ARREARS: Record<string, string> = { registered_agent: '%registered agent%', virtual_office: '%virtual%' }
export async function pauseForArrears(): Promise<{ paused: number; resumed: number }> {
  const out = { paused: 0, resumed: 0 }
  for (const [code, like] of Object.entries(ARREARS)) {
    const owe = `SELECT i.number FROM services.invoices i WHERE i.client_id = s.client_id AND i.status = 'sent' AND i.due_date <= current_date - 30
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(i.lines) l WHERE l->>'description' ILIKE '${like}' OR (${code === 'virtual_office' ? "l->>'description' ILIKE '%mailbox%' OR l->>'description' ILIKE '%business address%'" : 'false'})) ORDER BY i.due_date LIMIT 1`
    const hit = (await db().query<{ id: string; client_id: string; name: string; number: string }>(`SELECT s.id, s.client_id, s.name, o.number FROM wallet.subscriptions s CROSS JOIN LATERAL (${owe}) o WHERE s.code = $1 AND s.status = 'active' AND s.client_id IS NOT NULL`, [code])).rows
    for (const s of hit) {
      await db().query("UPDATE wallet.subscriptions SET status = 'suspended', last_error = $2, details = details || $3::jsonb, updated_at = now() WHERE id = $1", [s.id, 'Renewal paused: invoice ' + s.number + ' is unpaid', JSON.stringify({ paused: 'arrears', invoice: s.number })])
      out.paused++
      if (code === 'virtual_office') { try { await arrearsMessage(s.client_id, s.name, s.number) } catch (e) { console.error('[arrears] message failed', e) } }
    }
    if (code === 'virtual_office') {
      const back = await db().query(`UPDATE wallet.subscriptions s SET status = 'active', last_error = NULL, details = details - 'paused' - 'invoice', updated_at = now()
        WHERE s.code = $1 AND s.status = 'suspended' AND s.details->>'paused' = 'arrears' AND NOT EXISTS (${owe})`, [code])
      out.resumed += back.rowCount ?? 0
    }
  }
  return out
}
async function arrearsMessage(clientId: string, service: string, invoice: string): Promise<void> {
  const cl = (await db().query<{ organization_id: string; name: string; emails_muted: boolean }>('SELECT organization_id, name, emails_muted FROM services.clients WHERE id = $1', [clientId])).rows[0]
  if (!cl) return
  const finvry = brands().finvry.url
  const body = '**' + service + ' renewal paused**\n\nInvoice ' + invoice + ' for an earlier period of your ' + service + ' is more than 30 days overdue, so we have paused the next renewal. Pay the invoice under Invoices in Finvry and the renewal restarts automatically.'
  const thread = await postMessage({ orgId: cl.organization_id, clientId, fromTeam: true, body, category: 'billing', subject: service + ' renewal paused' })
  if (cl.emails_muted) return
  const to = await clientRecipients(clientId)
  for (const e of to.emails) { try { await sendPortalMessageEmail(e, cl.name, body, to.portal ? finvry + '/client/messages?thread=' + thread : finvry + '/client/invoices', 'Billing') } catch (err) { console.error('[arrears] email failed', err) } }
}
