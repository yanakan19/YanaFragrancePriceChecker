# Virtual Yanny deployment

The chat widget (`demo/app.ts`, floating launcher + popup) and the backend
it talks to (`YanaFreeAPIMerger/`) are both built and live in this repo
already. **The backend is still not deployed anywhere** — this site is
static (GitHub Pages), so the Express service behind the widget needs
somewhere else to run.

What changed as of this doc's last edit: the *deployment path* now exists
and is committed, even though the deployment itself does not. There is a
`Dockerfile`, a `fly.toml`, and a one-button GitHub Actions workflow that
builds, deploys, and then verifies the result. Nobody has been able to run
it from here — the environment that wrote these files has no outbound
network, so it could not reach Fly, could not test the router, and could
not verify anything hosted. Everything below is scaffolding that has been
checked as far as it can be locally; none of it is a claim that something
is live.

`demo/virtualYanny.ts`'s `VIRTUAL_YANNY_API_BASE_URL` stays `''` until a
real deployment reports itself healthy — see that file's own comment, and
[the last step](#5-the-one-line-that-changes-afterwards), for why a guessed
URL there would be worse than an honest blank one.

## The two different servers involved — do not conflate them

There are two separate things to host, and only one of them is missing:

1. **FreeLLMAPI, the model router.** Already deployed and live at
   `https://yanny-freellmapi.fly.dev` — OpenAI-compatible at
   `/v1/chat/completions`, Bearer auth, `model` accepts `"auto"`, a specific
   id from `GET /v1/models`, or `"fusion"`. Nothing to do here; this is an
   existing fact, not a step. The base URL above is fine to put in a public
   doc or repo — it is just a hostname. **The API key is not** — see
   [where the key lives](#where-the-key-lives-and-where-it-must-never-go).
2. **This app (`YanaFreeAPIMerger/server`), the council + scoring layer.**
   This is the thing with nowhere to run. It is a small Express process; any
   host that can run Node 20+, hold two environment variables, and reach the
   internet works. The rest of this document is about getting it running.

---

## The fast path: two secrets and a button

This is the whole sequence. It assumes a Fly.io account (you already have
one — the router runs there) and nothing else.

### 1. Get a Fly deploy token

On any machine with `flyctl` installed and logged in:

```
flyctl tokens create deploy
```

Copy the whole output, `FlyV1 ...` prefix included. (On older flyctl this
command is `flyctl auth token`.)

### 2. Add exactly two repository secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository
secret**. Add these two, named exactly:

| Secret name | Value |
| --- | --- |
| `FLY_API_TOKEN` | the token from step 1 |
| `FREELLMAPI_API_KEY` | the unified key from the FreeLLMAPI router's Keys page |

These two names are what `.github/workflows/deploy-yanny.yml` reads. Nothing
else needs adding: the non-secret settings (`FREELLMAPI_BASE_URL`, `PORT`,
`AGENT_TIMEOUT_SECONDS`) live in `YanaFreeAPIMerger/fly.toml` because they
are public facts.

This is the only place the API key is ever typed. It goes GitHub secret →
Fly secret store → the running container's environment, and is never written
to a file, a log, or a container image layer.

### 3. Run the workflow

**Actions → "Deploy Virtual Yanny backend" → Run workflow.**

It only runs when you press this button. There is no `push` trigger on
purpose: this branch is also the live site's deploy branch and the crawl
commits to it many times a day, so a push trigger would rebuild the backend
on every price update and restart it mid-conversation.

The one input, `fly_org`, only matters the first time, when the app has to
be created. Leave it as `personal` unless you have a Fly organisation.

The run does five things, in order: creates the Fly app if it does not exist
yet, stages `FREELLMAPI_API_KEY` as a Fly secret, builds the image, deploys
it, then verifies the result.

### 4. What a healthy result looks like

The last step calls `https://<app>.fly.dev/api/health` and requires all
three flags to be true:

```json
{"ok":true,"configured":true,"freellmapiReachable":true,"agentCount":28}
```

On success the run's summary page prints the URL and the exact next step.

**This check reads the JSON body, not the HTTP status, and that is the
point.** `/api/health` always answers HTTP 200 — even when reporting
failure, because every problem it knows about is a field in the body rather
than a status code (see `server/index.js`). A plain "did it return 200"
check would pass happily on a backend that cannot answer a single question.
The three failure modes are reported distinctly:

- **No valid JSON at all** — the container did not stay up. Check
  `flyctl logs --app <app>`.
- **`configured:false`** — the process is running but cannot see the key.
  The `FREELLMAPI_API_KEY` secret is missing or empty. Fix it and re-run.
- **`freellmapiReachable:false`** — the backend is fine, but the router
  rejected it or was unreachable. Either the key is wrong/expired, or the
  shared router is rate-limited right now (see
  [the quota caveat](#operational-caveat-shared-free-tier-quota)).

The check retries for about two minutes before giving up, so a single blip
does not fail an otherwise good deploy. A failing verification means the
deploy produced a backend that does not work — which is exactly the thing
worth failing loudly over, since the alternative is discovering it from a
reader.

Note that Fly's *own* health check in `fly.toml` points at the same endpoint
but only tests liveness. That is deliberate: if Fly treated
`freellmapiReachable:false` as unhealthy, a third party's rate limit could
take this app down and keep it down.

### 5. The one line that changes afterwards

Only after a real deployment has reported healthy, point the widget at it.
In `demo/virtualYanny.ts`:

```ts
const VIRTUAL_YANNY_API_BASE_URL = 'https://virtual-yanny-backend.fly.dev';
```

then `npm run demo`, commit `demo/virtualYanny.ts` with the rebuilt
`demo/index.html` and `demo/404.html`, and push. The next site deploy
carries the live widget. Nothing else in `demo/` changes.

Or let the script do all of that:

```
bash deploy/set-yanny-api-base-url.sh https://virtual-yanny-backend.fly.dev
```

It refuses to write a URL it has not just seen report `ok:true` itself, then
rewrites the line and runs `npm run demo` for you. There is deliberately no
override flag: the value has to come from a deployment that answered, never
from a guess. Substitute your own hostname if you changed the app name.

**Why the blank is not laziness.** Blank is honest — the launcher still
renders, the popup's health check treats a blank base URL as an immediate
"not available", and no request is attempted. A placeholder URL instead
makes every reader who opens the chat wait out a timeout and get a failure.
Failing once, openly, beats failing quietly forever.

---

## Why Fly.io, and how to change the app name

Fly is the path that was built out because you already have an account and
the router already runs there — one provider, one CLI, one bill, and a
token you can already mint. It also takes a Dockerfile directly, which this
app needs more than most (see below), and issues HTTPS on `*.fly.dev`
automatically, which the widget requires: it calls this API from an HTTPS
page, and browsers block plain-HTTP calls from one as mixed content.

Render and Railway would both work and neither was scaffolded, on purpose —
one finished path beats three half-built ones. The `Dockerfile` is not
Fly-specific, so moving later mostly means pointing another provider at it.

**The app name is `virtual-yanny-backend`, set in
`YanaFreeAPIMerger/fly.toml`.** Fly app names are globally unique across all
of Fly, so if `flyctl apps create` reports it as taken, change `app` in that
file to anything free and change nothing else — the workflow reads the name
from there, and the hostname is always `<app>.fly.dev`. It is deliberately a
different app from `yanny-freellmapi`, the router, which none of this
touches.

### Deploying by hand instead

Same thing without the workflow, run once each:

```
flyctl apps create virtual-yanny-backend --org personal
flyctl secrets set --app virtual-yanny-backend FREELLMAPI_API_KEY='<the key>'
flyctl deploy . --config YanaFreeAPIMerger/fly.toml \
                --dockerfile YanaFreeAPIMerger/Dockerfile --remote-only
curl https://virtual-yanny-backend.fly.dev/api/health
```

**Run these from the repo root, not from `YanaFreeAPIMerger/`.** The build
context has to be the repo root, which is the one genuinely surprising thing
about this app: `server/siteData.js` has no database and no bundled copy of
the catalogue, and instead imports the site's own TypeScript modules
(`demo/data.ts`, `demo/catalogue.generated.ts`, `src/index.ts` and friends)
from the parent directory at runtime, so the image has to contain `demo/`
and `src/` too. Building with `YanaFreeAPIMerger/` as the context cannot
work — Docker refuses to copy from outside the context. The `Dockerfile`'s
header explains the layout; `.dockerignore` at the repo root keeps the
~24 MB of generated HTML out of it.

---

## Where the key lives, and where it must never go

- **Backend**: read from the environment as `process.env.FREELLMAPI_API_KEY`
  (see `server/index.js`, `server/freellmapiClient.js`). In production that
  environment is Fly's encrypted secret store, injected at runtime. Locally
  it is `YanaFreeAPIMerger/.env`, which is gitignored;
  `YanaFreeAPIMerger/.env.example` carries only the placeholder
  `freellmapi-your-unified-key`.
- **Never in the repo.** Not in code, config, a workflow, the `Dockerfile`,
  `fly.toml`, a comment, a test, or `.env`. This repo is public.
- **Never anywhere under `demo/`.** That folder is a static client bundle
  inlined into HTML and shipped to every visitor's browser. A key there is
  a leaked key, permanently and irreversibly.
- **Never baked into a container image.** A secret written into a layer
  survives in the image even if a later step deletes it. `.dockerignore`
  excludes `.env` as a second lock on that door; the key reaches the
  container only at runtime.
- **Frontend**: `demo/virtualYanny.ts` holds a hostname and nothing else.
  The browser calls *this backend*, never the router directly — which is
  the whole reason the backend exists in front of it. Preserve that: the
  moment the browser talks to the router, the key would have to be in the
  bundle.

## Operational caveat: shared free-tier quota

`https://yanny-freellmapi.fly.dev` pools free-tier quota across Google AI
Studio, Groq, Mistral, and Cohere, and that quota is **shared across every
app pointed at it**, not private to Virtual Yanny. Heavy use from this
chatbot — or from any other app on the same router — can rate-limit the
others. There is no code fix for this within `YanaFreeAPIMerger`; it is a
fact about the shared instance, worth knowing before assuming a slow or
failed answer here is a bug in this app specifically.
`server/config/agents.json` currently fans out to 28 models per question,
which makes this more likely, not less — trimming that list is the lever if
the router starts throttling.

This is also the most likely reason for a deploy to fail its health check
while being perfectly correct: `freellmapiReachable:false` can simply mean
the router is having a bad minute. Re-running the workflow is a reasonable
first response.

## Two things to know about running this in a container

**Memory.** The machine is configured with 512 MB and 512 MB of swap. That
is measured, not padded, and it used to say 1 GB.

`server/siteData.js` originally re-imported the site's data modules on
every single question, cache-busting the specifier so Node treated each
call as a brand new module. `demo/catalogue.generated.ts` alone is ~15 MB
of TypeScript, and every one of those re-imports is a module Node's loader
pins for the life of the process — nothing the collector can ever free.
Driving `buildSiteDataBlock()` in a loop against this repo's checkout,
reading peak RSS from the kernel's `VmHWM` and sampling `heapUsed` after a
forced full GC, that design retained **129 MB per question**: 6.6 MB of
heap at boot, 209 MB after one question, 6,531 MB after fifty, with peak
RSS for the run at 7.1 GB. The 1 GB machine was not "enough" — it was one
or two questions from dying, and the swap was a plaster.

The modules are now imported once per process (see that file's header).
Same measurement, same catalogue: 6.7 MB at boot, 67.7 MB after one
question, 67.8 MB after fifty — 0.002 MB retained per question — with peak
RSS at 393.6 MB for the run, and 393.6–397.2 MB across five runs of 50 to
200 questions. Nothing grows after the first question, so 512 MB with the
swap cushion fits with roughly 115 MB of headroom. 256 MB still does not:
the one-time import of the catalogue peaks past it.

The number that governs this is the catalogue's size, since peak RSS is
dominated by transpiling and parsing that one file once. Re-measure if
`demo/catalogue.generated.ts` passes ~20 MB, and raise `memory` in
`fly.toml` to `1gb` if peak RSS gets within ~50 MB of the limit. All the
figures above were taken in a dev container under Node 22, not on Fly —
the environment that measured them has no outbound network and could not
reach Fly at all.

**Data freshness.** The image contains a *snapshot* of
`demo/catalogue.generated.ts` from the moment it was built, and the process
never writes to its own filesystem — so inside a container the data on disk
cannot change while the server runs, and it never could. Loading those
modules once per process therefore costs nothing in freshness here that the
image had not already cost: the chatbot's prices are as fresh as the last
run of the deploy workflow, not as fresh as the site. Re-run the workflow
when that gap starts to matter. Wiring the deploy to the crawl would close
it, but that trade was declined here: it would mean rebuilding and
restarting the backend many times a day.

Where the checkout *can* change under a running server — the bare-metal
`deploy/` path below, where a `git pull` updates the files a systemd
service is reading — `/api/health` now reports a `siteData` block:

```json
"siteData": { "loaded": true, "loadedAt": "…", "catalogueCrawledAt": "…",
              "stale": false, "changedFiles": [] }
```

`stale: true` means this process is answering from an older catalogue than
the disk holds, and names the files that moved. Restarting the service is
the fix. It deliberately does not fail the health check and does not
trigger an in-process reload: a reload could only refresh the seven entry
modules and not the graph beneath them (Node drops a `?t=` query when
resolving the relative imports *inside* a module — pinned by a test in
`YanaFreeAPIMerger/test/siteData.test.js`), which would hand back a
snapshot whose fragrance count and prices came from different catalogues.
Stale but self-consistent beats fresh but self-contradicting.

## The Oracle Cloud VM alternative

An Oracle Cloud Always Free VM (Oracle Linux 9, ARM,
`VM.Standard.A1.Flex`) was the earlier plan, and its scaffolding is still in
`deploy/`. Provisioning was blocked on Oracle's side the last time it was
attempted: creating the VCN's Internet Gateway route rule failed with
`Rules in the route table must use private IP as a target`, which is almost
always a temporary fraud/identity-review hold on a brand new free-trial
account rather than anything wrong with the request — it usually clears on
its own within hours to a couple of days. Nobody has been able to re-check
Oracle's side since, so treat that status as unverified rather than current.

If you go that route instead:

1. Run `deploy/provision-oracle-linux9.sh <git-clone-url> <branch>` as root
   on the fresh instance. Installs Node 22, nginx, certbot, firewalld;
   creates a dedicated `virtualyanny` service user with no shell and no
   write access to the checkout; clones this repo; installs the backend's
   dependencies; installs (but does not start)
   `yanafreeapimerger.service`.
2. Point DNS at the instance — an `api.` subdomain of pricesniffs.space is
   the assumption baked into `deploy/nginx-pricesniffs-api.conf.example`.
3. Fill in `YanaFreeAPIMerger/.env` with `FREELLMAPI_BASE_URL`,
   `FREELLMAPI_API_KEY`, `PORT=4000`, `AGENT_TIMEOUT_SECONDS=25`.
4. HTTPS is not optional — `certbot --nginx -d <hostname>`.
5. `systemctl start yanafreeapimerger`, then confirm with
   `curl https://<hostname>/api/health`.
6. Then [the one line](#5-the-one-line-that-changes-afterwards), same as
   any other host.

On this path the checkout is a real git clone, so keeping it current with
the hourly harvest is a `git pull` on a timer rather than a redeploy — the
one thing it does better than the container. Nothing in the repo automates
that yet.
