// The contacts a search and list filter select, as SQL: used by the list (one page at a time) and by bulk actions on
// "everything matching".
export function contactFilter(q: string, list: string, start = 0): { where: string; args: unknown[] } {
  const args: unknown[] = [], where: string[] = []
  if (q.trim()) { args.push('%' + q.trim().toLowerCase() + '%'); const n = '$' + (start + args.length); where.push('(lower(c.name) LIKE ' + n + ' OR lower(c.email) LIKE ' + n + ' OR lower(coalesce(c.firm, \'\')) LIKE ' + n + ' OR lower(coalesce(c.title, \'\')) LIKE ' + n + ')') }
  if (/^[0-9a-f-]{36}$/.test(list)) { args.push(list); where.push('EXISTS (SELECT 1 FROM crm.list_members m WHERE m.contact_id = c.id AND m.list_id = $' + (start + args.length) + ')') }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', args }
}
