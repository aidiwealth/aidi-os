// A large JSON reply, gzip-compressed when the caller accepts it (browsers do). Plain JSON otherwise.
import { gzipSync } from 'node:zlib'
import type { H3Event } from 'h3'
export function sendJsonGz(event: H3Event, body: unknown): unknown {
  const json = JSON.stringify(body)
  if (json.length < 64 * 1024 || !/\bgzip\b/.test(getRequestHeader(event, 'accept-encoding') ?? '')) return body
  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  setHeader(event, 'content-encoding', 'gzip')
  setHeader(event, 'vary', 'accept-encoding')
  return gzipSync(json, { level: 6 })
}
