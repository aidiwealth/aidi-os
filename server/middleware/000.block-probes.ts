// Scanners constantly probe for config and admin files. Answer them with a bare 404 before the app does any work.
const PROBES = [/\/\.env($|[./])/i, /\/\.git($|\/)/i, /\/\.(aws|ssh|svn|hg|DS_Store)($|\/)/i, /\/wp-(admin|login|content|includes)/i, /\/phpinfo\.php$/i, /\/phpmyadmin/i, /\/xmlrpc\.php$/i, /\/vendor\/phpunit/i, /\.(php|asp|aspx|jsp|cgi)$/i, /\/config\.(json|ya?ml|ini)$/i, /\/(backup|dump|db)\.(sql|zip|tar|gz)$/i, /\/server-status$/i, /\/actuator(\/|$)/i]
export default defineEventHandler((event) => {
  const path = event.path || ''
  if (!PROBES.some((re) => re.test(path))) return
  setResponseStatus(event, 404); setResponseHeader(event, 'content-type', 'text/plain'); setResponseHeader(event, 'cache-control', 'no-store')
  return 'Not Found'
})
