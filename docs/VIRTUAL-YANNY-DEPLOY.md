# Virtual Yanny deployment

The chat widget (`demo/app.ts`, floating launcher + popup) and the backend
it talks to (`YanaFreeAPIMerger/`) are both built and live in this repo
already. **The backend is still not deployed anywhere** — this site is
static (GitHub Pages), so the Express service behind the widget needs
somewhere else to run.

What changed as of this doc's last edit: the *deployment path* now exists
and is committed, even though the deployment itself does not. There is a
`Dockerfile`, a `fly.toml`, and a GitHub Actions workflow that builds,
deploys, and then verifies the result — behind one button, after one
one-time `flyctl apps create` you run yourself (step 1 explains why that
part is not automated). Nobody has been able to run it from here — the
environment that wrote these files has no outbound network, so it could not
reach Fly, could not test the router, and could not verify anything hosted.
Everything below is scaffolding that has been checked as far as it can be
locally; none of it is a claim that something is live.

`demo/virtualYanny.ts`'s `VIRTUAL_YANNY_API_BASE_URL` stays `''` until a
real deployment reports itself healthy — see that file's own comment, and
[the last step](#7-the-one-line-that-changes-afterwards), for why a guessed
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

## The fast path: one terminal, two secrets and a button

This is the whole sequence. It assumes a Fly.io account (you already have
one — the router runs there) and nothing else.

Steps 1 and 2 need a terminal with `flyctl` logged in as you, once, ever.
Everything after that is the button.

### 1. Create the Fly app (once, by hand)

```
flyctl apps create pricesniffs-yanny --org personal
```

Substitute your own name if you change `app` in `YanaFreeAPIMerger/fly.toml`
— and you may have to, because Fly app names are globally unique across
every Fly account, so a stranger may already hold this one. If Fly says the
name is taken, pick another, run the command with it, and put the same name
in `fly.toml`.

**Why the workflow does not do this for you.** It used to try, and that is
what every failed deploy so far died on:

```
App virtual-yanny-backend not found; creating it in org personal.
Error: unauthorized (Request ID: …)
```

That is Fly refusing the *token*, not the name. Creating an app is an
organisation-level action, and the token type meant for CI —
`flyctl tokens create deploy` — is scoped to a single app that already
exists. It cannot create one. The workflow could be given a token that can,
but that means a secret with authority over your whole Fly organisation
sitting in a public repository's settings, permanently, to automate a step
that runs once in the app's lifetime. Creating it yourself is a smaller
door left unlocked.

If you would rather have CI do it anyway, tick **create_app_if_missing**
when you dispatch the workflow and put an org-scoped token
(`flyctl tokens create org`) or a personal access token in `FLY_API_TOKEN`.
The workflow supports it; it is just not the default. *(Which flyctl token
subcommands exist and exactly what each one may do has not been verified
from this repo — there has never been a network here to check Fly's docs or
run flyctl. What is verified is the failure above: the token in use cannot
create an app.)*

### 2. Get a Fly deploy token, scoped to that app

Now that the app exists, mint the narrowest token that can deploy it:

```
flyctl tokens create deploy -a pricesniffs-yanny
```

Copy the whole output, `FlyV1 …` prefix included.

If a later run reports that this token cannot *set secrets* either, the
workflow says so as a warning and carries on — set the key on the app
yourself, once:

```
flyctl secrets set --app pricesniffs-yanny FREELLMAPI_API_KEY='<the key>'
```

Type that in a terminal. Never commit it: this repo is public.

### 3. Add exactly two repository secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository
secret**. Add these two, named exactly:

| Secret name | Value |
| --- | --- |
| `FLY_API_TOKEN` | the token from step 2 |
| `FREELLMAPI_API_KEY` | the unified key from the FreeLLMAPI router's Keys page |

These two names are what `.github/workflows/deploy-yanny.yml` reads. Nothing
else needs adding: the non-secret settings (`FREELLMAPI_BASE_URL`, `PORT`,
`AGENT_TIMEOUT_SECONDS`) live in `YanaFreeAPIMerger/fly.toml` because they
are public facts.

This is the only place the API key is ever typed. It goes GitHub secret →
Fly secret store → the running container's environment, and is never written
to a file, a log, or a container image layer.

### 4. Run the workflow

**Actions → "Deploy Virtual Yanny backend" → "Run workflow" → branch
`claude/scentday-retailer-registry-h92tth` → green "Run workflow" button.**

It only runs when you press this button. There is no `push` trigger on
purpose: this branch is also the live site's deploy branch and the crawl
commits to it many times a day, so a push trigger would rebuild the backend
on every price update and restart it mid-conversation.

Leave all three inputs at their defaults unless something has gone wrong:

| Input | Leave it at | Change it only when |
| --- | --- | --- |
| `fly_org` | `personal` | you have a real Fly organisation, and only matters with the next one ticked |
| `app_name` | blank | Fly says the name in `fly.toml` is taken; a value here overrides that file for one run |
| `create_app_if_missing` | off | you want CI to create the app and have given it a token that can (see step 1) |

The run does four things, in order: checks the Fly app exists and that your
token can see it, stages `FREELLMAPI_API_KEY` as a Fly secret, builds and
deploys the image, then verifies the result over HTTP.

### 5. Never press "Re-run jobs". Ever.

This has cost more failed runs here than every other cause combined, so it
gets its own section.

A GitHub Actions **re-run replays the original commit** of that run. It
re-checks-out the same SHA. Anything committed since — a renamed app, a
fixed workflow, this document — is simply not there. So the classic loop is:
run fails, you fix the cause, commit it, press "Re-run", and watch the log
print the *old* value and fail exactly the same way. That is what happened
here: the log kept resolving `virtual-yanny-backend` long after `fly.toml`
had been changed to `pricesniffs-yanny`, because every attempt was a replay
of a commit made before the change.

The workflow now refuses to build in that state. Its first step prints the
commit, branch, attempt number and resolved app name in a box, and stops
with an explanation if either

- the `fly.toml` in the commit being built names a different app from the
  `fly.toml` at the tip of the branch, or
- this is a re-run (attempt 2 or higher) of a commit the branch has moved
  past.

A branch that has merely moved on since dispatch — the crawl commits
hourly — is a warning, not a failure, because `fly.toml` is untouched by it.

**To retry: go back to Actions → "Deploy Virtual Yanny backend" → "Run
workflow".** That is a new run at the current tip. It is the only correct
way to retry this workflow.

### 6. What a healthy result looks like

The last step calls `https://<app>.fly.dev/api/health` and requires all
three flags to be true. Its log ends with exactly these two lines — the
response, then the verdict:

```
Health response: {"ok":true,"configured":true,"freellmapiReachable":true,"agentCount":28,"siteData":{…}}
Healthy: configured=true, freellmapiReachable=true, agentCount=28
```

`agentCount` should be **28**, matching the model list in
`server/config/agents.json`. A green run whose last line says `agentCount=0`
is not a success worth trusting: it means the roster file did not make it
into the image, and it cannot happen quietly — `configured` would be false
and the step would have failed. That is the point of checking the count
rather than just the status code.

On success the run's summary page prints the URL and the exact next step.
On failure it prints the commit, the app name, and the two mistakes that
have actually cost runs here.

**This check reads the JSON body, not the HTTP status, and that is the
point.** `/api/health` always answers HTTP 200 — even when reporting
failure, because every problem it knows about is a field in the body rather
than a status code (see `server/index.js`). A plain "did it return 200"
check would pass happily on a backend that cannot answer a single question.
The three failure modes are reported distinctly:

- **No valid JSON at all** — the container did not stay up. Check
  `flyctl logs --app <app>`.
- **`configured:false`** — the process is running but cannot see the key,
  or has no agent roster. If an earlier step warned that the token could not
  set secrets, this is that warning coming true: run `flyctl secrets set
  --app <app> FREELLMAPI_API_KEY='<the key>'` yourself. Otherwise the
  `FREELLMAPI_API_KEY` repository secret is missing or empty. If the body
  also carries an `agentsError` field, `server/config/agents.json` is what is
  wrong, not the key.
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

### 7. The one line that changes afterwards

Only after a real deployment has reported healthy, point the widget at it.
In `demo/virtualYanny.ts`:

```ts
const VIRTUAL_YANNY_API_BASE_URL = 'https://pricesniffs-yanny.fly.dev';
```

then `npm run demo`, commit `demo/virtualYanny.ts` with the rebuilt
`demo/index.html` and `demo/404.html`, and push. The next site deploy
carries the live widget. Nothing else in `demo/` changes.

Or let the script do all of that:

```
bash deploy/set-yanny-api-base-url.sh https://pricesniffs-yanny.fly.dev
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

**The app name is `pricesniffs-yanny`, set in
`YanaFreeAPIMerger/fly.toml`.** Fly app names are globally unique across all
of Fly, so if `flyctl apps create` reports it as taken, change `app` in that
file to anything free and change nothing else — the workflow reads the name
from there, and the hostname is always `<app>.fly.dev`. It is deliberately a
different app from `yanny-freellmapi`, the router, which none of this
touches.

Nobody has established whether `pricesniffs-yanny` is actually free. The
earlier rename away from `virtual-yanny-backend` assumed a name collision,
but the log never said that — it said `Error: unauthorized`, which is about
the token and stops before the name is ever tested. So treat availability as
unknown until Fly answers.

To try a different name without a commit, dispatch the workflow with the
**app_name** input filled in: it rewrites `fly.toml`'s `app` line on the
runner for that run only, so `--app` and `--config` still agree and there is
still exactly one place the name is read from. It is a way to find a free
name in one dispatch instead of a commit-per-guess; put the winner in
`fly.toml` afterwards so the file stays the source of truth.

### Deploying by hand instead

Same thing without the workflow, run once each:

```
flyctl apps create pricesniffs-yanny --org personal
flyctl secrets set --app pricesniffs-yanny FREELLMAPI_API_KEY='<the key>'
flyctl deploy . --config YanaFreeAPIMerger/fly.toml \
                --dockerfile YanaFreeAPIMerger/Dockerfile --remote-only
curl https://pricesniffs-yanny.fly.dev/api/health
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
the router is having a bad minute. Dispatching the workflow again is a
reasonable first response — a fresh run from the button, not "Re-run jobs"
on the failed one (see step 5).

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
run of the deploy workflow, not as fresh as the site. Dispatch the workflow
again when that gap starts to matter. Wiring the deploy to the crawl would close
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
6. Then [the one line](#7-the-one-line-that-changes-afterwards), same as
   any other host.

On this path the checkout is a real git clone, so keeping it current with
the hourly harvest is a `git pull` on a timer rather than a redeploy — the
one thing it does better than the container. Nothing in the repo automates
that yet.
