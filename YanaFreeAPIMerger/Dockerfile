# Virtual Yanny backend — container image.
#
# ── The build context is the REPO ROOT, not this folder ──────────────────
# This is the one surprising thing about this Dockerfile, and skipping it
# produces an image that builds fine and then throws on the first question.
# `server/siteData.js` deliberately has no database and no bundled copy of
# the catalogue: it imports pricesniffs.space's own TypeScript modules
# (`demo/data.ts`, `demo/catalogue.generated.ts`, `src/services/
# priceService.ts`, `src/index.ts`, `demo/brandSites.ts`, `demo/legal.ts`,
# `src/config/retailers.ts`) straight out of the parent repo, resolving them
# from `path.resolve(server/, '..', '..')`. So the image has to reproduce
# that layout exactly — `/app/YanaFreeAPIMerger/server` next to `/app/demo`
# and `/app/src` — and the build must therefore be run from the repo root:
#
#   flyctl deploy . --config YanaFreeAPIMerger/fly.toml \
#                   --dockerfile YanaFreeAPIMerger/Dockerfile
#
# Building with this folder as the context cannot work: `demo/` and `src/`
# are above it and Docker refuses to copy from outside the context.
#
# ── Why bookworm-slim and not alpine ─────────────────────────────────────
# `tsx` (a real runtime dependency here, not a dev tool — see the CMD note
# below) pulls in esbuild, whose native binary ships as a per-platform
# optional dependency. This app's committed package-lock.json contains only
# the glibc `@esbuild/linux-*` packages and no `-musl` variants, so a musl
# base like alpine would `npm ci` successfully and then fail at startup with
# no matching esbuild binary. Debian slim keeps the lockfile honest.
FROM node:22-bookworm-slim AS deps

WORKDIR /app/YanaFreeAPIMerger

# Copied on their own, before any source, so Docker can reuse the cached
# install layer on every deploy that only changes code or catalogue data —
# which is nearly all of them.
COPY YanaFreeAPIMerger/package.json YanaFreeAPIMerger/package-lock.json ./

# `--omit=dev` is safe precisely because this app has no devDependencies:
# cors, dotenv, express and tsx are all runtime dependencies. `npm ci`
# (not `npm install`) so the lockfile is authoritative and a deploy can
# never silently float onto a newer transitive version.
RUN npm ci --omit=dev


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
# The app itself reads `Number(process.env.PORT) || 4000` (server/index.js).
# 8080 is set here rather than left to that default purely so there is one
# number to keep in step with fly.toml's `internal_port`; change both or
# neither.
ENV PORT=8080

WORKDIR /app

COPY --from=deps /app/YanaFreeAPIMerger/node_modules ./YanaFreeAPIMerger/node_modules
COPY YanaFreeAPIMerger/package.json YanaFreeAPIMerger/package-lock.json ./YanaFreeAPIMerger/
COPY YanaFreeAPIMerger/server ./YanaFreeAPIMerger/server

# The site's own data and presentation logic — the reason the build context
# is the repo root (see the header). `src/` is small and copied whole
# because the seven modules above pull in most of it transitively
# (`src/types/`, `src/services/`, `src/config/`, `src/catalogue/brandName`).
# Only `demo/*.ts` is taken from `demo/`, never the generated `index.html`
# / `404.html`, which are ~12 MB each of inlined site bundle that this
# backend has no use for (see .dockerignore at the repo root).
COPY src ./src
COPY demo/*.ts ./demo/

WORKDIR /app/YanaFreeAPIMerger

# `node` (uid 1000) ships with the official image. Everything above is
# root-owned and stays that way: this process only ever reads its code and
# the site modules, and never writes to the filesystem, so read-only
# ownership is exactly the access it should have.
USER node

EXPOSE 8080

# Deliberately NOT `npm start`. npm would sit between the init system and
# node as PID 1 and swallow the SIGTERM Fly sends when replacing a machine,
# turning every deploy into a forced kill after the grace period. Running
# node directly makes it PID 1, where its default SIGTERM handling exits
# promptly.
#
# `--import tsx` is what `npm start`'s `tsx server/index.js` does under the
# hood, and it is not optional: the site modules this server imports are
# TypeScript, and plain `node` cannot resolve the `.js` specifiers
# server/siteData.js uses for them (that file's own header explains why).
CMD ["node", "--import", "tsx", "server/index.js"]
