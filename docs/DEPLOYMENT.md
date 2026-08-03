# Hosting the site

`demo/` is published to GitHub Pages by `.github/workflows/deploy-pages.yml`,
behind the custom domain recorded in `demo/CNAME`. This runs automatically —
the one-off manual step is turning Pages on for this repository at all.

## One-time setup

1. In the repo: **Settings → Pages → Build and deployment → Source →
   GitHub Actions**. Without this the workflow runs and reports success but
   nothing is actually served — Pages has to be told to accept
   Actions-published artifacts before the first deploy.
2. Push anything under `demo/` (or run the workflow manually from the
   Actions tab) to trigger the first deploy.
3. Once it succeeds, the same **Settings → Pages** screen shows a **Custom
   domain** field, already pre-filled from `demo/CNAME`. Confirm it there —
   GitHub then issues the HTTPS certificate for the domain, which takes a
   few minutes and won't complete until the DNS step below is also live.

## Pointing the domain here

Whoever registers the domain sets DNS at the registrar, not in this repo:

- **Type:** `CNAME`
- **Host:** `@` (root/apex — some registrars call this `pricesniff.lol`
  itself, or blank; Namecheap uses `@`)
- **Value:** `<github-username>.github.io`

`.lol` supports apex `CNAME` flattening at every registrar this project has
checked pricing for, so a root-domain `CNAME` is fine — no `A` records to
GitHub's IP list needed.

## Changing the domain later

Edit `demo/CNAME` (single line, the domain, no `https://`) and push. GitHub
Pages reads it from the published artifact on every deploy, so the custom
domain setting stays in sync with the file rather than needing to be
re-entered in Settings by hand.
