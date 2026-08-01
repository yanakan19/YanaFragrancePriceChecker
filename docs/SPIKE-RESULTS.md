# Phase 0 spike: results

Ran 1 August 2026 at 21:01 UTC from a GitHub Actions runner against all twelve
live shops. Dry run, so nothing was written.
[Run 30718187264](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/30718187264).

## The headline

**Zero listings, from all twelve shops.** Nine failed outright and three
answered with no product markup.

| Shop | Result | Reading |
|---|---|---|
| Notino UK | HTTP 403 | Blocked |
| Boots | HTTP 403 | Blocked |
| The Fragrance Shop | HTTP 403 | Blocked |
| The Perfume Shop | HTTP 403 | Blocked |
| Superdrug | HTTP 403 | Blocked |
| Selfridges | HTTP 403 | Blocked |
| John Lewis | HTTP 404 | Wrong section URL |
| LOOKFANTASTIC | HTTP 404 | Wrong section URL |
| Allbeauty | 200, nothing parsed | Wrong URL, or the listing is rendered by script |
| Justmylook | 200, nothing parsed | Wrong URL, or the listing is rendered by script |
| Beautybase | 200, nothing parsed | Wrong URL, or the listing is rendered by script |
| Harvey Nichols | 200, nothing parsed | Wrong URL, or the listing is rendered by script |

## What this actually tells us

**The plain fetch bet has lost.** The original plan hoped a simple request plus a
JSON-LD parser would cover perhaps eight of twelve shops at roughly fifty
milliseconds and no cost per page, leaving a managed scraper for the awkward
minority. Half the registry rejects the request before serving any markup at all.
A 403 arriving that fast is bot mitigation recognising a datacentre address, not
anything about the request itself.

Worth being precise about what has and has not been disproved:

- **Disproved:** that these shops can be read from a cloud IP with a plain
  fetch. Six of twelve refuse.
- **Not yet tested:** whether the pages carry usable JSON-LD once you can
  actually reach them. Nothing was served, so the markup question is still open.
- **Not the cause:** our parser. It was never handed a single byte of product
  markup to work on.

**Affiliate feeds are now the primary ingestion route, not the monetisation
afterthought.** They were already the better path for image rights and EANs. This
adds the deciding argument: for at least six shops they may be the only way in
that does not involve paying a scraping service to route around bot protection.
That reframes `docs/AFFILIATE_SETUP.md` from a revenue task into the critical
path, and it makes applying to Awin the most valuable next action rather than a
later one.

## What went right

The safety guards earned their place on their first live run. Boots, Superdrug
and Selfridges each hold fixture data, each returned zero, and each **refused to
write and kept the previous snapshot**:

```
Refusing to write: found 0 listings against 6 held. Below 50% of the previous
run, which almost always means a broken section URL or a blocked request rather
than a shop clearing its shelves. Previous snapshot kept.
```

Without that guard, added roughly an hour before this run, the crawl would have
delisted every listing it held and then flagged the entire catalogue as new on
recovery. The dry run flag meant nothing could have been written anyway, but the
guard fired independently, which is the belt and braces you want here.

## Next actions, reordered by this result

1. **Apply to Awin.** Boots, LOOKFANTASTIC and Superdrug are confirmed merchants
   and three of those blocked or 404ed here. A feed sidesteps the problem
   entirely and brings EANs and licensed images with it. This is now the single
   highest value thing on the list.
2. **Fix the two 404s.** John Lewis and LOOKFANTASTIC section URLs are simply
   wrong. Cheap to correct by opening the sites.
3. **Check the four that returned 200.** Open each in a browser with developer
   tools and look for a JSON-LD block. If the markup is there but the listing
   grid is drawn by script, they need a headless browser rather than a feed.
4. **Price a managed scraper** for whatever is left after feeds. The original
   plan named Apify actors as the fallback. They are now the plan for a
   meaningful share of the registry, so the cost per thousand products matters
   much more than it did this morning.
5. **Do not retry from a datacentre IP** and expect a different answer. Six
   shops have already said no.

## Honest status of the app

The app works and is testable, but **its prices are not live.** They come from
saved pages, and the demo says so on every screen. Nothing about tonight's run
changed that, and no amount of retrying this approach will, because the shops
are refusing the connection rather than serving something we failed to parse.
