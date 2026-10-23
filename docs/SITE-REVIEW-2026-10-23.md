# Site review, 23 Oct 2026

The owner's whole site formatting review (23 Oct 2026), page by page, on all
four sites (UK `/`, US `/us/`, India `/in/`, Canada `/ca/`). Every page was
looked at in screenshots at 390 and 1280 wide, light and dark, before and
after each change (`launchChromium`, `scripts/a11y-audit.ts`
`startPagesServer`). The UK is the reference: the other three sites are drawn
by the same code and styles, and `tests/homeSections.test.ts` holds the four
home pages to one structure.

## Running list

| Page | Issue | Fix | Commit |
| --- | --- | --- | --- |
| Home, all four | Most Stocked centred in a 1068px column, the guides button at the page's left edge, the update history in a 640px column of its own | One `.home-block` column for every section under the banner, so all start on one left edge | step 1 |
| Home, US, India, Canada | No Most Popular row (their shops publish no review counts), so the four homes had different sections | The row on every site: by shop reviews where shops publish them (UK), else the next houses by how many shops stock them, labelled "By how many shops stock it" (`nextMostStockedRail`, demo/mostPopular.ts) | step 1 |
| Home, US, India, Canada | A "Prices checked daily. Last checked ..." line under the hero that the UK does not have | Removed, as on the UK home (the banner says it) | step 1 |
| Tiles, everywhere | Rank discs 1, 2, 3 on the photo's corner, with ribbon tails | A plain disc in the tile's top left corner, level with the brand pill, which keeps clear of it | step 1 |
| Tiles, everywhere | Shop names cut short: "from Maximum Fra...", "at Discount Fragran..." | The whole name, on two lines where needed | step 1 |
| Tiles, US and Canada | "Shipping Not Stated" in bold small caps type, prices in a row at different heights | Regular weight, muted; every price in a row keeps the note's room, so prices line up | step 1 |
| Product page | Price history dates printed over each other at 390 ("18 Oc23 Oct") | A date label too close to the last one is dropped | step 1 |
| Product page | "Not Available" list: a line could start with a comma | Each name keeps its comma | step 1 |
| Product page | "Available at (4 Shops)" | "Available at 4 Shops" | step 1 |
| Note page | "Often found with" tiles: a lone last tile centred under the row | Small tiles start at the left edge | step 1 |
| Note, shop and brand lists | Counts without separators ("4431 Fragrances", "Top · 4365"), "2618 Fragrances Here" | "4,431 Fragrances", "Top · 4,365" | step 1 |
| Brands | A break per digit ("1", "2", "3", "4"), one brand under each | One "0 to 9" break | step 1 |
| Sign in | Sign In and Sign Up tabs squeezed ("Sign Up" on two lines), the button left aligned under centred links | Tabs as wide as the form, button full width | step 1 |
| Settings | "Use System Setting" wrapped on two lines at 390 | "System" | step 1 |
| Footer, every page | Two left aligned rows of eight links, a long commission line | One centred row: About, How it works, Contact, Legal; "Some links earn us a commission. It never changes the order." | step 1 |
| About | Link row mixed underlined links and plain buttons | One style; Design System moved here from the footer | step 1 |
| Home | "Read our Guides and Methods" in a rounded bordered box with an arrow | A quiet text link, "Guides and how we check prices", underlined on hover | step 2 |
| Product, brand and shop pages | Official Site, Fragrantica, Open Brand Website and Reviews on Trustpilot as bordered pills | Plain links with their external icon; "Brand Website" | step 2 |
| Product page | RRP and Cheapest Price in red and green bordered boxes | The same two tinted panels without the border | step 2 |
| About | The opening text, six numbers and four cards each in a bordered box | Text and numbers on the page, numbers split by hairlines, cards as plain columns | step 2 |
| Legal Notice | Contents as six bordered pills | A row of text links | step 2 |
| Guides | Every guide a bordered card that lifted on hover | A list: title link and line, hairline between | step 2 |
| Guides, oils sort | "Prices Per Ml", "Lowest to Highest Per Ml" | "per ml" | step 2 |

## Copy changes

| Where | Before | After |
| --- | --- | --- |
| Footer | About, How We Check Prices, Guides, How the Bot Works, Contact, Legal Notice, Privacy, Design System | About, How it works, Contact, Legal |
| Footer | Some shop links earn us a commission, at no cost to you. It never changes the order of results. | Some links earn us a commission. It never changes the order. |
| Deals | Savings are against the shop's own published RRP, or the maker's own price where the maker sells it here. Prices include delivery where the shop states it. One deal per perfume, at its best size. | Savings against the shop's RRP, or the maker's own price. Delivery included where stated. One deal per perfume. |
| Most Stocked list | Ranked by how many of our N shops stock each one, then by brand and name. A brand's own store does not count. One line per perfume ... not how well it sells. | By how many of our N shops stock it (brand stores not counted), then A to Z. One line per perfume. Sets and oils are under Explore. |
| Most Popular note | By reviews at the shops we compare | By shop reviews |
| 404 | There is nothing at /x. It may be a fragrance or a shop we no longer list. Try one of these. | Nothing at /x. It may be a fragrance or shop we no longer list. |
| Guides | Where do our prices come from? Read how we check prices. | Read how we check prices. For shops: how our bot works. |
| Sign in | Forgot Your Password | Forgot Password |
