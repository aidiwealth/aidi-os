// Read the founder's cap table documents with AI and return a proposed cap table to check. Nothing is saved to the
// cap table here; the files themselves are kept in Documents unless the founder unticks that.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const parts = (await readMultipartFormData(event)) ?? []
  const files = parts.filter((p) => p.filename && p.data?.length).map((p) => ({ name: p.filename!.slice(0, 160), data: p.data }))
  const keep = parts.find((p) => p.name === 'keep' && !p.filename)?.data.toString('utf8') !== '0'
  const entity = await companyEntityId()
  const company = (await db().query<{ name: string }>('SELECT name FROM core.organizations WHERE id = core.current_org()')).rows[0]?.name ?? 'the company'
  let proposal
  const source = parts.find((p) => p.name === 'source' && !p.filename)?.data.toString('utf8') ?? ''
  try { proposal = await readCapDocs(files, company, 'equity:' + (entity ?? 'org'), ['pulley', 'carta'].includes(source) ? source : '') }
  catch (e) { if ((e as { statusCode?: number }).statusCode) throw e; console.error('[equity] read failed', e); throw apiError('ai_failed', 'Could not read those files just now. Try again, or try fewer files at once.', 502) }
  const kept = keep ? await Promise.all(files.map((f) => keepFile(f, entity).catch(() => null))) : []
  await audit({ event, actorUserId: user.userId, action: 'equity.docs_read', objectType: 'equity_import', detail: { files: files.map((f) => f.name), kept: kept.filter(Boolean).length } })
  // The kept files (with their ids), so the review step can offer to attach each one to the holders it is about.
  return { proposal, files: files.map((f) => f.name), kept: kept.filter(Boolean).length, kept_docs: files.map((f, i) => ({ name: f.name, id: kept[i] ?? null })).filter((x) => x.id) }
})
