// A wallet statement for more than 31 days (up to a year): built after the response and emailed to the person asking.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team', 'family')
  const org = (await currentOrg())!
  const b = (await readBody(event).catch(() => ({}))) as { from?: unknown; to?: unknown }
  const r = statementRange(b?.from, b?.to)
  const to = (await asPlatform(() => db().query<{ email: string }>('SELECT email FROM core.users WHERE id = $1', [user.userId]))).rows[0]?.email
  if (!to) throw apiError('invalid', 'We could not find your email address.')
  inBackground('wallet-statement:' + user.userId, async () => {
    const csv = await walletStatementCsv(org.id, r.from, r.till)
    await sendWalletStatement({ to, company: org.name, from: r.from, till: r.till, file: { filename: 'finvry-wallet-' + r.from + '-to-' + r.till + '.csv', content: new TextEncoder().encode(csv) } })
  })
  await audit({ event, actorUserId: user.userId, action: 'wallet.statement', objectType: 'organization', objectId: org.id, detail: { from: r.from, to: r.till } })
  return { ok: true, email: to }
})
