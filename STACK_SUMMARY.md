# RHC CMS — Stack Summary

## Project overview

RHC CMS (`RHC-Solutions/rhc-cms`) is an **embeddable Next.js CMS admin panel and site-provisioning platform** — "WordPress for the Node/Next/Postgres stack". It is not a website: it ships the admin UI, API surface, auth, CMS data model, design-pack importer and installer CLI, and host sites pull it in as a `vendor/admin-panel` git submodule. Shared code is written to run inside an *arbitrary* host, so no host paths or domains are hardcoded in `src/lib`.

Scale: ~207 TypeScript/TSX files, ~70 API route handlers, ~37 admin pages.

## Core stack

| Layer | Choice |
|---|---|
| Framework | Next.js ≥ 16.1 — App Router, Turbopack, server components |
| UI | React 19 |
| Language | TypeScript 6 (`strict: true`), path alias `@adminpanel/*` → `src/*` |
| Styling | Tailwind CSS 4.3 via `@tailwindcss/postcss` + autoprefixer |
| Auth | NextAuth v4 — JWT sessions, role gate, TOTP MFA (`qrcode`) |
| Database | SQLite (`better-sqlite3`, WAL) by default; Postgres (`pg`) opt-in via `DATABASE_URL` / `DB_DRIVER` |
| Passwords | `bcryptjs` |
| Sanitization | `isomorphic-dompurify` (+ `src/lib/sanitize.ts`) |
| Email | `nodemailer` (SMTP) with Brevo API as the preferred transport |
| Google APIs | `googleapis` — GA4 Data API + Search Console |
| Scheduling | `node-cron` (`src/lib/scheduler-init.ts`) |
| Archives | `adm-zip` (design packs), `archiver` (backups) |
| UI extras | `framer-motion`, `react-icons`, `react-hot-toast`, `leaflet` + `react-leaflet` |
| Runtime | Node ≥ 20.9 |

Payments are a **hand-rolled Stripe REST client** (`src/lib/store/stripe.ts`) rather than the SDK — the panel vendors into arbitrary hosts, so heavy/native deps are deliberately avoided.

## Architecture

```
src/app/admin/*     37 admin pages (dashboard, pages, media, SEO, settings, setup wizard, …)
src/app/api/cms/*   auth-gated CMS API (middleware-enforced)
src/app/api/admin/* admin API — NOT middleware-covered, each handler checks getToken() itself
src/app/pack-preview in-panel preview of imported static design packs
src/components/*    shared + admin components (MediaPicker, IntegrationsPanel, BlockRenderer, …)
src/lib/*           business logic: auth, cms, db seam, design-pack, ooda, integrations, store, booking, i18n
bin/admin-panel.mjs CLI: init / update / apply-pack (+ --static-site)
scripts/*           installer, critical-CSS inliner, DB portability tests, audits, auto-update
middleware.ts       auth + role + MFA gate, CSP, security headers
```

### Persistence

`cmsDb` (`src/lib/cms/db/{driver,sqlite,postgres,index}.ts`) is an **async driver seam** — feature code never touches a raw connection. SQL is kept portable: `?` placeholders (translated to `$n` for PG), quoted camelCase columns, `Number()`-coerced counts, `ON CONFLICT … DO UPDATE`. File-only operations (backup, restore, WAL checkpoint) are guarded by `isSqlite()` and no-op under Postgres, where `pg_dump` is the backup path. `pg-mem` backs the portability test script. Schema init is lazy and memoized via `ready()`; JSON files in `cms-data/` act as snapshots/seeds, with the SQLite DB as runtime truth.

## Platform subsystems

