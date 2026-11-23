// A visitor asks for a one-time code to open an invite-only board. Only emails on the board's list get one.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await rateLimit('bcode_ip', clientIp(event), 20, 60 * 60 * 1000)
  const p = z.object({ email: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) }).safeParse(await readBody(event))
  if (!p.success) throw apiError('invalid', 'Enter a valid email address.')
  const b = await boardByToken(event), email = p.data.email
  if (b.share_access !== 'invited') return { invited: true, open: true }
  if (!onBoardList(b, email)) return { invited: false }
  await rateLimit('bcode_email', b.id + ':' + email, 5, 60 * 60 * 1000)
  const code = randomOtp()
  await asPlatform(() => db().query("INSERT INTO financials.board_codes (organization_id, board_id, email, code_hash, expires_at) VALUES ($1,$2,$3,$4, now() + interval '10 minutes')", [b.organization_id, b.id, email, sha256(code)]))
  await sendPageCode(email, (await currentOrg())!.name, code, b.name + ' board')
  return { invited: true }
})
