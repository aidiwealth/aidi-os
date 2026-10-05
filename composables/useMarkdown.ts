// Markdown to safe HTML for pages (see shared/markdown.ts).
import { mdRender } from '~/shared/markdown'
export function renderMarkdown(src: string): string { return mdRender(src) }
