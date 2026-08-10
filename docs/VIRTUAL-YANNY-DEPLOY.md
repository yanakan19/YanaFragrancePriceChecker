# Virtual Yanny deployment

The chat widget (`demo/app.ts`, floating launcher + popup) and the backend
it talks to (`YanaFreeAPIMerger/`) are both built and live in this repo
already. The one thing not live yet is the backend's own hosting — this
site is static (GitHub Pages), so the Express service behind the widget
needs somewhere else to run.

**Primary plan: a dedicated Oracle Cloud Always Free VM** (Oracle Linux 9,
ARM, `VM.Standard.A1.Flex`). Provisioning is currently blocked on Oracle's
side: creating the VCN's Internet Gateway route rule fails with `Rules in
the route table must use private IP as a target`, which is almost always a
temporary fraud/identity-review hold on a brand new free-trial account
rather than anything wrong with the request — it clears on its own,
typically within hours to a couple of days, no action needed from this
side. If it drags on much longer, Render or Fly.io are the fallback, but
nothing here is built around that unless told the plan changed.

## Why nothing is hardcoded

Since the VM's IP/hostname does not exist yet, every place that would
otherwise need it is env config instead:

- **Backend**: `YanaFreeAPIMerger/.env` (`FREELLMAPI_BASE_URL`,
  `FREELLMAPI_API_KEY`, `PORT`) — see `YanaFreeAPIMerger/.env.example`.
- **Frontend**: `demo/virtualYanny.ts`'s `VIRTUAL_YANNY_API_BASE_URL` —
  blank right now, the same "absent rather than invented" pattern
  `demo/supabase.ts` already uses for the same reason (see that file's own
  doc comment). While it is blank, the launcher still renders (so the
  feature is discoverable) but the popup's own health check treats a blank
  base URL as an immediate "not available" — there is nowhere to even try
  reaching, so it does not attempt one.

## Once the VM is up

1. Run `deploy/provision-oracle-linux9.sh <git-clone-url> <branch>` as root
   on the fresh instance. Installs Node 22, nginx, certbot, firewalld;
   creates a dedicated `virtualyanny` service user with no shell and no
   write access to the checkout; clones this repo; installs the backend's
   dependencies; installs (but does not start) `yanafreeapimerger.service`.
2. Point DNS at the instance (an `api.` subdomain of pricesniffs.space is
   the assumption baked into `deploy/nginx-pricesniffs-api.conf.example` —
   change it there if a different hostname is used).
3. Fill in `YanaFreeAPIMerger/.env` with the real FreeLLMAPI URL and key.
4. `certbot --nginx -d <hostname>` — the widget calls this API straight from
   the browser on an HTTPS page, so the API origin has to be HTTPS too or
   every browser silently blocks it as mixed content. Not optional.
5. `systemctl start yanafreeapimerger`, then confirm with
   `curl https://<hostname>/api/health` — should report `{"ok":true,...}`.
6. Set `VIRTUAL_YANNY_API_BASE_URL` in `demo/virtualYanny.ts` to that
   hostname, then `npm run demo` and push — the next deploy carries the
   live widget.

## Keeping the backend's data fresh

`YanaFreeAPIMerger/server/siteData.js` re-reads the site's data modules
fresh from disk on every single question (see that file's own doc comment
for why) — nothing needs restarting for a new answer to reflect a recent
price. What does need to happen is the checkout on the VM itself staying
up to date with the hourly harvest's commits; this repo does not yet
include a mechanism for that (a cron `git pull`, a webhook, whatever fits
the eventual host) — worth building once the VM is actually live and this
becomes a real rather than a hypothetical gap.
