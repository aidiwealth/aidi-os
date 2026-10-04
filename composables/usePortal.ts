// Portal fetch helper: on "signed out", go to the portal sign-in page.
export function portalErr(e: unknown): string { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Please try again.' }
export async function usePortalFetch<T>(url: string) {
  const r = await useFetch<T>(url, { key: 'portal:' + url })
  if (r.error.value?.statusCode === 401) await navigateTo('/client/login')
  return r
}
