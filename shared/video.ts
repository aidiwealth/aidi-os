// Video links that can play in the app: YouTube, Vimeo and Loom. Only the video's id is used to build the player
// address, so a link can never point the player anywhere else.
export interface VideoEmbed { src: string; provider: 'YouTube' | 'Vimeo' | 'Loom' }
export function videoEmbed(url: string): VideoEmbed | null {
  let u: URL
  try { u = new URL(String(url ?? '').trim()) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.replace(/^www\.|^m\./, '')
  const id = (s: string | null | undefined, re: RegExp) => (s && re.test(s) ? s : null)
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = id(u.searchParams.get('v'), /^[A-Za-z0-9_-]{11}$/) ?? id(u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/)?.[1], /^[A-Za-z0-9_-]{11}$/)
    return v ? { src: 'https://www.youtube-nocookie.com/embed/' + v, provider: 'YouTube' } : null
  }
  if (host === 'youtu.be') { const v = id(u.pathname.slice(1).split('/')[0], /^[A-Za-z0-9_-]{11}$/); return v ? { src: 'https://www.youtube-nocookie.com/embed/' + v, provider: 'YouTube' } : null }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') { const v = u.pathname.match(/(?:^|\/)(\d{6,12})(?:\/|$)/)?.[1]; return v ? { src: 'https://player.vimeo.com/video/' + v, provider: 'Vimeo' } : null }
  if (host === 'loom.com') { const v = u.pathname.match(/^\/(?:share|embed)\/([0-9a-f]{32})/)?.[1]; return v ? { src: 'https://www.loom.com/embed/' + v, provider: 'Loom' } : null }
  return null
}
// Pages only (emails keep the link): every YouTube, Vimeo or Loom link in a paragraph or list item gets a player
// under that block, whether the link sits on its own line or inside a sentence.
const player = (v: VideoEmbed) => '<div class="vid"><iframe src="' + v.src + '" title="' + v.provider + ' video" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>'
export function embedVideos(html: string): string {
  const seen = new Set<string>()
  return html.replace(/<(p|li)([^>]*)>([\s\S]*?)<\/\1>/g, (whole, tag: string, attrs: string, inner: string) => {
    const vids: VideoEmbed[] = []
    for (const m of inner.matchAll(/<a href="([^"]+)"/g)) { const v = videoEmbed(m[1]!.replace(/&amp;/g, '&')); if (v && !seen.has(v.src)) { seen.add(v.src); vids.push(v) } }
    if (!vids.length) return whole
    const alone = /^\s*<a [^>]*>[^<]*<\/a>\s*$/.test(inner)
    const block = alone && tag === 'p' ? '<p class="vlink"' + attrs + '>' + inner + '</p>' : whole
    return tag === 'li' ? '<li' + attrs + '>' + inner + vids.map(player).join('') + '</li>' : block + vids.map(player).join('')
  })
}
