# iolanthe-admin

Crew-facing admin console for Princess Iolanthe. Served at `/admin/?key=<urlKey>`
by `iolanthe-server`. Requires the URL key configured in `settings.json`.

## Architecture position

```
iolanthe-server  (serves /admin/* from ADMIN_STATIC_DIR)
        ↓
iolanthe-admin  (index.html, admin.css, admin.js, assets/)
        ↓  API calls (all /api/* relative URLs)
/api/admin/*  /api/charter/*  /api/weather  /api/track  ...
```

## Departments / roles

| Department | URL key param | Password key in settings.json |
|------------|--------------|-------------------------------|
| Charter Admin | `charter` | `passwords.charter` |
| Galley | `galley` | `passwords.galley` |
| Hotel | `hotel` | `passwords.hotel` |

URL access also requires `?key=<settings.admin.urlKey>`.

## Stack

- Plain HTML, CSS, JavaScript — no build step, no framework
- `admin.css` — all styles
- `admin.js` — all client-side logic (~15k lines, IIFE)
- `assets/icons/admin/` — favicons and department login icons

## Path conventions

All asset paths use the `/admin/` prefix so they are served from
`ADMIN_STATIC_DIR` by `iolanthe-server`:

```
/admin/admin.css
/admin/admin.js
/admin/assets/icons/admin/favicon.svg
/admin/assets/icons/admin/site.webmanifest
```

The one exception is `/assets/icons/onboard/web-app-manifest-512x512.png`
used as a print watermark in `admin.js` — that is a guest asset served by
`iolanthe-guest` from `GUEST_STATIC_DIR`.

## Running locally

The admin console has no server of its own — it is served by `iolanthe-server`.

```powershell
# In the iolanthe-server repo:
$env:DATA_DIR="$PWD\data-local"
$env:GUEST_STATIC_DIR="..\iolanthe-guest"
$env:ADMIN_STATIC_DIR="..\iolanthe-admin"
node server.js
```

Then open `http://localhost:8000/admin/?key=hotel` (or whatever `urlKey` is
set to in `data-local/settings.json`).

## Key constraints

- No build step. No npm. No dependencies.
- All API calls use relative URLs (no hardcoded host).
- Keep all asset paths prefixed with `/admin/` so they resolve correctly
  when served from `ADMIN_STATIC_DIR`.
- Do not cache `/api/*` responses.

## Deployment (docker-vm)

`iolanthe-server` bind-mounts `./iolanthe-admin:/static/admin:ro` in the
vessel compose file. Updates:

```bash
cd /opt/projects/vessel/iolanthe-admin && git pull
# No container restart needed — bind-mount serves live files
```
