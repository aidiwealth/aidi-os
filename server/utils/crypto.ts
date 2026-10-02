import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')
export const randomToken = (): string => randomBytes(32).toString('base64url')
export const randomOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0')

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex')
  return x.length === y.length && timingSafeEqual(x, y)
}
