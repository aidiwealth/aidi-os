// Encrypt secrets at rest (bank access tokens, borrower IDs) with AES-256-GCM. The key is derived from the app's
// signing secret; rotating that secret means reconnecting banks.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
const key = () => createHash('sha256').update('aidi-at-rest:' + useRuntimeConfig().jwtSecret).digest()
export function encryptText(plain: string): string { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key(), iv); const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]); return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.') }
export function decryptText(blob: string): string { const [iv, tag, enc] = blob.split('.'); const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv!, 'base64')); d.setAuthTag(Buffer.from(tag!, 'base64')); return Buffer.concat([d.update(Buffer.from(enc!, 'base64')), d.final()]).toString('utf8') }
