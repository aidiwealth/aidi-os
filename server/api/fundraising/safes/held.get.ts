// SAFEs (and notes) already held: every outstanding one on the main cap table, with its terms, what it would own
// once converted, the investor's rights, and the signed document when one is attached (and whether it is in the
// data room). Shown under Fundraising → SAFEs beside the SAFEs drafted here.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  if (!(await enabledModules()).has('equity')) return { captable: null, items: [] }
  const ct = await capTableId()
  const items = (await db().query(`SELECT c.id, c.kind, c.amount::float AS amount, c.currency, c.valuation_cap::float AS valuation_cap, c.discount_pct::float AS discount_pct, c.post_money, c.mfn, c.interest_pct::float AS interest_pct,
      to_char(c.issued_on, 'YYYY-MM-DD') AS issued_on, to_char(c.maturity_on, 'YYYY-MM-DD') AS maturity_on, c.status, h.id AS holder_id, h.name AS investor,
      coalesce((SELECT json_agg(json_build_object('document_id', x.document_id, 'title', d.title, 'kind', x.kind, 'round', x.round, 'in_room', x.room_file_id IS NOT NULL) ORDER BY x.created_at)
        FROM equity.holder_docs x JOIN core.documents d ON d.id = x.document_id WHERE x.holder_id = h.id AND (x.convertible_id = c.id OR (x.convertible_id IS NULL AND x.kind IN ('safe', 'note', 'side_letter')))), '[]') AS docs,
      coalesce((SELECT json_agg(DISTINCT r.kind) FROM equity.rights r WHERE r.holder_id = h.id), '[]') AS rights
    FROM equity.convertibles c JOIN equity.holders h ON h.id = c.holder_id WHERE c.captable_id = $1 ORDER BY c.issued_on, h.name`, [ct])).rows
  return { captable: ct, items }
})
