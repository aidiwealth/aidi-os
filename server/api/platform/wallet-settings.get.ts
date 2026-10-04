export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  const s = await walletSettings()
  return { ...s, monnify_secret_key: s.monnify_secret_key ? '••••••••' + s.monnify_secret_key.slice(-4) : '', monnify_api_key: s.monnify_api_key ?? '', webhook: brands().aidi.url + '/api/public/webhooks/monnify' }
})