- **Distribution** — hosts run `npx github:RHC-Solutions/rhc-cms init`; `scripts/install-into-site.mjs` generates thin re-export route wrappers and composes `adminAuthGate` into the host middleware.
- **Design packs** (`src/lib/design-pack/*`) — `POST /api/cms/design-pack/apply` auto-detects CMS-block packs (`pack.json`, decomposed into blocks) vs static-site packs (finished HTML + assets, served verbatim). Importer hard-rejects `secrets.json`/`users.json`/`seo.json`/`cms.db`/`.env*`, strips identity keys, and path-guards every zip entry.
- **Provisioning wizard** (`/admin/setup` → `POST /api/cms/setup/provision`) — design → configure (domain, email, Cloudflare token + DNS automation, live integration validation) → account → MFA. First-run gate is fail-closed `adminExists()`.
- **OODA self-improvement loop** (`src/lib/ooda/*`, `/admin/automation`) — observe/orient/decide/act; dry-run by default and auto-applies only a narrow `SAFE_ACTION_TYPES` allowlist (revalidate / sync-seo / scan-media).
- **Panel self-update** (`src/lib/panel-update.ts`) — read-only GitHub compare check plus a deliberate, backed-up, `--ff-only` submodule update; the daily checker is opt-in and notify-only.
- **Backups** — `src/lib/backup.ts` + Telegram-delivered archives, restore endpoint, checkpoint restore script.
- **CloudPanel module** (`src/lib/cloudpanel/*`, `/admin/cloudpanel`) — manages the CloudPanel host the panel runs on. CloudPanel exposes no REST API, so inventory is a read-only, schema-introspecting reader over CloudPanel's own SQLite DB, and mutations are an allowlisted `clpctl` set executed through a root-owned sudo wrapper. Off by default; destructive verbs are double-gated (panel switch + root-owned marker file) and require a retyped target.

## Feature modules

Beyond core CMS pages/media/SEO/theme, the panel ships toggleable modules whose config lives in a `module_settings` KV table (`src/lib/module-settings.ts`):

**Store** (products, cart, orders, Stripe checkout) · **Gift cards** · **Booking** (availability + appointments) · **i18n** (locale config and translations) · **Landing pages** · **Forms & leads** · **Offices** (map-backed) · **Menu / footer / cookies / typography** editors · **Audit log** · **Aikido** security integration · **Cloudflare** operational dashboard · **CloudPanel** server management.

## Integrations

Credentials live in a **single encrypted store** (`cms-data/secrets.json` via `getSecret`/`setSecrets`), driven by the `INTEGRATIONS` catalog in `src/lib/integrations.ts` — adding a field there automatically allow-lists it for the save endpoint, the setup wizard, and admin search. Only genuinely build-time/public values (`NEXT_PUBLIC_*`, `NEXTAUTH_*`, `DATABASE_URL`) go to `.env.local`.

Cloudflare (API token, DNS automation, Turnstile) · Google (GA4, Search Console, GTM) · Brevo / SMTP · Telegram ops alerts (`notifyOps` fans out email + Telegram) · Stripe.

## Security posture

- Middleware enforces JWT + role + MFA for `/admin/*` and `/api/cms/*`; `/api/admin/*` is **not** covered and each handler authenticates itself.
- `publicApiEndpoints` entries are public on **GET only** — mutating methods re-check auth in-handler.
- CSP set in middleware; `'unsafe-eval'` intentionally removed; `x-middleware-subrequest` blocked (CVE bypass).
- `next/image` `remotePatterns` are explicit hosts only — no wildcards (SSRF/DoS class).
- `env.ts setEnvValue` rejects CR/LF and `$`-injection; secrets files are `660`, group-owned.
- The CloudPanel module never invokes a shell: `execFile` with an argv array, values emitted as single `--flag=value` elements, per-flag allowlist validators, and the same allowlist re-enforced root-side by the wrapper. The privileged child gets a minimal env so panel secrets are never inherited by a root process.

## Build, runtime & deployment

```bash
npm run dev     # next dev -p 3003
npm run build   # next build + scripts/inline-critical-css.mjs (beasties/critters)
npm start       # production server on 3003
npx --no-install tsc --noEmit   # type-check
npm run lint    # eslint 10 + typescript-eslint
```

Production runs under **PM2** (`ecosystem.config.js`, which loads `.env.local` itself and pins PORT/NODE_ENV), fronted by **Cloudflare**. `wrangler.toml`, `functions/`, `_headers` and `_redirects` support Cloudflare Pages/Workers deployment of static-site hosts. Static export (`output: 'export'`) is permanently disabled — the CMS needs API routes.

## Summary

A production, multi-tenant-minded admin platform: Next 16 + React 19 + TS 6 + Tailwind 4, SQLite-first with a portable Postgres seam, NextAuth + MFA, a catalog-driven single credential store, design-pack-based site provisioning, an OODA automation loop, and commerce/booking/i18n modules — packaged as a git-submodule-installable panel with its own CLI and self-update path.
