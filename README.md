# Aidi OS

Internal back office for The Aidi Group: family office, Aidi Ventures funds, founders, investors and clients.
Separate from the Aidi Wealth platform (joinaidi.com): separate database, storage and keys.

- Dev: `npm install && npm run dev`
- Build: `npm ci && npm run build`, run with `node .output/server/index.mjs` (port from `PORT`)
- Database changes: numbered SQL files in `db/changes/`, applied by hand. Never `drizzle-kit migrate` or `push`.
- Hosting: DigitalOcean App Platform (`.do/app.yaml`), at app.theaidigroup.com.
