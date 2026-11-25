// Markdown to safe HTML for pages (see shared/markdown.ts). With videos, a line that is only a YouTube, Vimeo or Loom
// link also shows the player.
import { mdRender } from '~/shared/markdown'
import { embedVideos } from '~/shared/video'
export function renderMarkdown(src: string, o: { videos?: boolean } = {}): string { const h = mdRender(src); return o.videos ? embedVideos(h) : h }
