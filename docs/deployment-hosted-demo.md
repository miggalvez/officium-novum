# Hosted Demo Deployment Guide

> Companion to [`hosted-demo-implementation-plan.md`](./hosted-demo-implementation-plan.md).
> Concrete recipes for deploying the API + web frontend.

## Recommended shape

```
https://demo.example.org/              → frontend (static SPA, Vite output)
https://demo.example.org/api/v1/...    → API (Fastify, reverse-proxied)
```

Same-origin routing avoids CORS for end users and keeps the report-button payload's
`apiUrl` and `publicBaseUrl` consistent.

## API service

### Build

```
pnpm install --frozen-lockfile
pnpm -r build
```

### Start

```
OFFICIUM_API_HOST=0.0.0.0 \
OFFICIUM_API_PORT=3000 \
OFFICIUM_CONTENT_VERSION=$(git rev-parse --short HEAD) \
OFFICIUM_API_LOGGER=true \
OFFICIUM_ALLOWED_ORIGINS=https://demo.example.org \
pnpm -C packages/api start
```

The corpus directory must be available at the path expected by the API config (default
`upstream/web/www`). For container builds, copy `upstream/web/www` and the built API into
the image.

### Health check

`GET /api/v1/status` should return `200` with a JSON body containing `kind: "status"`.

### Cache headers

The API already emits deterministic ETags and `Cache-Control: public, max-age=86400,
stale-while-revalidate=604800`. Do not override these at the reverse proxy.

## Frontend

### Build

```
pnpm -C packages/web build
```

Output: `packages/web/dist/`. Hashed asset filenames in `dist/assets/*` are safe to cache
forever; `index.html` must not be cached.

### Environment variables

Set these at build time (Vite reads them from `process.env` and bakes them in):

```
VITE_OFFICIUM_API_BASE_URL=
VITE_OFFICIUM_PUBLIC_BASE_URL=https://demo.example.org
VITE_OFFICIUM_GITHUB_REPORT_URL=https://github.com/miggalvez/officium-novum/issues/new
VITE_OFFICIUM_REPORT_EMAIL=reports@example.org
VITE_OFFICIUM_ENV=production
```

`VITE_OFFICIUM_BUILD_SHA` and `VITE_OFFICIUM_BUILD_DATE` default to the current git SHA
and ISO timestamp; override only if you build outside a git checkout.

### Static-host configuration

Whatever static host you use (Nginx, Caddy, S3+CloudFront, Vercel, Netlify, fly.io, etc.)
must:

1. Serve `dist/index.html` for any unknown path under `/` (SPA fallback).
2. Set long-lived caching for hashed assets and short-lived caching for `index.html`.
3. Reverse-proxy `/api/*` to the API service.
4. Serve `/service-worker.js` with `Cache-Control: no-cache` (or `max-age=0`) so users
   always pick up new SW versions.

### Nginx example

```nginx
server {
  listen 443 ssl http2;
  server_name demo.example.org;

  root /var/www/officium/dist;
  index index.html;

  # Hashed assets: cache forever
  location ^~ /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  # Service worker: must update quickly
  location = /service-worker.js {
    add_header Cache-Control "public, max-age=0, must-revalidate";
    try_files $uri =404;
  }

  # SPA fallback
  location / {
    add_header Cache-Control "public, max-age=0, must-revalidate";
    try_files $uri $uri/ /index.html;
  }

  # Reverse proxy to the API
  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

### Caddy example

```caddyfile
demo.example.org {
  root * /var/www/officium/dist

  @assets path /assets/*
  header @assets Cache-Control "public, max-age=31536000, immutable"

  @sw path /service-worker.js
  header @sw Cache-Control "public, max-age=0, must-revalidate"

  header Cache-Control "public, max-age=0, must-revalidate"

  handle /api/* {
    reverse_proxy 127.0.0.1:3000
  }

  handle {
    try_files {path} {path}/ /index.html
    file_server
  }
}
```

## Cross-origin deployments (alternative)

If you must serve frontend and API from different origins, configure the API's
`OFFICIUM_ALLOWED_ORIGINS` to list every demo origin (no wildcard in production):

```
OFFICIUM_ALLOWED_ORIGINS=https://demo.example.org,https://preview.example.org
```

Set the frontend's `VITE_OFFICIUM_API_BASE_URL` to the absolute API origin
(`https://api.example.org`).

## Preview deployments

Per §20.5 of the plan, every PR should produce a preview deployment when feasible.
Recommended setup:

- Frontend host: configure preview deploys to point at the production API with a banner
  explaining "frontend preview, production data".
- Or: deploy a paired API preview at `api-preview.example.org` and set
  `VITE_OFFICIUM_API_BASE_URL=https://api-preview.example.org` for the preview build.

## Smoke checklist

After deploy:

- [ ] `https://demo.example.org/` redirects to today's Lauds.
- [ ] `https://demo.example.org/api/v1/status` returns `kind: "status"`.
- [ ] `https://demo.example.org/office/<today>/lauds?version=Rubrics%201960%20-%201960`
      renders Latin + English.
- [ ] **Report this** opens the dialog and produces a YAML payload with non-empty
      `frontend.buildSha`, `api.contentVersion`, and `request.apiUrl`.
- [ ] GitHub issue handoff opens a new issue prefilled with the title.
- [ ] Refreshing `/office/...` and `/calendar/...` directly returns the SPA, not a 404.
- [ ] Hashed assets carry `Cache-Control: public, max-age=31536000, immutable`.
- [ ] `index.html` carries `Cache-Control: max-age=0, must-revalidate`.
- [ ] First load registers the service worker; offline reload of the app shell still works.
