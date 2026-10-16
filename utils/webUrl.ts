// Only web addresses become links: http(s) as given, a bare domain (mercury.com) as https://; anything else
// (javascript:, data:, plain text) is not linked.
export const webUrl = (u: string | null | undefined): string | undefined => {
  const v = (u ?? '').trim()
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) return v
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/[^\s"'<>]*)?$/i.test(v)) return 'https://' + v
  return undefined
}
