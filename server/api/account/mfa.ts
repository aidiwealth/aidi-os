// Account security: two-step verification with an authenticator app. GET status; POST start | enable | disable | recovery.
import QRCode from 'qrcode'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const row = await mfaRow(user.userId)
  if (getMethod(event) === 'GET') return { enabled: !!row?.enabled_at, enabled_at: row?.enabled_at ?? null, recovery_left: row?.enabled_at ? row.recovery_hashes.length : 0 }
  const b = z.object({ action: z.enum(['start', 'enable', 'disable', 'recovery']), code: z.string().trim().max(20).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  rateLimit('mfa_setup', user.userId, 20, 15 * 60 * 1000)
  const issuer = (await resolveBrand()) === 'finvry' ? 'Finvry' : 'Aidi OS'
  if (b.data.action === 'start') {
    if (row?.enabled_at) throw apiError('state', 'Two-step verification is already on.', 409)
    const secret = newSecret()
    await db().query('INSERT INTO core.user_mfa (user_id, secret_enc) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, enabled_at = NULL, recovery_hashes = \'{}\', last_step = 0, updated_at = now()', [user.userId, encryptText(secret)])
    const uri = otpauthUri(secret, user.email, issuer)
    return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), qr: await QRCode.toString(uri, { type: 'svg', margin: 1, width: 200, color: { dark: '#0c1a2e', light: '#ffffff' } }) }
  }
  if (b.data.action === 'enable') {
    if (!row || row.enabled_at) throw apiError('state', 'Start set-up again.', 409)
    const step = checkTotp(decryptText(row.secret_enc), String(b.data.code ?? ''), 0)
    if (step === null) throw apiError('bad_code', 'That code is not right. Enter the current 6-digit code from your app.', 400)
    const rc = newRecoveryCodes()
    await db().query('UPDATE core.user_mfa SET enabled_at = now(), recovery_hashes = $2, last_step = $3, updated_at = now() WHERE user_id = $1', [user.userId, rc.hashes, step])
    await audit({ event, actorUserId: user.userId, action: 'account.mfa_on', objectType: 'user', objectId: user.userId })
    try { await sendEmail({ to: user.email, subject: 'Two-step verification is on', text: 'Two-step verification was turned on for your ' + issuer + ' account. If this was not you, contact support right away.', html: '<p>Two-step verification was turned on for your ' + issuer + ' account.</p><p>If this was not you, contact support right away.</p>' }) } catch { /* ignore */ }
    return { ok: true, recovery_codes: rc.codes }
  }
  if (!row?.enabled_at) throw apiError('state', 'Two-step verification is off.', 409)
  if (!(await verifySecondFactor(user.userId, String(b.data.code ?? '')))) throw apiError('bad_code', 'Enter a current code from your app (or a recovery code) to confirm.', 400)
  if (b.data.action === 'recovery') { const rc = newRecoveryCodes(); await db().query('UPDATE core.user_mfa SET recovery_hashes = $2, updated_at = now() WHERE user_id = $1', [user.userId, rc.hashes]); return { ok: true, recovery_codes: rc.codes } }
  await db().query('DELETE FROM core.user_mfa WHERE user_id = $1', [user.userId])
  await audit({ event, actorUserId: user.userId, action: 'account.mfa_off', objectType: 'user', objectId: user.userId })
  try { await sendEmail({ to: user.email, subject: 'Two-step verification is off', text: 'Two-step verification was turned off for your ' + issuer + ' account. If this was not you, contact support right away.', html: '<p>Two-step verification was turned off for your ' + issuer + ' account.</p><p>If this was not you, contact support right away.</p>' }) } catch { /* ignore */ }
  return { ok: true }
})
