# @officium-novum/web

Hosted demo SPA for the Officium Novum API. See
[`docs/hosted-demo-implementation-plan.md`](../../docs/hosted-demo-implementation-plan.md) for the
full plan.

## Quick start

```bash
pnpm install
pnpm -C packages/api dev          # in one terminal
pnpm -C packages/web dev          # in another (proxies /api -> :3000)
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm -C packages/web dev` | Vite dev server with HMR, on port 5173, proxying `/api` to `localhost:3000`. |
| `pnpm -C packages/web build` | TypeScript check + Vite production build into `dist/`. |
| `pnpm -C packages/web preview` | Serve the built `dist/` locally. |
| `pnpm -C packages/web typecheck` | TypeScript only. |
| `pnpm -C packages/web test` | Vitest unit + component tests. |

## Architecture

The web package consumes the Phase 4 read-only Office JSON API as an external client.
It does not import private API internals or compose liturgical text in the browser.

```
src/
  api/           # public DTOs, URL builders, fetch client
  app/           # App shell, env loader, hash-free history router
  components/    # generic UI: pickers, banners, links
  features/
    calendar/    # /calendar/:year/:month
    day/         # /day/:date
    office/      # /office/:date/:hour — main Office Hour view
    report/      # Report this button + dialog + payload + handoff
    settings/    # local-only DemoSettings store + page
    status/      # frontend build + API status panel
  routes/        # route parsing, building, defaults
  styles/        # plain CSS with custom properties
  sw/            # service worker registration helpers
  test/          # vitest unit + component tests
public/
  service-worker.js     # SW (plain JS so Vite copies it as-is)
  manifest.webmanifest
  favicon.svg
```

## Environment variables

The frontend reads these at build time. All must be prefixed with `VITE_` per Vite's
public-env convention.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_OFFICIUM_API_BASE_URL` | empty | Origin before `/api/v1`. Leave empty for same-origin deployments; use an absolute API origin for cross-origin deployments. |
| `VITE_OFFICIUM_PUBLIC_BASE_URL` | empty | Public origin of the demo (used in reports). |
| `VITE_OFFICIUM_GITHUB_REPORT_URL` | `https://github.com/miggalvez/officium-novum/issues/new` | Base URL for reviewer-report GitHub issues. |
| `VITE_OFFICIUM_REPORT_EMAIL` | empty | Optional reviewer-report email address. |
| `VITE_OFFICIUM_BUILD_SHA` | git short SHA at build time | Override the build SHA shown in reports. |
| `VITE_OFFICIUM_BUILD_DATE` | ISO timestamp at build time | Override the build date. |
| `VITE_OFFICIUM_ENV` | `development` | One of `development`, `preview`, `production`. |

## Reports — what gets captured

When a reviewer clicks **Report this**, the demo packages a YAML/JSON payload with:

- frontend build SHA, build date, environment, route
- API base URL, content version, upstream SHA (if available), canonical path
- exact request: date, hour, version, languages, orthography, strict, full API URL
- response kind, warning codes, quality
- reviewer-entered fields: scope, expected, actual, citation, notes
- reviewer attribution (with name only when explicitly opted in; contact details are omitted from public payloads)

Submission paths:

1. **GitHub issue** with `template=reviewer-report.yml` (public).
2. **Email** via `mailto:` with subject + summary; full YAML to be pasted (private).
3. **Copy YAML/JSON** to clipboard for manual handoff.

Public report payloads never carry contact details. Anonymous reports also drop names, even if
the form fields were filled in.

## Offline

The service worker at `/service-worker.js` precaches the app shell and runs a
stale-while-revalidate strategy for `/api/v1/*` GETs. The Office page exposes
**Cache this week**, which prefetches Lauds + Vespers + Compline for the next seven
days at the current version + languages.

## Phase boundary

The frontend is **Phase 6**. Phase 5 owns the reviewer-report adjudication workflow
(`docs/phase-5-reviewer-feedback-design.md`). The first hosted-demo report flow is
strictly client-side — it does not add a write endpoint to the API.
