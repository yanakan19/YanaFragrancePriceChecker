# Scraping and bulk reuse

What is actually in place, what it does and does not do, and why the obvious
next steps were not taken.

## What is in place

[`demo/robots.txt`](../demo/robots.txt) allows ordinary search engine
crawling (wanted — this is an affiliate business that needs to be found) and
disallows the crawlers that identify themselves as harvesting for AI training
or bulk reuse: `GPTBot`, `Google-Extended`, `CCBot`, `ClaudeBot`,
`PerplexityBot`, `Bytespider` and a handful of others by name.

That is the entire realistic defence. It works only against crawlers that
choose to identify themselves honestly and respect the file, the same as
robots.txt does on every other site. A scraper that lies about its user agent
or ignores the file is unaffected, and there is no code-level check that could
tell it apart from an ordinary visitor.

## Why this is the ceiling, not a starting point

The sites that successfully blocked *our own* attempts to read them earlier
this project (Fragrantica, Reddit, TikTok's research data) all share
something this site does not have: a real backend serving data behind
authentication, per-key rate limits and pagination. Blocking a scraper is
fundamentally a backend's job — it can refuse a request, throttle an IP,
require a token. A static site cannot do any of that, because there is
nothing standing between the request and the file being requested.

PriceSniffs is a static build: `npm run demo` bakes the entire catalogue
(every fragrance, every retailer, every price) directly into `demo/index.html`
as inline JSON, and GitHub Pages serves that one file to whoever asks for it.
There is no server-side code running per request, so there is nothing that
could inspect a request and decide to refuse it. Downloading the whole
catalogue is not a multi-step crawl to be rate-limited — it is the same single
`GET /` a browser makes to show the homepage. Anything that can load the page
can read everything on it, because that is also how a real visitor's browser
gets the data to render the page at all.

## What would not actually help

- **Obfuscating or minifying the embedded data further.** It is already
  minified for size, not secrecy, and deobfuscating a JS array is trivial for
  anyone capable of writing a scraper in the first place. This would only
  cost real users load time for no real protection.
- **Disabling right-click, view-source or devtools.** All bypassable in
  seconds, degrades the site for legitimate users and accessibility tools,
  and was rejected for the same reason this project never ships a number it
  cannot stand behind: it would be protection that only looks like protection.
- **A CAPTCHA or JS challenge on page load.** Would need a service in front of
  GitHub Pages to run (see Cloudflare, below) and would slow down every real
  visitor to inconvenience a scraper that can solve or route around it anyway.

## The one real lever available, and why it has not been pulled

Putting the domain behind Cloudflare (free tier, proxied DNS instead of the
direct A records currently pointing at GitHub Pages) would add Bot Fight Mode
and request rate limiting in front of every request, including the one that
serves the initial HTML. That is a genuine improvement against naive,
high-volume scripted scraping — it does not touch a scraper capable of
running a real browser, but it raises the floor.

Not done yet because `pricesniffs.space` only just finished its DNS and
certificate setup pointing directly at GitHub Pages, and re-pointing DNS
through a proxy now would mean redoing that certificate work and re-verifying
the domain while it is still settling. Worth revisiting once the site has
been stable for a while and only if bulk scraping turns out to be an actual
observed problem rather than a theoretical one — it is a real infrastructure
change (new nameservers at the registrar), not a code change, so it needs a
deliberate decision to do, not a default.

## Bottom line

Casual, compliant crawlers are turned away. A determined scraper is not,
because the catalogue has to be readable by a real browser to be a working
price comparison site at all, and nothing short of gating it behind a real
backend can tell the two apart. That trade was made the day this became a
static site with no server, and it is the same trade every public price
comparison site makes.
