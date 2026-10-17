// Read side letters and pro rata letters: AI finds each right and who holds it. Runs in the background; nothing is
// saved until the founder checks the matches. Files that hold rights are kept in Documents (Financing).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  await rateLimit('equity_rights', user.userId, 20, 60 * 60 * 1000)
  const parts = (await readMultipartFormData(event)) ?? []
  const ct = await capTableId(parts.find((p) => p.name === 'ct' && !p.filename)?.data.toString('utf8') || undefined)
  const files = parts.filter((p) => p.filename && p.data?.length).slice(0, 10).map((p) => ({ name: p.filename!, data: Buffer.from(p.data) }))
  if (!files.length) throw apiError('invalid', 'Add the side letters or pro rata letters (PDF or Word).')
  if (files.some((f) => !/\.(pdf|docx|txt)$/i.test(f.name))) throw apiError('bad_type', 'Use PDF or Word (.docx) files.')
  const holders = (await db().query<{ id: string; name: string; kind: string }>('SELECT id, name, kind FROM equity.holders WHERE captable_id = $1 ORDER BY name', [ct])).rows
  const company = (await currentOrg())?.name ?? 'the company'
  const id = await startAiJob(event, 'equity_rights', user.userId, async (set) => {
    await set('read', { files: files.length })
    const r = await readRights(files, holders, company, 'captable:' + ct)
    await set('store', {})
    const entity = await companyEntityId()
    const used = new Set(r.rights.map((x) => x.file.toLowerCase()))
    const docs: Record<string, string> = {}
    for (const f of files) if (used.has(f.name.toLowerCase()) || (files.length === 1 && r.rights.length)) docs[f.name.toLowerCase()] = await storeFinancingDoc(f, 'Side letter — ' + f.name.replace(/\.[a-z]+$/i, ''), entity)
    const first = Object.values(docs)[0] ?? null
    return { ...r, rights: r.rights.map((x) => ({ ...x, document_id: docs[x.file.toLowerCase()] ?? (files.length === 1 ? first : null) })), files: files.map((f) => ({ name: f.name, document_id: docs[f.name.toLowerCase()] ?? null })) }
  }, (err) => aiJobError(err, ['Upload side letters, pro rata letters or investor rights agreements as PDF or Word.', 'Or add a right by hand.']))
  return { id }
})
