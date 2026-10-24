// Rename the group, the main company or a subsidiary (admins), from the company switcher on any page.
export function useRename() {
  async function rename(target: 'group' | string, current: string) {
    const name = await askPrompt(target === 'group' ? 'The name for the company and its subsidiaries together. Leave empty to use the main company\'s name with "group".' : 'The name used across Finvry. The legal name stays as it is in Settings.', current, { title: target === 'group' ? 'Rename the group' : 'Rename ' + current, ok: 'Rename', required: target !== 'group' })
    if (name === null || name.trim() === current) return
    try { await $fetch('/api/company/rename', { method: 'POST', body: { target, name: name.trim() } }); await refreshNuxtData(['fin-subjects', 'me']) }
    catch (e) { await notify((e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not rename. Try again.') }
  }
  return { rename }
}
