// The snapshot (thumbnail) for a video link in an investor update: YouTube from its fixed address, Vimeo and Loom from
// their public oEmbed. Only those hosts are asked, and only their image hosts are accepted back.
const IMG_HOSTS = /^https:\/\/(i\.ytimg\.com|img\.youtube\.com|i\.vimeocdn\.com|cdn\.loom\.com)\//
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await rateLimit('update_video_thumb', user.userId, 60, 60 * 60 * 1000)
  const url = String(getQuery(event).url ?? '').trim()
  if (!/^https:\/\//i.test(url) || url.length > 500) throw apiError('invalid', 'Paste the video link first.')
  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  // YouTube: the wide 1280×720 picture when the video has one (most do), else the standard one.
  if (yt) {
    const wide = 'https://i.ytimg.com/vi/' + yt[1] + '/hq720.jpg'
    const ok = await fetch(wide, { method: 'HEAD', signal: AbortSignal.timeout(5000) }).then((r) => r.ok).catch(() => false)
    return { thumb: ok ? wide : 'https://i.ytimg.com/vi/' + yt[1] + '/hqdefault.jpg' }
  }
  const oembed = /^https:\/\/(www\.)?vimeo\.com\//i.test(url) ? 'https://vimeo.com/api/oembed.json?width=1280&url=' : /^https:\/\/(www\.)?loom\.com\/share\//i.test(url) ? 'https://www.loom.com/v1/oembed?url=' : null
  if (!oembed) throw apiError('unsupported', 'A snapshot can be found for YouTube, Vimeo and Loom links. For others, upload a picture.', 400)
  const r = await $fetch<{ thumbnail_url?: string }>(oembed + encodeURIComponent(url), { timeout: 8000 }).catch(() => null)
  const t = r?.thumbnail_url?.replace(/^http:/, 'https:')
  if (!t || !IMG_HOSTS.test(t)) throw apiError('not_found', 'No snapshot was found for this video. Upload a picture instead.', 404)
  return { thumb: t }
})
