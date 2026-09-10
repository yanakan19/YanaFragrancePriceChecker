# Logo probe report

Run 2026-09-10T10:42:34.329Z — 138 target(s), one request per host per 2s.

Reports only — nothing here writes to src/config/retailers.ts or demo/brandLogos.ts. Every asset found is measured against both theme grounds (#0A0A0B dark, #FCFCFD light); ink is picked by scripts/logo-ink.py from that measurement, never eyeballed.

**Known gap, not yet closed.** `scripts/logo-probe.ts` reads `<link rel="icon"|"apple-touch-icon"|"apple-touch-icon-precomposed"|"mask-icon"|"shortcut icon">` and any `Organization.logo` in a JSON-LD block (including one nested in a `@graph` array). It does **not** fall back to a bare `/favicon.ico` when a page declares no `<link>` at all — docs/LOGOS-PLAN.md §5 step 5 names boots as exactly this case ("nothing declared; `favicon.ico` holds a 192×192 entry"), and this run reproduces that: `boots`, `the-fragrance-counter`, `zara` and `manchester-ouds` all answered 200 with zero candidates found. Confirmed by hand for Ajmal below (whose `rel="shortcut icon"` href 404s on the brand's own server — a real dead link, not a probe bug) that the parser itself is now reading multi-word `rel` values correctly; the four rows above are the genuine remaining gap, to close before running this against the retailer set for real (step 5, deferred).

Two earlier bugs, found and fixed before this run: (1) `rel="shortcut icon"` — a two-word value — was being read back as just `"shortcut"` by a regex that stopped at the first space, silently dropping every candidate on a site using that exact attribute form (Ajmal, Escada, Ariana Grande, ORIENTICA, Lanvin, Cacharel, Mancera, Risala Elite and others were affected; all recovered once fixed). (2) SVG candidates rasterised into a fixed square canvas came back reporting square dimensions regardless of the artwork's real shape — Justmylook's 236×37 wordmark measured 512×512 before the fix, which would have shipped it into the wrong CSS slot. Fixed by reading the SVG's own declared `width`/`height` or `viewBox` before rendering and sizing the canvas to match.

| id | kind | homepage status | candidate URL | relation | type | size | dims | transparent % | fail-on-dark % | fail-on-light % | ink | shape | basis | readAt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| allbeauty | retailer | 200 | https://allbeauty.com/cdn/shop/files/allbeauty_logo_32x32_eed458cb-5a9f-47d5-a6d9-6bf15728e9d4.png?crop=center&height=32&v=1782817025&width=32 | icon | image/png | 1.0 KB | 32×32 | 20.7 | 8.9 | 88.5 | light | square | own-site-declared | 2026-09-10 |
| allbeauty | retailer | 200 | https://allbeauty.com/cdn/shop/files/allbeauty-logo.svg?v=1752223881&width=500 | Organization.logo | image/svg+xml | 4.3 KB | 400×87 | 77 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| justmylook | retailer | 200 | https://www.justmylook.com/cdn/shop/files/favicon-32x32.png?crop=center&height=32&v=1726505486&width=32 | icon | image/png | 1.4 KB | 32×32 | 39.7 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| justmylook | retailer | 200 | https://www.justmylook.com/cdn/shop/files/JML-logo.svg?v=1726499052 | Organization.logo | image/svg+xml | 3.6 KB | 400×63 | 75.8 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| notino-uk | retailer | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| boots | retailer | 200 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| the-fragrance-shop | retailer | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| the-perfume-shop | retailer | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| john-lewis | retailer | 503 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| beautybase | retailer | 200 | https://www.beautybase.com/cdn/shop/files/Vector.png?crop=center&height=32&v=1760441967&width=32 | icon | image/png | 3.0 KB | 26×32 | 43.1 | 0 | 0 | light | wordmark | own-site-declared | 2026-09-10 |
| beautybase | retailer | 200 | https://www.beautybase.com/cdn/shop/files/logo-green.svg?v=1760441972&width=500 | Organization.logo | image/svg+xml | 11.2 KB | 400×129 | 71.9 | 0 | 13 | light | wordmark | own-site-declared | 2026-09-10 |
| lookfantastic | retailer | 200 | https://www.lookfantastic.com/ssr-assets/lookfantastic/updated-favicon.png | icon | image/png | 0.2 KB | 96×96 | 0 | 82.6 | 16.4 | own | square | own-site-declared | 2026-09-10 |
| lookfantastic | retailer | 200 | https://www.lookfantastic.comundefined/ | Organization.logo | — | — | — | — | — | — | — | — | — | 2026-09-10 | <!-- TypeError: fetch failed (Error: getaddrinfo ENOTFOUND www.lookfantastic.comundefined) -->
| superdrug | retailer | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| selfridges | retailer | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| harvey-nichols | retailer | 503 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| fragrance-click | retailer | 200 | https://www.fragranceclick.co.uk/media/favicon/stores/1/FAVICON_PNG.png | icon | image/png | 7.6 KB | 512×512 | 74 | 49.9 | 2.9 | dark | square | own-site-declared | 2026-09-10 |
| mybeauty-boutique | retailer | 200 | https://mybeauty.boutique/cdn/shop/files/RGB_Logo_Design_-_MBB_V001_-18.png?crop=center&height=32&v=1717418341&width=32 | icon | image/png | 2.1 KB | 32×32 | 0 | 10.8 | 85.9 | own | square | own-site-declared | 2026-09-10 |
| mybeauty-boutique | retailer | 200 | https://mybeauty.boutique/cdn/shop/files/RGB_Logo_Design_-_MBB_V001_-06.png?v=1717418340&width=500 | Organization.logo | image/png | 15.0 KB | 500×209 | 90.2 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| the-fragrance-counter | retailer | 200 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| scentstore | retailer | 200 | https://www.scentstore.com/wp-content/uploads/2026/04/Scentstore-Favicon-1.svg | icon | image/svg+xml | 2.1 KB | 400×400 | 0 | 83.8 | 16 | own | square | own-site-declared | 2026-09-10 |
| scentstore | retailer | 200 | https://www.scentstore.com/wp-content/uploads/2026/04/ScentStore-236x48px-01.svg | Organization.logo | image/svg+xml | 2.9 KB | 400×81 | 92.3 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| glorious-beauty | retailer | 200 | https://gloriousbeauty.co.uk/cdn/shop/files/favicon_96x.png?v=1627560282 | shortcut icon | image/png | 3.2 KB | 96×96 | 0 | 84.8 | 14.1 | own | square | own-site-declared | 2026-09-10 |
| french-avenue | retailer | 200 | https://uk.shopfrenchavenue.com/cdn/shop/files/favicon.png?crop=center&height=32&v=1771170072&width=32 | icon | image/png | 2.2 KB | 32×32 | 83.4 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| french-avenue | retailer | 200 | https://uk.shopfrenchavenue.com/cdn/shop/files/logo_1.png?v=1774418505&width=500 | Organization.logo | image/png | 40.4 KB | 500×133 | 88.5 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| armaf | retailer | 200 | https://armaf.uk/cdn/shop/files/SMALL_BLACK_LOGO.jpg?crop=center&height=48&v=1769440055&width=48 | icon | image/jpeg | 1.9 KB | 48×48 | 0 | 29.3 | 54.3 | own | square | own-site-declared | 2026-09-10 |
| armaf | retailer | 200 | https://armaf.uk/cdn/shop/files/SMALL_BLACK_LOGO.jpg?crop=center&height=180&v=1769440055&width=180 | apple-touch-icon | image/jpeg | 2.2 KB | 100×100 | 0 | 36.8 | 58.2 | own | square | own-site-declared | 2026-09-10 |
| armaf | retailer | 200 | https://armaf.uk/cdn/shop/files/1._ARMAF_LOGO_-_BLACK_PNG.png?v=1769167096&width=787 | Organization.logo | image/png | 388.1 KB | 787×787 | 43 | 70.5 | 25.8 | dark | square | own-site-declared | 2026-09-10 |
| al-haramain | retailer | 200 | https://cdn.shopify.com/s/files/1/0256/2683/7043/files/Al_Haramain_Favicon.png?v=1783002517 | shortcut icon | image/png | 62.7 KB | 192×192 | 0 | 57.8 | 33.9 | own | square | own-site-declared | 2026-09-10 |
| al-haramain | retailer | 200 | https://alharamainperfumes.co.uk/cdn/shop/files/AHP_Favicon.png?crop=center&height=32&v=1783426302&width=32 | icon | image/png | 1.9 KB | 32×32 | 0 | 0 | 98.5 | own | square | own-site-declared | 2026-09-10 |
| al-haramain | retailer | 200 | https://alharamainperfumes.co.uk/cdn/shop/files/55_Years_Flat_Hex_Maroon_60x60mm.png?v=1764757245&width=709 | Organization.logo | image/png | 40.5 KB | 709×709 | 86.3 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| riiffs | retailer | 202 | data:; | icon | — | — | — | — | — | — | — | — | — | 2026-09-10 | <!-- TypeError: fetch failed (Error: failed to fetch the data URL) -->
| ibraq | retailer | 200 | https://ibraquk.com/cdn/shop/files/Favicon-02.png?v=1771535932&width=96 | shortcut icon | image/png | 6.0 KB | 96×96 | 0 | 0 | 98.7 | own | square | own-site-declared | 2026-09-10 |
| ibraq | retailer | 200 | https://ibraquk.com/cdn/shop/files/Favicon-02.png?v=1771535932&width=180 | apple-touch-icon | image/png | 13.9 KB | 180×180 | 0 | 0 | 99.9 | own | square | own-site-declared | 2026-09-10 |
| ibraq | retailer | 200 | https://ibraquk.com/cdn/shop/files/LOGO_Square-01-01.png?v=1771722028&width=834 | Organization.logo | image/png | 37.3 KB | 834×834 | 0 | 0 | 100 | own | square | own-site-declared | 2026-09-10 |
| bellavita-luxury | retailer | 200 | https://bellavitaluxury.uk/cdn/shop/files/Favicon_logo_1.png?crop=center&height=32&v=1748953373&width=32 | icon | image/png | 1.9 KB | 32×32 | 21.6 | 0.7 | 94.8 | light | square | own-site-declared | 2026-09-10 |
| oud-arabian | retailer | 200 | https://oudarabian.co.uk/cdn/shop/files/oud_arabian_logo.png?v=1725532637&width=32 | shortcut icon | image/png | 1.1 KB | 32×10 | 0 | 0 | 100 | own | wordmark | own-site-declared | 2026-09-10 |
| manchester-ouds | retailer | 200 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| emirates-oud | retailer | 200 | https://emiratesoud.co.uk/cdn/shop/files/for_fav_copy.jpg?crop=center&height=32&v=1770533878&width=32 | icon | image/jpeg | 1.8 KB | 32×32 | 0 | 79.3 | 13.8 | own | square | own-site-declared | 2026-09-10 |
| emirates-oud | retailer | 200 | https://emiratesoud.co.uk/cdn/shop/files/Emirates_Oud_Logo_ulcom.png?v=1770533272&width=500 | Organization.logo | image/png | 13.9 KB | 500×64 | 61.6 | 10.4 | 84.6 | light | wordmark | own-site-declared | 2026-09-10 |
| perfumeo | retailer | 200 | https://perfumeo.co.uk/wp-content/uploads/2026/06/PERFUMEO-Logo-150x150.jpg | icon | image/jpeg | 3.9 KB | 150×150 | 0 | 93.6 | 1.7 | own | square | own-site-declared | 2026-09-10 |
| perfumeo | retailer | 200 | https://perfumeo.co.uk/wp-content/uploads/2026/06/PERFUMEO-Logo-300x300.jpg | icon | image/jpeg | 8.6 KB | 300×300 | 0 | 92.9 | 3.1 | own | square | own-site-declared | 2026-09-10 |
| perfumeo | retailer | 200 | https://perfumeo.co.uk/wp-content/uploads/2026/07/New-Perfumeo-Logo.png | Organization.logo | image/png | 847.0 KB | 1254×1254 | 0 | 87.7 | 8.4 | own | square | own-site-declared | 2026-09-10 |
| the-beauty-store-uk | retailer | 200 | https://us.thebeautystore.com/cdn/shop/files/the_beauty_store_favicon_8bf2c36d-1ab6-425e-94fb-27043ba1a162.png?crop=center&height=32&v=1749489828&width=32 | icon | image/png | 1.7 KB | 32×32 | 0 | 7.7 | 91.5 | own | square | own-site-declared | 2026-09-10 |
| the-beauty-store-uk | retailer | 200 | https://us.thebeautystore.com/cdn/shop/files/1_-THE_BEAUTY_STORE_LOGO.svg?v=1749488495&width=500 | Organization.logo | image/svg+xml | 5.0 KB | 400×30 | 65.2 | 50.1 | 49.9 | dark | wordmark | own-site-declared | 2026-09-10 |
| zimaya | retailer | 200 | https://uk.zimayaperfumes.com/cdn/shop/files/zimaya-logo-favicon_351a4b4c-3e5e-4d38-ab08-fc37d3da1285.png?v=1762863554&width=96 | shortcut icon | image/png | 0.5 KB | 27×27 | 82 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| zimaya | retailer | 200 | https://uk.zimayaperfumes.com/cdn/shop/files/zimaya-logo-favicon_351a4b4c-3e5e-4d38-ab08-fc37d3da1285.png?v=1762863554&width=180 | apple-touch-icon | image/png | 0.5 KB | 27×27 | 82 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| kayali | retailer | 200 | https://uk.kayali.com/cdn/shop/files/favicon_v3_Kayali_logo_64x64.png?v=1771838288 | shortcut icon | image/png | 2.7 KB | 64×64 | 0 | 0.1 | 96.6 | own | square | own-site-declared | 2026-09-10 |
| kayali | retailer | 200 | https://uk.kayali.com/cdn/shop/files/Metallic-Logo.png?v=3865012787552243044 | Organization.logo | image/png | 6.5 KB | 108×99 | 89.5 | 0 | 89 | light | square | own-site-declared | 2026-09-10 |
| zara | retailer | 200 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| escentric-molecules | retailer | 200 | https://scdn.speedsize.com/54343ecb-8aeb-4686-af82-3f829e50d808/www.escentric.com/cdn/shop/files/Escentric_Molecules_Favicon.svg?crop=center&height=32&v=1739390404&width=32 | icon | image/svg+xml | 0.8 KB | 400×400 | 0 | 84.4 | 14.9 | own | square | own-site-declared | 2026-09-10 |
| escentric-molecules | retailer | 200 | https://www.escentric.com/cdn/shop/files/Escentric_Molecules_Logo.svg?v=1739390439&width=500 | Organization.logo | image/svg+xml | 4.0 KB | 400×33 | 64.6 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| perfume-click | retailer | 200 | https://www.bgstatic.net/pc/img/favicon.ico | shortcut icon | image/vnd.microsoft.icon | 21.9 KB | 64×64 | 71.9 | 0 | 2.9 | light | square | own-site-declared | 2026-09-10 |
| fragrancehub | retailer | 200 | https://www.fragrancehub.co.uk/cdn/shop/files/IMG_8367.jpg?crop=center&height=32&v=1722879081&width=32 | icon | image/jpeg | 1.2 KB | 32×32 | 0 | 88.3 | 9.1 | own | square | own-site-declared | 2026-09-10 |
| fragrancehub | retailer | 200 | https://www.fragrancehub.co.uk/cdn/shop/files/fragrance_hub_logo_2.png?v=1766139728&width=500 | Organization.logo | image/png | 12.7 KB | 500×100 | 75.3 | 0 | 100 | light | wordmark | own-site-declared | 2026-09-10 |
| avon | retailer | 200 | https://avon.uk.com/cdn/shop/files/FAVICON_Avon_RGB_Logo_ONLY_FOR_BROWSER_32x32.jpg?v=1690898778 | shortcut icon | image/jpeg | 1.7 KB | 32×32 | 0 | 0 | 25.1 | own | square | own-site-declared | 2026-09-10 |
| avon | retailer | 200 | https://avon.uk.com/cdn/shop/t/511/assets/logo-desktop-new.png?v=86210 | Organization.logo | text/html; charset=utf-8 | 2.7 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| morrisons | retailer | 200 | https://groceries.morrisons.com/favicon.ico | icon | image/vnd.microsoft.icon | 1.4 KB | 32×32 | 0 | 0.7 | 96.2 | own | square | own-site-declared | 2026-09-10 |
| morrisons | retailer | 200 | https://images.morrisons.com/logo/osp-logo.svg | Organization.logo | image/svg+xml | 5.9 KB | 400×178 | 78 | 0 | 25.5 | light | wordmark | own-site-declared | 2026-09-10 |
| bm-stores | retailer | 200 | https://www.bmstores.co.uk/wsimages/bm-navbar-logo.png | Organization.logo | image/png | 12.2 KB | 180×180 | 21.5 | 44.3 | 47.2 | light | square | own-site-declared | 2026-09-10 |
| home-bargains | retailer | 200 | https://home.bargains/favicon.ico | icon | image/x-icon | 11.7 KB | 48×48 | 0 | 0 | 51.2 | own | square | own-site-declared | 2026-09-10 |
| home-bargains | retailer | 200 | https://home.bargains/icon.svg | icon | image/svg+xml | 1.4 KB | 400×400 | 0 | 0 | 42.4 | own | square | own-site-declared | 2026-09-10 |
| home-bargains | retailer | 200 | https://home.bargains/apple-touch-icon.png | apple-touch-icon | image/png | 10.2 KB | 180×180 | 0 | 0.1 | 49.6 | own | square | own-site-declared | 2026-09-10 |
| Lattafa | brand | 200 | https://www.lattafa-usa.com/cdn/shop/files/favicon.png?crop=center&height=32&v=1746472383&width=32 | icon | image/png | 2.1 KB | 25×32 | 72.9 | 0 | 100 | light | wordmark | own-site-declared | 2026-09-10 |
| Lattafa | brand | 200 | https://www.lattafa-usa.com/cdn/shop/files/Logo_07f1bbc2-d14d-487f-b177-17d76faa8469.png?v=1749241065&width=500 | Organization.logo | image/png | 29.9 KB | 500×194 | 0 | 0 | 100 | own | wordmark | own-site-declared | 2026-09-10 |
| Al Haramain | brand | 200 | https://cdn.shopify.com/s/files/1/0256/2683/7043/files/Al_Haramain_Favicon.png?v=1783002517 | shortcut icon | image/png | 62.7 KB | 192×192 | 0 | 57.8 | 33.9 | own | square | own-site-declared | 2026-09-10 |
| Al Haramain | brand | 200 | https://alharamainperfumes.co.uk/cdn/shop/files/AHP_Favicon.png?crop=center&height=32&v=1783426302&width=32 | icon | image/png | 1.9 KB | 32×32 | 0 | 0 | 98.5 | own | square | own-site-declared | 2026-09-10 |
| Al Haramain | brand | 200 | https://alharamainperfumes.co.uk/cdn/shop/files/55_Years_Flat_Hex_Maroon_60x60mm.png?v=1764757245&width=709 | Organization.logo | image/png | 40.5 KB | 709×709 | 86.3 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Fragrance World | brand | 200 | https://fragranceworld.ae/wp-content/uploads/2025/10/cropped-Screenshot_2025-10-25_at_7.20.53_AM-removebg-preview-32x32.png | icon | image/png | 1.0 KB | 32×32 | 82.1 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Fragrance World | brand | 200 | https://fragranceworld.ae/wp-content/uploads/2025/10/cropped-Screenshot_2025-10-25_at_7.20.53_AM-removebg-preview-192x192.png | icon | image/png | 12.6 KB | 192×192 | 80 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Fragrance World | brand | 200 | https://fragranceworld.ae/wp-content/uploads/2025/10/cropped-Screenshot_2025-10-25_at_7.20.53_AM-removebg-preview-180x180.png | apple-touch-icon | image/png | 11.3 KB | 180×180 | 80.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Armaf | brand | 200 | https://armaf.uk/cdn/shop/files/SMALL_BLACK_LOGO.jpg?crop=center&height=48&v=1769440055&width=48 | icon | image/jpeg | 1.9 KB | 48×48 | 0 | 29.3 | 54.3 | own | square | own-site-declared | 2026-09-10 |
| Armaf | brand | 200 | https://armaf.uk/cdn/shop/files/SMALL_BLACK_LOGO.jpg?crop=center&height=180&v=1769440055&width=180 | apple-touch-icon | image/jpeg | 2.2 KB | 100×100 | 0 | 36.8 | 58.2 | own | square | own-site-declared | 2026-09-10 |
| Armaf | brand | 200 | https://armaf.uk/cdn/shop/files/1._ARMAF_LOGO_-_BLACK_PNG.png?v=1769167096&width=787 | Organization.logo | image/png | 388.1 KB | 787×787 | 43 | 70.5 | 25.8 | dark | square | own-site-declared | 2026-09-10 |
| Calvin Klein | brand | 503 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Rabanne | brand | 200 | https://www.rabanne.com/favicon.ico | icon | image/vnd.microsoft.icon | 37.2 KB | 96×96 | 53.9 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Rabanne | brand | 200 | https://www.rabanne.com/favicon-32x32.png | icon | text/html | 9.8 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- unreadable: UnidentifiedImageError: cannot identify image file '/tmp/logo-probe-9fCuos/raster-ygcirkcpmir' -->
| Rabanne | brand | 200 | https://www.rabanne.com/favicon-192x192.png | icon | text/html | 9.8 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- unreadable: UnidentifiedImageError: cannot identify image file '/tmp/logo-probe-9fCuos/raster-81hw5ijdee3' -->
| Rabanne | brand | 200 | https://www.rabanne.com/apple-touch-icon.png | apple-touch-icon | text/html | 9.8 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- unreadable: UnidentifiedImageError: cannot identify image file '/tmp/logo-probe-9fCuos/raster-k8tbzd1vr6' -->
| French Avenue | brand | 200 | https://uk.shopfrenchavenue.com/cdn/shop/files/favicon.png?crop=center&height=32&v=1771170072&width=32 | icon | image/png | 2.2 KB | 32×32 | 83.4 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| French Avenue | brand | 200 | https://uk.shopfrenchavenue.com/cdn/shop/files/logo_1.png?v=1774418505&width=500 | Organization.logo | image/png | 40.4 KB | 500×133 | 88.5 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Bujairami | brand | 200 | https://bujairami.ae/cdn/shop/files/WhatsApp_Image_2024-09-29_at_3.45.43_PM.jpg?crop=center&height=32&v=1727614213&width=32 | shortcut icon | image/jpeg | 1.1 KB | 32×32 | 0 | 0 | 97.6 | own | square | own-site-declared | 2026-09-10 |
| Bujairami | brand | 200 | https://bujairami.ae/cdn/shop/files/WhatsApp_Image_2024-09-29_at_3.45.43_PM.jpg?crop=center&height=152&v=1727614213&width=152 | apple-touch-icon-precomposed | image/jpeg | 2.3 KB | 152×152 | 0 | 1.8 | 97.6 | own | square | own-site-declared | 2026-09-10 |
| Dolce & Gabbana | brand | 200 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Maison Alhambra | brand | 200 | https://maisonalhambra.co/wp-content/uploads/2025/11/cropped-Maison_Alhambra-removebg-preview-32x32.webp | icon | image/webp | 0.4 KB | 32×32 | 93 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Maison Alhambra | brand | 200 | https://maisonalhambra.co/wp-content/uploads/2025/11/cropped-Maison_Alhambra-removebg-preview-192x192.webp | icon | image/webp | 4.2 KB | 192×192 | 91.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Maison Alhambra | brand | 200 | https://maisonalhambra.co/wp-content/uploads/2025/11/cropped-Maison_Alhambra-removebg-preview-180x180.webp | apple-touch-icon | image/webp | 3.8 KB | 180×180 | 91.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Maison Alhambra | brand | 200 | https://maisonalhambra.co/wp-content/uploads/2025/10/Untitled_design__2_-removebg-preview.png | Organization.logo | image/png | 82.8 KB | 500×500 | 88.8 | 0 | 100 | light | square | own-site-declared | 2026-09-10 |
| Giorgio Armani | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Hugo Boss | brand | 200 | https://www.hugoboss.com/on/demandware.static/Sites-UK-Site/-/default/dwe5b84fa4/images/apple-touch-icon.png | apple-touch-icon | image/png | 6.6 KB | 180×180 | 0 | 17.9 | 81.2 | own | square | own-site-declared | 2026-09-10 |
| Hugo Boss | brand | 200 | https://www.hugoboss.com/on/demandware.static/Sites-UK-Site/-/default/dw576d984e/images/favicon.ico | shortcut icon | image/x-icon | 15.0 KB | 48×48 | 0 | 71.6 | 24.6 | own | square | own-site-declared | 2026-09-10 |
| Carolina Herrera | brand | 200 | https://www.carolinaherrera.com/favicon.ico | shortcut icon | image/x-icon | 6.3 KB | 64×64 | 0 | 0.8 | 14 | own | square | own-site-declared | 2026-09-10 |
| Carolina Herrera | brand | 200 | https://www.carolinaherrera.com/favicon.ico?favicon.0x42iiw9p4h47.ico | icon | image/x-icon | 6.3 KB | 64×64 | 0 | 0.8 | 14 | own | square | own-site-declared | 2026-09-10 |
| Carolina Herrera | brand | 200 | https://www.carolinaherrera.com/assets/icons/icon_32x32.png | icon | image/png | 1.2 KB | 32×32 | 0 | 0 | 12.6 | own | square | own-site-declared | 2026-09-10 |
| Carolina Herrera | brand | 200 | https://www.carolinaherrera.com/assets/icons/icon_48x48.png | icon | image/png | 1.9 KB | 48×48 | 0 | 0 | 11.5 | own | square | own-site-declared | 2026-09-10 |
| Carolina Herrera | brand | 200 | https://www.carolinaherrera.com/assets/icons/icon_128x128.png | icon | image/png | 7.3 KB | 128×128 | 0 | 1.8 | 13 | own | square | own-site-declared | 2026-09-10 |
| Carolina Herrera | brand | 200 | https://www.carolinaherrera.com/assets/icons/icon_144x144.png | icon | image/png | 7.4 KB | 144×144 | 0 | 1.2 | 12.4 | own | square | own-site-declared | 2026-09-10 |
| Givenchy | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Yves Saint Laurent | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Versace | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Ard Al Zaafaran | brand | 200 | https://ardalzaafaranshop.com/cdn/shop/files/Ard_Al_Zaafaran_Logo_-_Edited_48ebb48f-0099-4e61-9a1e-d102fa94fa5d.png?crop=center&height=32&v=1727696186&width=32 | shortcut icon | image/png | 2.2 KB | 32×32 | 86.3 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Jean Paul Gaultier | brand | 200 | https://www.jeanpaulgaultier.com/favicon.ico | icon | image/vnd.microsoft.icon | 9.4 KB | 48×48 | 1.7 | 26.9 | 69.9 | own | square | own-site-declared | 2026-09-10 |
| Jean Paul Gaultier | brand | 200 | https://www.jeanpaulgaultier.com/icons/icon-16x16.png | icon | image/png | 0.3 KB | 16×16 | 1.6 | 24.6 | 61.5 | own | square | own-site-declared | 2026-09-10 |
| Jean Paul Gaultier | brand | 200 | https://www.jeanpaulgaultier.com/icons/icon-32x32.png | icon | image/png | 0.5 KB | 32×32 | 1.8 | 26.8 | 69 | own | square | own-site-declared | 2026-09-10 |
| Jean Paul Gaultier | brand | 200 | https://www.jeanpaulgaultier.com/icons/icon-152x152.png | apple-touch-icon | image/png | — | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 200 -->
| Jean Paul Gaultier | brand | 200 | https://www.jeanpaulgaultier.com/icons/icon-167x167.png | apple-touch-icon | image/png | — | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 200 -->
| Jean Paul Gaultier | brand | 200 | https://www.jeanpaulgaultier.com/icons/icon-180x180.png | apple-touch-icon | image/png | — | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 200 -->
| Jean Paul Gaultier | brand | 200 | https://www.jeanpaulgaultier.com/icons/icon.svg | mask-icon | image/svg+xml | — | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 200 -->
| Tom Ford | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Khadlaj | brand | 200 | https://www.khadlaj-perfumes.co.uk/cdn/shop/files/favicon-32x32_32x.png?v=1783588291 | shortcut icon | image/png | 1.6 KB | 32×32 | 95.3 | 95.8 | 4.2 | dark | square | own-site-declared | 2026-09-10 |
| Khadlaj | brand | 200 | https://www.khadlaj-perfumes.co.uk/cdn/shop/files/favicon-32x32_152x.png?v=1783588291 | apple-touch-icon-precomposed | image/png | 1.6 KB | 32×32 | 95.3 | 95.8 | 4.2 | dark | square | own-site-declared | 2026-09-10 |
| Khadlaj | brand | 200 | https://www.khadlaj-perfumes.co.uk/cdn/shop/files/Khadlaj_logo_160x_2x_160x_2x_58d4d523-785f-4796-b656-f59fe7c51c7e_small.avif?v=1762587505 | Organization.logo | image/png | 7.4 KB | 100×84 | 93 | 96.8 | 3.2 | dark | wordmark | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/favicon.ico | shortcut icon | image/x-icon | 15.0 KB | 48×48 | 76.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/16x16.png | icon | image/png | 0.4 KB | 16×16 | 74.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/32x32.png | icon | image/png | 0.9 KB | 32×32 | 75.9 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/48x48.png | icon | image/png | 1.6 KB | 48×48 | 76.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/57x57.png | apple-touch-icon | image/png | 2.0 KB | 58×58 | 77.6 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/60x60.png | apple-touch-icon | image/png | 2.1 KB | 60×60 | 76.3 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/72x72.png | apple-touch-icon | image/png | 2.6 KB | 72×72 | 76.9 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/114x114.png | apple-touch-icon | image/png | 4.6 KB | 114×114 | 77 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/120x120.png | apple-touch-icon | image/png | 4.9 KB | 120×120 | 77 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/144x144.png | apple-touch-icon | image/png | 6.1 KB | 144×144 | 77 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/152x152.png | apple-touch-icon | image/png | 6.4 KB | 152×152 | 77 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/167x167.png | apple-touch-icon | image/png | 7.3 KB | 168×168 | 77.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/180x180.png | apple-touch-icon | image/png | 7.7 KB | 180×180 | 76.9 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/512x512.png | apple-touch-icon | image/png | 25.7 KB | 512×512 | 77.1 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://uk.burberry.com/nrws/common/favicon/1024x1024.png | apple-touch-icon | image/png | 57.3 KB | 1024×1024 | 77.1 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Burberry | brand | 200 | https://assets.burberry.com/is/image/Burberryltd/4CF441C3-6773-4977-81E1-3DE90421FA7A | Organization.logo | image/jpeg | 23.1 KB | 400×400 | 0 | 11 | 86.3 | own | square | own-site-declared | 2026-09-10 |
| Lancôme | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Police | brand | ERR | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 | <!-- TypeError: fetch failed (Error: getaddrinfo ENOTFOUND uk.policelifestyle.com) -->
| Louis Cardin | brand | 202 | data:; | icon | — | — | — | — | — | — | — | — | — | 2026-09-10 | <!-- TypeError: fetch failed (Error: failed to fetch the data URL) -->
| Paris Corner | brand | 200 | https://pariscorner.ae/wp-content/uploads/2024/12/cropped-Paris-logo-512x512-white-BG.png | icon | image/png | 19.5 KB | 512×512 | 0.7 | 5.9 | 93.3 | own | square | own-site-declared | 2026-09-10 |
| Paris Corner | brand | 200 | https://pariscorner.ae/wp-content/uploads/2024/12/cropped-Paris-logo-512x512-white-BG-32x32.png | icon | image/png | 0.4 KB | 32×32 | 0 | 1.1 | 95.3 | own | square | own-site-declared | 2026-09-10 |
| Paris Corner | brand | 200 | https://pariscorner.ae/wp-content/uploads/2024/12/cropped-Paris-logo-512x512-white-BG-192x192.png | icon | image/png | 7.0 KB | 192×192 | 0 | 5.5 | 93.4 | own | square | own-site-declared | 2026-09-10 |
| Paris Corner | brand | 200 | https://pariscorner.ae/wp-content/uploads/2024/12/cropped-Paris-logo-512x512-white-BG-180x180.png | apple-touch-icon | image/png | 6.4 KB | 180×180 | 0 | 5.4 | 93.3 | own | square | own-site-declared | 2026-09-10 |
| Gucci | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Zimaya | brand | 200 | https://uk.zimayaperfumes.com/cdn/shop/files/zimaya-logo-favicon_351a4b4c-3e5e-4d38-ab08-fc37d3da1285.png?v=1762863554&width=96 | shortcut icon | image/png | 0.5 KB | 27×27 | 82 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Zimaya | brand | 200 | https://uk.zimayaperfumes.com/cdn/shop/files/zimaya-logo-favicon_351a4b4c-3e5e-4d38-ab08-fc37d3da1285.png?v=1762863554&width=180 | apple-touch-icon | image/png | 0.5 KB | 27×27 | 82 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Jimmy Choo | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Hermès | brand | 200 | https://www.hermes.com/uk/en/assets/images/favicon/apple-touch-icon-iphone-3x.png | apple-touch-icon | image/png | 2.5 KB | 180×180 | 0.2 | 10.2 | 89.5 | own | square | own-site-declared | 2026-09-10 |
| Hermès | brand | 200 | https://www.hermes.com/uk/en/assets/images/favicon/apple-touch-icon-iphone-2x.png | apple-touch-icon | image/png | 1.7 KB | 120×120 | 0.2 | 10 | 89.5 | own | square | own-site-declared | 2026-09-10 |
| Hermès | brand | 200 | https://www.hermes.com/uk/en/assets/images/favicon/apple-touch-icon-ipad.png | apple-touch-icon | image/png | 2.1 KB | 152×152 | 0.2 | 9.9 | 89.3 | own | square | own-site-declared | 2026-09-10 |
| Hermès | brand | 200 | https://www.hermes.com/uk/en/assets/images/favicon/apple-touch-icon-ipad-pro.png | apple-touch-icon | image/png | 2.5 KB | 167×167 | 0.2 | 9.7 | 89.2 | own | square | own-site-declared | 2026-09-10 |
| Hermès | brand | 200 | https://www.hermes.com/uk/en/assets/images/favicon/favicon-48x48.png | icon | image/png | 0.3 KB | 48×48 | 0 | 31.7 | 67 | own | square | own-site-declared | 2026-09-10 |
| Hermès | brand | 200 | https://www.hermes.com/uk/en/assets/images/favicon/favicon-96x96.png | icon | image/png | 0.6 KB | 96×96 | 0 | 32.4 | 64.5 | own | square | own-site-declared | 2026-09-10 |
| Hermès | brand | 200 | https://www.hermes.com/uk/en/assets/images/favicon/favicon-144x144.png | icon | image/png | 0.8 KB | 144×144 | 0.2 | 10.4 | 89.3 | own | square | own-site-declared | 2026-09-10 |
| Hermès | brand | 200 | https://www.hermes.com/uk/en/assets.hermes.com/is/image/hermesedito/hermes-logo | Organization.logo | text/html;charset=utf-8 | 1.1 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 403 -->
| Prada | brand | 200 | https://www.prada.com/favicon.ico | icon | image/vnd.microsoft.icon | 1.8 KB | 150×150 | 78.4 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Orchid | brand | 200 | https://orchidperfumesfactory.com/wp-content/uploads/2026/09/cropped-ORCHID-LOGO3-32x32.jpg | icon | image/jpeg | 0.8 KB | 32×32 | 0 | 16 | 78.6 | own | square | own-site-declared | 2026-09-10 |
| Orchid | brand | 200 | https://orchidperfumesfactory.com/wp-content/uploads/2026/09/cropped-ORCHID-LOGO3-192x192.jpg | icon | image/jpeg | 3.3 KB | 192×192 | 0 | 16.8 | 78.7 | own | square | own-site-declared | 2026-09-10 |
| Orchid | brand | 200 | https://orchidperfumesfactory.com/wp-content/uploads/2026/09/cropped-ORCHID-LOGO3-180x180.jpg | apple-touch-icon | image/jpeg | 3.1 KB | 180×180 | 0 | 16.8 | 78.7 | own | square | own-site-declared | 2026-09-10 |
| Afnan | brand | 200 | https://uk.afnan.com/cdn/shop/files/Screenshot_2024-09-27_at_12.30.34_AM.png?v=1728583135&width=96 | shortcut icon | image/png | 5.8 KB | 96×84 | 0 | 89.1 | 8.7 | own | square | own-site-declared | 2026-09-10 |
| Afnan | brand | 200 | https://uk.afnan.com/cdn/shop/files/Screenshot_2024-09-27_at_12.30.34_AM.png?v=1728583135&width=180 | apple-touch-icon | image/png | 17.4 KB | 180×158 | 0 | 89.2 | 8.7 | own | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/apple-touch-icon-57x57.png?v=8273319907400400842 | apple-touch-icon | image/png | 1.0 KB | 57×57 | 0 | 0 | 75.2 | own | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/apple-touch-icon-60x60.png?v=3544774143524684291 | apple-touch-icon | image/png | 1.2 KB | 60×60 | 0 | 0 | 70.1 | own | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/apple-touch-icon-72x72.png?v=591780372004619934 | apple-touch-icon | image/png | 1.4 KB | 72×72 | 0 | 0 | 72.1 | own | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/apple-touch-icon-76x76.png?v=8392278329758961061 | apple-touch-icon | image/png | 1.4 KB | 76×76 | 0 | 0 | 70 | own | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/apple-touch-icon-114x114.png?v=344466590481879679 | apple-touch-icon | image/png | 1.4 KB | 114×114 | 0 | 0 | 68.9 | own | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/apple-touch-icon-120x120.png?v=2989559328051521729 | apple-touch-icon | image/png | 1.5 KB | 120×120 | 0 | 0 | 70.5 | own | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/apple-touch-icon-144x144.png?v=10166958450711458842 | apple-touch-icon | image/png | 1.5 KB | 144×144 | 0 | 0 | 69.8 | own | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/apple-touch-icon-152x152.png?v=16716669678188931204 | apple-touch-icon | image/png | 1.7 KB | 152×152 | 0 | 0 | 69.1 | own | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/apple-touch-icon-180x180.png?v=5175609977625512279 | apple-touch-icon | image/png | 1.6 KB | 180×180 | 0 | 0 | 70.1 | own | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/favicon-32x32.png?v=7363047385668052714 | icon | image/png | 1.2 KB | 32×32 | 50 | 0 | 25.4 | light | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/android-chrome-192x192.png?v=15845933428358370388 | icon | image/png | 1.8 KB | 192×192 | 47.7 | 0 | 21.5 | light | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/favicon-96x96.png?v=10879278611549660438 | icon | image/png | 1.6 KB | 96×96 | 47.9 | 0 | 24.2 | light | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/favicon-16x16.png?v=4074677933917036638 | icon | image/png | 0.8 KB | 16×16 | 50 | 0 | 3.1 | light | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/safari-pinned-tab.svg?v=18107465327723548299 | mask-icon | image/svg+xml | 1.3 KB | 400×400 | 58.8 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Elizabeth Arden | brand | 200 | https://www.elizabetharden.co.uk/cdn/shop/files/favicon.jpg | Organization.logo | text/html; charset=utf-8 | 2.7 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Lacoste | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Issey Miyake | brand | 200 | https://uk.isseymiyake.com/cdn/shop/t/106/assets/exp-img_webclip.png?v=86862605451703021151775124214 | apple-touch-icon | image/png | 1.8 KB | 144×144 | 0 | 2.1 | 97.2 | own | square | own-site-declared | 2026-09-10 |
| Mykonos | brand | 200 | https://officialmykonos.com/cdn/shop/files/7._Foto_Produk_Depan_Logo_1.png?crop=center&height=32&v=1780452314&width=32 | icon | image/png | 1.3 KB | 32×32 | 0 | 98.7 | 0 | own | square | own-site-declared | 2026-09-10 |
| DKNY | brand | 200 | https://www.dkny.com/cdn/shop/files/DKNYlogo_stack.png?v=1706650251&width=32 | shortcut icon | image/webp | 1.3 KB | 32×32 | 38.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| DKNY | brand | 200 | https://www.dkny.com/cdn/shop/files/DKNYlogo_stack.png?v=1706650251&width=180 | apple-touch-icon | image/png | 2.8 KB | 160×160 | 39.5 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Brandy Designs | brand | 200 | https://brandyperfumes.com/wp-content/uploads/2025/03/cropped-Brandy-Logo-Icon_page-0001-32x32.jpg | icon | image/jpeg | 0.4 KB | 32×32 | 0 | 0 | 100 | own | square | own-site-declared | 2026-09-10 |
| Brandy Designs | brand | 200 | https://brandyperfumes.com/wp-content/uploads/2025/03/cropped-Brandy-Logo-Icon_page-0001-192x192.jpg | icon | image/jpeg | 2.7 KB | 192×192 | 0 | 0 | 100 | own | square | own-site-declared | 2026-09-10 |
| Brandy Designs | brand | 200 | https://brandyperfumes.com/wp-content/uploads/2025/03/cropped-Brandy-Logo-Icon_page-0001-180x180.jpg | apple-touch-icon | image/jpeg | 2.5 KB | 180×180 | 0 | 0 | 100 | own | square | own-site-declared | 2026-09-10 |
| Marc Jacobs | brand | 503 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Narciso Rodriguez | brand | 200 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Montblanc | brand | 200 | https://www.montblanc.com/on/demandware.static/Sites-MontblancROW-Site/-/default/dwec615165/images/favicons/favicon.svg | icon | image/svg+xml | 0.9 KB | 400×400 | 60.6 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Kenzo | brand | 200 | https://www.kenzo.com/on/demandware.static/Sites-KENZO_WW-Site/-/default/dw72219e15/images/apple-touch-icon.png | apple-touch-icon | image/png | 6.2 KB | 180×180 | 0 | 0.1 | 21.3 | own | square | own-site-declared | 2026-09-10 |
| Kenzo | brand | 200 | https://www.kenzo.com/on/demandware.static/Sites-KENZO_WW-Site/-/default/dw3c0f2650/images/favicon.ico | shortcut icon | image/x-icon | 0.3 KB | 16×16 | 0 | 0 | 17.2 | own | square | own-site-declared | 2026-09-10 |
| Kenzo | brand | 200 | https://www.kenzo.com/on/demandware.static/-/Library-Sites-Kenzo-SharedLibrary/default/dw059b9a09/PAID_KENZO-LOGO_240x240.png | Organization.logo | image/png | 6.6 KB | 240×240 | 49.2 | 0 | 47.2 | light | square | own-site-declared | 2026-09-10 |
| Guerlain | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Ralph Lauren | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Mugler | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Creed | brand | 200 | https://www.creedfragrances.co.uk/cdn/shop/files/creed-favicon.png?crop=center&height=32&v=1695746597&width=32 | icon | image/png | 1.6 KB | 32×32 | 96.5 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Rayhaan | brand | 200 | https://rayhaanperfumes.com/cdn/shop/t/14/assets/favicon.png?v=1623148847918320321779449201 | shortcut icon | image/jpeg | 94.3 KB | 4000×2250 | 0 | 6.6 | 92.7 | own | wordmark | own-site-declared | 2026-09-10 |
| Rayhaan | brand | 200 | https://rayhaanperfumes.com/cdn/shop/t/14/assets/icon-for-mobile.png?v=1623148847918320321779449201 | apple-touch-icon-precomposed | image/jpeg | 94.3 KB | 4000×2250 | 0 | 6.6 | 92.7 | own | wordmark | own-site-declared | 2026-09-10 |
| Rayhaan | brand | 200 | https://rayhaanperfumes.com/cdn/shop/t/14/assets/icon-for-mobile_57x57.png?v=1623148847918320321779449201 | apple-touch-icon-precomposed | image/jpeg | 1.5 KB | 57×32 | 0 | 5.2 | 92.7 | own | wordmark | own-site-declared | 2026-09-10 |
| Rayhaan | brand | 200 | https://rayhaanperfumes.com/cdn/shop/t/14/assets/icon-for-mobile_60x60.png?v=1623148847918320321779449201 | apple-touch-icon-precomposed | image/jpeg | 1.6 KB | 60×34 | 0 | 4.7 | 93.2 | own | wordmark | own-site-declared | 2026-09-10 |
| Rayhaan | brand | 200 | https://rayhaanperfumes.com/cdn/shop/t/14/assets/icon-for-mobile_72x72.png?v=1623148847918320321779449201 | apple-touch-icon-precomposed | image/jpeg | 1.7 KB | 72×41 | 0 | 4.5 | 93.6 | own | wordmark | own-site-declared | 2026-09-10 |
| Rayhaan | brand | 200 | https://rayhaanperfumes.com/cdn/shop/t/14/assets/icon-for-mobile_76x76.png?v=1623148847918320321779449201 | apple-touch-icon-precomposed | image/jpeg | 1.9 KB | 76×43 | 0 | 4.2 | 93.4 | own | wordmark | own-site-declared | 2026-09-10 |
| Rayhaan | brand | 200 | https://rayhaanperfumes.com/cdn/shop/t/14/assets/icon-for-mobile_114x114.png?v=1623148847918320321779449201 | apple-touch-icon-precomposed | image/jpeg | 2.6 KB | 114×64 | 0 | 5.2 | 92.7 | own | wordmark | own-site-declared | 2026-09-10 |
| Rayhaan | brand | 200 | https://rayhaanperfumes.com/cdn/shop/t/14/assets/icon-for-mobile_120x120.png?v=1623148847918320321779449201 | apple-touch-icon-precomposed | image/jpeg | 2.6 KB | 120×68 | 0 | 5.4 | 92.5 | own | wordmark | own-site-declared | 2026-09-10 |
| Rayhaan | brand | 200 | https://rayhaanperfumes.com/cdn/shop/t/14/assets/icon-for-mobile_144x144.png?v=1623148847918320321779449201 | apple-touch-icon-precomposed | image/jpeg | 2.8 KB | 144×81 | 0 | 5.4 | 92.3 | own | wordmark | own-site-declared | 2026-09-10 |
| Rayhaan | brand | 200 | https://rayhaanperfumes.com/cdn/shop/t/14/assets/icon-for-mobile_152x152.png?v=1623148847918320321779449201 | apple-touch-icon-precomposed | image/jpeg | 3.4 KB | 152×86 | 0 | 5.6 | 92.1 | own | wordmark | own-site-declared | 2026-09-10 |
| Acqua Di Parma | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Valentino | brand | 200 | https://www.valentino.com/etc.clientlibs/vlr/clientlibs/clientlib-static/resources/images/favicon/favicon.ico | shortcut icon | image/x-icon | 9.4 KB | 48×48 | 0 | 15.2 | 80.3 | own | square | own-site-declared | 2026-09-10 |
| Valentino | brand | 200 | https://www.valentino.com/etc.clientlibs/vlr/clientlibs/clientlib-static/resources/images/favicon/apple-icon-144x144.png | apple-touch-icon | image/png | 2.4 KB | 144×144 | 0 | 6.4 | 92.4 | own | square | own-site-declared | 2026-09-10 |
| Valentino | brand | 200 | https://www.valentino.com/etc.clientlibs/vlr/clientlibs/clientlib-static/resources/images/favicon/apple-icon-180x180.png | apple-touch-icon | image/png | 2.8 KB | 180×180 | 0 | 7 | 92.3 | own | square | own-site-declared | 2026-09-10 |
| Valentino | brand | 200 | https://www.valentino.com/etc.clientlibs/vlr/clientlibs/clientlib-static/resources/images/favicon/android-icon-192x192.png | icon | image/png | 3.7 KB | 192×192 | 90.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Valentino | brand | 200 | https://www.valentino.com/etc.clientlibs/vlr/clientlibs/clientlib-static/resources/images/favicon/favicon-32x32.png | icon | image/png | 1.1 KB | 32×32 | 88.7 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Valentino | brand | 200 | https://www.valentino.com/etc.clientlibs/vlr/clientlibs/clientlib-static/resources/images/favicon/favicon-96x96.png | icon | image/png | 7.1 KB | 96×96 | 89.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Valentino | brand | 200 | https://www.valentino.com/etc.clientlibs/vlr/clientlibs/clientlib-static/resources/images/favicon/favicon-16x16.png | icon | image/png | 0.7 KB | 16×16 | 94.1 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Bvlgari | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Gulf Orchid | brand | 200 | https://shop-gulforchid.com/cdn/shop/files/Favicon_1.png?crop=center&height=32&v=1737121710&width=32 | shortcut icon | image/png | 3.2 KB | 32×32 | 84 | 0 | 85.4 | light | square | own-site-declared | 2026-09-10 |
| Elie Saab | brand | ERR | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 | <!-- TypeError: fetch failed (Error: getaddrinfo ENOTFOUND eliesaabperfume.co.uk) -->
| Xerjoff | brand | 200 | https://www.xerjoff.com/cdn/shop/files/Xerjoff-favicon.png?crop=center&height=32&v=1753859646&width=32 | icon | image/png | 1.8 KB | 32×32 | 0 | 8.3 | 89.1 | own | square | own-site-declared | 2026-09-10 |
| Xerjoff | brand | 200 | https://www.xerjoff.com/cdn/shop/files/Logo.svg?v=1738685244&width=500 | Organization.logo | image/svg+xml | 2.1 KB | 400×70 | 62.8 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Chloé | brand | 200 | https://www.chloe.com/on/demandware.static/Sites-ChloeEUROPE-Site/-/default/dwd616bffd/images/favicons/favicon.svg?v=2 | icon | image/svg+xml | 3.1 KB | 400×400 | 0 | 6.3 | 93.3 | own | square | own-site-declared | 2026-09-10 |
| Rasasi | brand | 200 | https://rasasistore.co.uk/favicon.ico | icon | image/vnd.microsoft.icon | 19.9 KB | 256×256 | 72.1 | 0 | 60.2 | light | square | own-site-declared | 2026-09-10 |
| Rasasi | brand | 200 | https://www.rasasistore.co.uk/favicon.ico | Organization.logo | image/vnd.microsoft.icon | 19.9 KB | 256×256 | 72.1 | 0 | 60.2 | light | square | own-site-declared | 2026-09-10 |
| New Brand | brand | 200 | https://pcdesignperfumes.com/wp-content/uploads/2025/05/cropped-logo-32x32.png | icon | image/png | 0.5 KB | 32×32 | 84.9 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| New Brand | brand | 200 | https://pcdesignperfumes.com/wp-content/uploads/2025/05/cropped-logo-192x192.png | icon | image/png | 6.0 KB | 192×192 | 84.7 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| New Brand | brand | 200 | https://pcdesignperfumes.com/wp-content/uploads/2025/05/cropped-logo-180x180.png | apple-touch-icon | image/png | 10.5 KB | 180×180 | 84.9 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Viktor & Rolf | brand | 503 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Ahmed Al Maghribi | brand | 200 | https://www.ahmedalmaghribi.uk/cdn/shop/files/ahmed_al_maghribi_logo_for_web.png?crop=center&height=32&v=1775464859&width=32 | icon | image/png | 2.7 KB | 32×32 | 89 | 0 | 0 | light | square | own-site-declared | 2026-09-10 |
| Ahmed Al Maghribi | brand | 200 | https://www.ahmedalmaghribi.uk/cdn/shop/files/ahmed_al_maghribi_logo_for_web.png?crop=center&height=48&v=1775464859&width=48 | apple-touch-icon | image/png | 4.9 KB | 48×48 | 87.3 | 0 | 0 | light | square | own-site-declared | 2026-09-10 |
| Ahmed Al Maghribi | brand | 200 | https://www.ahmedalmaghribi.uk/cdn/shop/files/AhmedLogo.png?v=1775464860&width=500 | Organization.logo | image/png | 60.3 KB | 500×504 | 84.8 | 0 | 0 | light | square | own-site-declared | 2026-09-10 |
| Moschino | brand | 200 | https://www.moschino.com/cdn/shop/files/favicon-32x32.png?crop=center&height=32&v=1734539788&width=32 | icon | image/png | 0.6 KB | 32×32 | 0 | 65.4 | 32.9 | own | square | own-site-declared | 2026-09-10 |
| Avon Cosmetics | brand | 200 | https://avon.uk.com/cdn/shop/files/FAVICON_Avon_RGB_Logo_ONLY_FOR_BROWSER_32x32.jpg?v=1690898778 | shortcut icon | image/jpeg | 1.7 KB | 32×32 | 0 | 0 | 25.1 | own | square | own-site-declared | 2026-09-10 |
| Avon Cosmetics | brand | 200 | https://avon.uk.com/cdn/shop/t/511/assets/logo-desktop-new.png?v=86210 | Organization.logo | text/html; charset=utf-8 | 2.7 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Jenny Glow | brand | 200 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Arabiyat | brand | 525 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/apple-touch-icon-57x57.png | apple-touch-icon | image/png | 1.6 KB | 57×57 | 0 | 57 | 41.1 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/apple-touch-icon-60x60.png | apple-touch-icon | image/png | 1.6 KB | 60×60 | 0 | 57.3 | 41.3 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/apple-touch-icon-72x72.png | apple-touch-icon | image/png | 1.9 KB | 72×72 | 0 | 56.8 | 42.1 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/apple-touch-icon-76x76.png | apple-touch-icon | image/png | 2.0 KB | 76×76 | 0 | 56.9 | 42 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/apple-touch-icon-114x114.png | apple-touch-icon | image/png | 2.6 KB | 114×114 | 0 | 57.2 | 41.7 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/apple-touch-icon-120x120.png | apple-touch-icon | image/png | 2.7 KB | 120×120 | 0 | 57.3 | 41.9 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/apple-touch-icon-144x144.png | apple-touch-icon | image/png | 3.0 KB | 144×144 | 0 | 57.6 | 41.7 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/apple-touch-icon-152x152.png | apple-touch-icon | image/png | 3.2 KB | 152×152 | 0 | 57.5 | 41.9 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/apple-touch-icon-180x180.png | apple-touch-icon | image/png | 3.4 KB | 180×180 | 0 | 57.5 | 41.9 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/favicon-192x192.png | icon | image/png | 3.9 KB | 192×192 | 0 | 57.5 | 42.1 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/favicon-96x96.png | icon | image/png | 2.3 KB | 96×96 | 0 | 56.8 | 41.9 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/favicon-32x32.png | icon | image/png | 1.0 KB | 32×32 | 0 | 55.4 | 42.4 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/favicon-16x16.png | icon | image/png | 0.6 KB | 16×16 | 0 | 52 | 43.4 | own | square | own-site-declared | 2026-09-10 |
| Yardley London | brand | 200 | https://yardleylondon.co.uk/manifest.json | mask-icon | text/plain; charset=UTF-8 | 0.7 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- unreadable: UnidentifiedImageError: cannot identify image file '/tmp/logo-probe-9fCuos/raster-lg228tuda2f' -->
| Yardley London | brand | 200 | https://yardleylondon.co.uk/images/modules/promo_units/3c7d680a50b362ed51acc976ea2d83e6.png | Organization.logo | image/png | 1.9 KB | 350×118 | 92.6 | 0 | 100 | light | wordmark | own-site-declared | 2026-09-10 |
| Dior | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Riiffs | brand | 202 | data:; | icon | — | — | — | — | — | — | — | — | — | 2026-09-10 | <!-- TypeError: fetch failed (Error: failed to fetch the data URL) -->
| Floris London | brand | 200 | https://www.florislondon.com/cdn/shop/files/Floris_Seal_Navy.png?crop=center&height=32&v=1768404446&width=32 | icon | image/png | 2.4 KB | 32×32 | 94.7 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Salvatore Ferragamo | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Mäurer & Wirtz | brand | 200 | https://www.m-w.de/wp-content/uploads/cropped-mw-favicon-32x32.png | icon | image/png | 1.4 KB | 32×32 | 0 | 13.6 | 80.4 | own | square | own-site-declared | 2026-09-10 |
| Mäurer & Wirtz | brand | 200 | https://www.m-w.de/wp-content/uploads/cropped-mw-favicon-192x192.png | icon | image/png | 12.2 KB | 192×192 | 0 | 18.7 | 80.2 | own | square | own-site-declared | 2026-09-10 |
| Mäurer & Wirtz | brand | 200 | https://www.m-w.de/wp-content/uploads/cropped-mw-favicon-180x180.png | apple-touch-icon | image/png | 11.3 KB | 180×180 | 0 | 18.6 | 80.2 | own | square | own-site-declared | 2026-09-10 |
| Mäurer & Wirtz | brand | 200 | https://www.m-w.de/wp-content/uploads/logo-mw.svg | Organization.logo | image/svg+xml | 27.2 KB | 400×221 | 97.6 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Davidoff | brand | 200 | https://cdn.prod.website-files.com/687ce6f184420067f31990d5/68d5a1df1be264b8a86cbd68_Favicon.jpg | shortcut icon | image/jpeg | 2.1 KB | 32×32 | 0 | 13 | 84.8 | own | square | own-site-declared | 2026-09-10 |
| Davidoff | brand | 200 | https://cdn.prod.website-files.com/687ce6f184420067f31990d5/68d5a20b24c6e4f259a8f1b5_Webclip.jpg | apple-touch-icon | image/jpeg | 34.7 KB | 256×256 | 0 | 15 | 84.5 | own | square | own-site-declared | 2026-09-10 |
| Davidoff | brand | 200 | https://cdn.prod.website-files.com/687ce6f184420067f31990d5/687e3d471c58034224616d14_Logo.avif | Organization.logo | image/avif | 4.9 KB | 1031×120 | 74.3 | 0 | 100 | light | wordmark | own-site-declared | 2026-09-10 |
| Estée Lauder | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/apple-icon-57x57.png | apple-touch-icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/apple-icon-60x60.png | apple-touch-icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/apple-icon-72x72.png | apple-touch-icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/apple-icon-76x76.png | apple-touch-icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/apple-icon-114x114.png | apple-touch-icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/apple-icon-120x120.png | apple-touch-icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/apple-icon-144x144.png | apple-touch-icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/apple-icon-152x152.png | apple-touch-icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/apple-icon-180x180.png | apple-touch-icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/android-icon-192x192.png | icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/favicon-32x32.png | icon | image/png | 1.5 KB | 32×32 | 74.6 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/favicon-96x96.png | icon | text/html; charset=UTF-8 | 2.3 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Azzaro | brand | 200 | https://www.azzaro.com/favicon/favicon-16x16.png | icon | image/png | 1.2 KB | 16×16 | 73 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Guess | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Montale | brand | 200 | https://www.montaleparfums.com/img/favicon.ico?1324977642 | icon | image/vnd.microsoft.icon | 14.7 KB | 48×48 | 92.2 | 0 | 100 | light | square | own-site-declared | 2026-09-10 |
| Montale | brand | 200 | https://www.montaleparfums.com/img/logo.png | Organization.logo | image/png | 14.1 KB | 510×130 | 87.5 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Swiss Arabian | brand | 200 | https://swissarabian.com/cdn/shop/files/Logo.png?crop=center&height=48&v=1771311239&width=48 | icon | image/png | 0.7 KB | 32×32 | 61.1 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Reef Perfumes | brand | 200 | https://www.reef-parfum.com/wp-content/uploads/2026/06/cropped-favicon-reef-parfum-32x32.png | icon | image/png | 0.4 KB | 32×32 | 97.5 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Reef Perfumes | brand | 200 | https://www.reef-parfum.com/wp-content/uploads/2026/06/cropped-favicon-reef-parfum-192x192.png | icon | image/png | 4.1 KB | 192×192 | 95.3 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Reef Perfumes | brand | 200 | https://www.reef-parfum.com/wp-content/uploads/2026/06/cropped-favicon-reef-parfum-180x180.png | apple-touch-icon | image/png | 3.7 KB | 180×180 | 95.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Reef Perfumes | brand | 200 | https://www.reef-parfum.com/wp-content/uploads/2026/06/logo-reef-parfum.jpg | Organization.logo | image/jpeg | 11.4 KB | 600×600 | 0 | 8 | 91.3 | own | square | own-site-declared | 2026-09-10 |
| Maison Asrar | brand | 200 | https://maisonasrar.com/cdn/shop/files/MAISONASRARLOGOPNG.png?v=1786174491&width=500 | Organization.logo | image/png | 27.8 KB | 500×183 | 88.3 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Ajmal | brand | 200 | https://ajmal.com/public/images/logo.svg | shortcut icon | text/html; charset=iso-8859-1 | 0.2 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Maison Margiela | brand | 200 | https://www.maisonmargiela.com/on/demandware.static/Sites-MargielaGB-Site/-/default/dw93e9e033/favicons/apple-touch-icon.png | apple-touch-icon | image/png | 1.1 KB | 180×180 | 0 | 4.2 | 95.7 | own | square | own-site-declared | 2026-09-10 |
| Maison Margiela | brand | 200 | https://www.maisonmargiela.com/on/demandware.static/Sites-MargielaGB-Site/-/default/dw7e9dbd35/favicons/safari-pinned-tab.svg | mask-icon | image/svg+xml | 1.3 KB | 400×400 | 94.5 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Maison Margiela | brand | 200 | https://www.maisonmargiela.com/on/demandware.static/Sites-MargielaGB-Site/-/default/dw8e5b5c3c/favicons/favicon.svg | icon | image/svg+xml | 0.6 KB | 400×400 | 94.4 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Maison Margiela | brand | 200 | https://www.maisonmargiela.com/on/demandware.static/Sites-MargielaGB-Site/-/default/dw57804943/favicons/favicon.png | icon | image/png | 0.3 KB | 48×48 | 93.8 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Maison Margiela | brand | 200 | https://www.maisonmargiela.com/on/demandware.static/Sites-MargielaGB-Site/-/default/dwf290c8ce/images/mmlogo.png | Organization.logo | image/png | 4.9 KB | 270×56 | 84.5 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Coach | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Dunhill | brand | 200 | https://www.dunhill.com/on/demandware.static/Sites-DunhillROW-Site/-/default/dw2cab2ad9/images/favicons/favicon.svg | icon | image/svg+xml | 1.8 KB | 400×327 | 73.7 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Dunhill | brand | 200 | https://www.dunhill.com/on/demandware.static/Sites-DunhillROW-Site/-/default/dwe8b0d2c8/images/favicons/favicon-white.svg | icon | image/svg+xml | 1.8 KB | 400×400 | 89.7 | 0 | 100 | light | square | own-site-declared | 2026-09-10 |
| Roberto Cavalli | brand | 200 | https://www.robertocavalli.com/mobify/bundle/470/static/favicon/favicon-48x48.png | icon | image/png | 0.5 KB | 48×48 | 49.9 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Roberto Cavalli | brand | 200 | https://www.robertocavalli.com/mobify/bundle/470/static/favicon/favicon.svg | icon | image/svg+xml | 4.6 KB | 394×400 | 52.1 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Roberto Cavalli | brand | 200 | https://www.robertocavalli.com/mobify/bundle/470/static/favicon/favicon.ico | shortcut icon | image/x-icon | 14.7 KB | 48×48 | 49.9 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Roberto Cavalli | brand | 200 | https://www.robertocavalli.com/mobify/bundle/470/static/favicon/apple-touch-icon.png | apple-touch-icon | image/png | 1.2 KB | 180×180 | 0 | 22.5 | 76.4 | own | square | own-site-declared | 2026-09-10 |
| Escentric Molecules | brand | 200 | https://scdn.speedsize.com/54343ecb-8aeb-4686-af82-3f829e50d808/www.escentric.com/cdn/shop/files/Escentric_Molecules_Favicon.svg?crop=center&height=32&v=1739390404&width=32 | icon | image/svg+xml | 0.8 KB | 400×400 | 0 | 84.4 | 14.9 | own | square | own-site-declared | 2026-09-10 |
| Escentric Molecules | brand | 200 | https://www.escentric.com/cdn/shop/files/Escentric_Molecules_Logo.svg?v=1739390439&width=500 | Organization.logo | image/svg+xml | 4.0 KB | 400×33 | 64.6 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Karl Lagerfeld | brand | 200 | https://www.karllagerfeld.com/cdn/shop/t/144/assets/favicon-96x96.png?v=17826754261498214011787066150 | icon | image/png | 3.0 KB | 96×96 | 45.6 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Karl Lagerfeld | brand | 200 | https://www.karllagerfeld.com/cdn/shop/t/144/assets/favicon.svg?v=43487585118945864841787066152 | icon | image/svg+xml | 13.6 KB | 400×400 | 45.6 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Karl Lagerfeld | brand | 200 | https://www.karllagerfeld.com/cdn/shop/t/144/assets/favicon.ico?v=99788109211047033481787066151 | shortcut icon | image/vnd.microsoft.icon | 14.7 KB | 48×48 | 45.5 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Karl Lagerfeld | brand | 200 | https://www.karllagerfeld.com/cdn/shop/t/144/assets/apple-touch-icon.png?v=157814269758562765711787066104 | apple-touch-icon | image/png | 6.5 KB | 180×180 | 0 | 26.3 | 73.2 | own | square | own-site-declared | 2026-09-10 |
| Karl Lagerfeld | brand | 200 | https://www.karllagerfeld.com/cdn/shop/files/karl-lagerfeld-logo-mail.png?crop=center&height=1080&v=1749631812&width=1920 | Organization.logo | image/png | 9.2 KB | 1840×160 | 44.1 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Al Rehab | brand | 200 | https://alrehab.com/wp-content/uploads/2021/02/favicon.png | shortcut icon | image/png | 5.9 KB | 150×150 | 0 | 9.1 | 89.7 | own | square | own-site-declared | 2026-09-10 |
| Al Rehab | brand | 200 | https://alrehab.com/wp-content/uploads/2026/02/cropped-logo-sqaure-32x32.jpg | icon | image/jpeg | 0.9 KB | 32×32 | 0 | 0.5 | 97.8 | own | square | own-site-declared | 2026-09-10 |
| Al Rehab | brand | 200 | https://alrehab.com/wp-content/uploads/2026/02/cropped-logo-sqaure-192x192.jpg | icon | image/jpeg | 4.6 KB | 192×192 | 0 | 3 | 96.1 | own | square | own-site-declared | 2026-09-10 |
| Al Rehab | brand | 200 | https://alrehab.com/wp-content/uploads/2026/02/cropped-logo-sqaure-180x180.jpg | apple-touch-icon | image/jpeg | 4.0 KB | 180×180 | 0 | 2.8 | 96.3 | own | square | own-site-declared | 2026-09-10 |
| Al Rehab | brand | 200 | https://alrehab.com/wp-content/uploads/2020/08/logo.png | Organization.logo | image/png | 10.8 KB | 1139×278 | 86.9 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Al Rehab | brand | 200 | https://www.alrehab.com/wp-content/uploads/alrehab-logo.png | Organization.logo | text/html; charset=UTF-8 | 86.9 KB | — | — | — | — | — | — | — | 2026-09-10 | <!-- HTTP 404 -->
| Nina Ricci | brand | 200 | https://www.ninaricci.com/apple-touch-icon.png | apple-touch-icon | image/png | 3.3 KB | 180×180 | 87.7 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Nina Ricci | brand | 200 | https://www.ninaricci.com/favicon-32x32.png | icon | image/png | 0.8 KB | 32×32 | 88.1 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Nina Ricci | brand | 200 | https://www.ninaricci.com/favicon-16x16.png | icon | image/png | 0.6 KB | 16×16 | 89.5 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Nina Ricci | brand | 200 | https://www.ninaricci.com/safari-pinned-tab.svg | mask-icon | image/svg+xml | 13.9 KB | 400×400 | 87.5 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Jo Malone | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Rochas | brand | 200 | https://www.rochas.com/wp-content/uploads/2021/05/app-150x150.png | icon | image/png | 1.1 KB | 150×150 | 0 | 26.7 | 72.3 | own | square | own-site-declared | 2026-09-10 |
| Rochas | brand | 200 | https://www.rochas.com/wp-content/uploads/2021/05/app.png | icon | image/png | 1.3 KB | 256×256 | 0 | 27.3 | 72.5 | own | square | own-site-declared | 2026-09-10 |
| Caron | brand | 200 | https://www.parfumscaron.com/cdn/shop/files/favicon_32x32_ddb00dc2-606b-447b-b800-f7458fbd7b0e_32x32.png?v=1628587652 | shortcut icon | image/png | 0.8 KB | 32×32 | 61.9 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Le Bonheur | brand | 200 | https://cdn.files.salla.network/other/673065613/115d7933-1b37-4b04-81d7-19653061a3c9-original.webp | icon | image/webp | 9.7 KB | 250×272 | 90.4 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Lalique | brand | 200 | https://uk.lalique.com/cdn/shop/files/lalique-crystal-french-luxury-favicon.png?crop=center&height=32&v=1760019861&width=32 | icon | image/png | 1.6 KB | 32×32 | 92.2 | 100 | 0 | dark | square | own-site-declared | 2026-09-10 |
| Lalique | brand | 200 | https://uk.lalique.com/cdn/shop/files/LOGO_LALIQUE_BLACK_2285233d-1ba1-40a3-b2ab-0861ef8fca6a.svg?v=8290495384548174312 | Organization.logo | image/svg+xml | 20.5 KB | 400×84 | 75.6 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Ted Baker | brand | 200 | https://www.tedbaker.com/cdn/shop/files/FAV_icon-circle_bdd2e178-ce18-4077-9d03-58fa85acd505.png?crop=center&height=32&v=1726863856&width=32 | icon | image/png | 1.3 KB | 32×32 | 20.7 | 92.6 | 7 | dark | square | own-site-declared | 2026-09-10 |
| Tommy Hilfiger | brand | 503 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Risala Elite | brand | 200 | https://risala.ae/cdn/shop/files/logo_32x32.png?v=1758969448 | shortcut icon | image/png | 1.9 KB | 30×32 | 0 | 4.4 | 88.9 | own | square | own-site-declared | 2026-09-10 |
| Risala Elite | brand | 200 | https://risala.ae/cdn/shop/files/logo_48x48.png?v=1758969448 | apple-touch-icon-precomposed | image/png | 3.5 KB | 45×48 | 0 | 6.9 | 89.6 | own | square | own-site-declared | 2026-09-10 |
| Escada | brand | 200 | https://www.escada.com/cdn/shop/files/favicon.png?v=1708629271&width=96 | shortcut icon | image/png | 0.7 KB | 32×32 | 0 | 17.6 | 75.6 | own | square | own-site-declared | 2026-09-10 |
| Escada | brand | 200 | https://www.escada.com/cdn/shop/files/favicon.png?v=1708629271&width=180 | apple-touch-icon | image/png | 0.7 KB | 32×32 | 0 | 17.6 | 75.6 | own | square | own-site-declared | 2026-09-10 |
| Escada | brand | 200 | https://www.escada.com/cdn/shop/files/ESCADA-combined-logo-web.png?v=1733775154&width=4051 | Organization.logo | image/png | 42.4 KB | 4051×435 | 83.5 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| ORIENTICA | brand | 200 | https://www.orientica.co.uk/cdn/shop/files/Orientica_Favicon_055ba256-fa7f-4c29-91ef-84a7d6870ef1.png?crop=center&height=32&v=1783500513&width=32 | icon | image/png | 1.1 KB | 32×32 | 0 | 0 | 100 | own | square | own-site-declared | 2026-09-10 |
| ORIENTICA | brand | 200 | https://www.orientica.co.uk/cdn/shop/files/Orientica_word_mark_White.png?v=1776155565&width=2480 | Organization.logo | image/png | 19.3 KB | 2480×348 | 91.5 | 0 | 100 | light | wordmark | own-site-declared | 2026-09-10 |
| Ariana Grande | brand | 200 | https://arianagrandefragrances.com/cdn/shop/files/Favicon_32x32.png?v=1765307382 | shortcut icon | image/png | 1.7 KB | 32×32 | 0 | 92.6 | 4.5 | own | square | own-site-declared | 2026-09-10 |
| Ariana Grande | brand | 200 | https://cdn.shopify.com/s/files/1/0949/7319/8654/files/ARI_LOGO.svg?v=1762467822 | Organization.logo | image/svg+xml | 16.6 KB | 400×22 | 82 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Sarah Jessica Parker | brand | 403 | — | — | — | — | — | — | — | — | — | — | — | 2026-09-10 |
| Mancera | brand | 200 | https://www.manceraparfums.com/img/favicon.ico?1762917541 | icon | image/vnd.microsoft.icon | 5.3 KB | 32×32 | 0 | 9 | 89.8 | own | square | own-site-declared | 2026-09-10 |
| Mancera | brand | 200 | https://www.manceraparfums.com/img/logo-1762917506.jpg | Organization.logo | image/jpeg | 10.2 KB | 360×76 | 81.9 | 100 | 0 | dark | wordmark | own-site-declared | 2026-09-10 |
| Cacharel | brand | 200 | https://cachareluk.com/wp-content/uploads/sites/3/2026/09/asset_c7e7b1ff071e9ad1-150x150.webp | icon | image/webp | 1.2 KB | 150×150 | 0 | 0 | 100 | own | square | own-site-declared | 2026-09-10 |
| Cacharel | brand | 200 | https://cachareluk.com/wp-content/uploads/sites/3/2026/09/asset_c7e7b1ff071e9ad1-300x300.webp | icon | image/webp | 2.9 KB | 300×300 | 0 | 0 | 100 | own | square | own-site-declared | 2026-09-10 |
| Cacharel | brand | 200 | https://cachareluk.com/wp-content/uploads/sites/3/2026/09/asset_46c7b19fe112ae41.webp | Organization.logo | image/webp | 11.9 KB | 1200×896 | 0 | 0 | 99.6 | own | wordmark | own-site-declared | 2026-09-10 |
| Lanvin | brand | 200 | https://us.lanvin.com/cdn/shop/files/lanvin-favicon-32x32px.jpg?v=1664336022&width=96 | shortcut icon | image/jpeg | 0.5 KB | 32×32 | 0 | 2.8 | 95.8 | own | square | own-site-declared | 2026-09-10 |
| Lanvin | brand | 200 | https://us.lanvin.com/cdn/shop/files/lanvin-favicon-32x32px.jpg?v=1664336022&width=180 | apple-touch-icon | image/jpeg | 0.5 KB | 32×32 | 0 | 2.8 | 95.8 | own | square | own-site-declared | 2026-09-10 |

## Summary

- 138 target(s) probed
- 92 returned at least one measurable candidate
- 42 target(s) never got past the homepage request
  - notino-uk (retailer): HTTP 403
  - boots (retailer): HTTP 200
  - the-fragrance-shop (retailer): HTTP 403
  - the-perfume-shop (retailer): HTTP 403
  - john-lewis (retailer): HTTP 503
  - superdrug (retailer): HTTP 403
  - selfridges (retailer): HTTP 403
  - harvey-nichols (retailer): HTTP 503
  - the-fragrance-counter (retailer): HTTP 200
  - manchester-ouds (retailer): HTTP 200
  - zara (retailer): HTTP 200
  - Calvin Klein (brand): HTTP 503
  - Dolce & Gabbana (brand): HTTP 200
  - Giorgio Armani (brand): HTTP 403
  - Givenchy (brand): HTTP 403
  - Yves Saint Laurent (brand): HTTP 403
  - Versace (brand): HTTP 403
  - Tom Ford (brand): HTTP 403
  - Lancôme (brand): HTTP 403
  - Police (brand): HTTP ERR — TypeError: fetch failed (Error: getaddrinfo ENOTFOUND uk.policelifestyle.com)
  - Gucci (brand): HTTP 403
  - Jimmy Choo (brand): HTTP 403
  - Lacoste (brand): HTTP 403
  - Marc Jacobs (brand): HTTP 503
  - Narciso Rodriguez (brand): HTTP 200
  - Guerlain (brand): HTTP 403
  - Ralph Lauren (brand): HTTP 403
  - Mugler (brand): HTTP 403
  - Acqua Di Parma (brand): HTTP 403
  - Bvlgari (brand): HTTP 403
  - Elie Saab (brand): HTTP ERR — TypeError: fetch failed (Error: getaddrinfo ENOTFOUND eliesaabperfume.co.uk)
  - Viktor & Rolf (brand): HTTP 503
  - Jenny Glow (brand): HTTP 200
  - Arabiyat (brand): HTTP 525
  - Dior (brand): HTTP 403
  - Salvatore Ferragamo (brand): HTTP 403
  - Estée Lauder (brand): HTTP 403
  - Guess (brand): HTTP 403
  - Coach (brand): HTTP 403
  - Jo Malone (brand): HTTP 403
  - Tommy Hilfiger (brand): HTTP 503
  - Sarah Jessica Parker (brand): HTTP 403
