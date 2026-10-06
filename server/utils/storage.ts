// Private object storage on Cloudflare R2 (S3-compatible). Objects are never public: reads use short-lived signed links.
import { AwsClient } from 'aws4fetch'

let client: AwsClient | null = null
function r2(): { aws: AwsClient; base: string } {
  const c = useRuntimeConfig()
  if (!c.r2AccessKeyId || !c.r2SecretAccessKey || (!c.r2AccountId && !c.r2Endpoint)) throw new Error('R2 storage is not configured (NUXT_R2_*)')
  client ??= new AwsClient({ accessKeyId: c.r2AccessKeyId, secretAccessKey: c.r2SecretAccessKey, service: 's3', region: 'auto' })
  const endpoint = (c.r2Endpoint || 'https://' + c.r2AccountId + '.r2.cloudflarestorage.com').replace(/\/$/, '')
  return { aws: client, base: endpoint + '/' + c.r2Bucket }
}
const keyPath = (key: string): string => key.split('/').map(encodeURIComponent).join('/')

export async function putObject(input: { key: string; body: Uint8Array; contentType: string }): Promise<void> {
  await assertStorage(input.body.length)
  const { aws, base } = r2()
  const res = await aws.fetch(base + '/' + keyPath(input.key), { method: 'PUT', body: Uint8Array.from(input.body), headers: { 'content-type': input.contentType } })
  if (!res.ok) throw new Error('R2 upload failed: ' + res.status + ' ' + (await res.text()).slice(0, 300))
}

export async function getObject(key: string): Promise<Uint8Array> {
  const { aws, base } = r2()
  const res = await aws.fetch(base + '/' + keyPath(key), { method: 'GET' })
  if (!res.ok) throw new Error('R2 read failed: ' + res.status)
  return new Uint8Array(await res.arrayBuffer())
}

export async function deleteObject(key: string): Promise<void> {
  const { aws, base } = r2()
  const res = await aws.fetch(base + '/' + keyPath(key), { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error('R2 delete failed: ' + res.status)
}

export async function signedGetUrl(input: { key: string; filename: string; seconds: number; inline?: boolean }): Promise<string> {
  const { aws, base } = r2()
  const u = new URL(base + '/' + keyPath(input.key))
  u.searchParams.set('X-Amz-Expires', String(input.seconds))
  u.searchParams.set('response-content-disposition', (input.inline ? 'inline' : 'attachment') + '; filename="' + input.filename.replace(/["\\\r\n]/g, '_') + '"')
  const signed = await aws.sign(new Request(u.toString(), { method: 'GET' }), { aws: { signQuery: true } })
  return signed.url
}
