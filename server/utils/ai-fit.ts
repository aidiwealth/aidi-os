// Lenient output schemas for AI drafts: a long or over-full answer is trimmed to fit (the first n items, the first n
// characters) instead of failing. A founder who pastes a long strategy should get a draft, not "try again".
import { z } from 'zod'
export const fitStr = (n: number) => z.preprocess((v) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v)).slice(0, n), z.string())
export const fitArr = <T extends z.ZodType>(item: T, n: number) => z.preprocess((v) => (Array.isArray(v) ? v.slice(0, n) : []), z.array(item))
export const fitNum = (min: number, max: number) => z.preprocess((v) => { if (v === null || v === undefined || v === '') return null; const x = Number(String(v).replace(/[,\s$₦£€]/g, '')); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : null }, z.number().nullable())
export const fitInt = (min: number, max: number) => z.preprocess((v) => { if (v === null || v === undefined || v === '') return null; const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : null }, z.number().int().nullable())
export const fitEnum = <T extends string>(vals: readonly [T, ...T[]], dflt: T) => z.preprocess((v) => (typeof v === 'string' && (vals as readonly string[]).includes(v.toLowerCase()) ? v.toLowerCase() : dflt), z.enum(vals))
export const fitStage = z.object({ name: fitStr(60), kind: fitEnum(['open', 'won', 'lost'] as const, 'open'), target_pct: fitNum(0, 100), days: fitInt(0, 730), steps: fitArr(fitStr(200), 8) })
// A short reason for the page when the AI service itself failed (busy, limit, timeout), never the raw dump.
export function aiReason(e: unknown): string {
  const m = (e as Error)?.message ?? ''
  if (/allowance|limit/i.test(m)) return m
  if (/\b(429|529|overloaded)\b/.test(m)) return 'The AI service is busy. Try again in a minute.'
  if (/\b5\d\d\b|network|timed? ?out/i.test(m)) return 'The AI service did not answer in time. Try again.'
  if (/invalid output/.test(m)) return 'The AI answer was incomplete. Try again, or shorten what you gave it.'
  return 'AI could not do that just now (' + m.replace(/^\[ai\][^:]*:\s*/, '').slice(0, 140) + ').'
}
