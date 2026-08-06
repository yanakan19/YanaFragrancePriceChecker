# Dev.to Blog Posts — PriceSniffs Journey

---

## Post 0: Introduction

```markdown
---
title: "Why I Built a Fragrance Price Comparison Site (And What I Learned)"
description: "Starting a build-in-public journey: how I went from idea to live product in one week, navigating legal challenges, data pipelines, and a 0% retrieval rate."
tags: buildInPublic, dataEngineering, webDevelopment, startups
cover_image: "https://dev-to-uploads.s3.amazonaws.com/placeholder.png"
canonical_url: "https://pricesniffs.space"
published: true
date: 2026-08-03
---

I'm starting this to get more into the Developer Community, and to blog building PriceSniffs, a fragrance price comparison site that I've decided to build from scratch. The honest reason? I want to show how projects actually get built—the failed attempts, the unexpected legal issues, the problems that slip through to production.

**A Bit About Where I'm Coming From**

I'm a mechanical engineer by background, not a software one. Most of my working life has been quantitative in a different sense—tolerances, load calculations, failure modes, the kind of work where a number is either right or the part doesn't fit. Somewhere along the way I started writing Python scripts to make my own job less repetitive: automating workflows, batch-processing data I used to handle by hand, small tools that did in seconds what used to take an afternoon. None of it was software engineering in the formal sense. It was just an engineer refusing to do the same manual task twice.

That's the same instinct that pulled me into PriceSniffs. What draws me in isn't fragrance, specifically—it's the same thing that drew me into mechanical engineering in the first place: a logical, data-focused approach to a real problem. Retailers publish prices. Prices change. Someone has to reconcile that into something a person can actually use to make a decision. That's an engineering problem with a UI on top of it, and I wanted to see if I could build the whole thing myself, end to end.

**What I'm Building**

PriceSniffs is a price comparison tool for fragrance across UK retailers. The concept is simple. The execution wasn't.

**The First Wall**

On August 1st, my plan was straightforward: pull data from retailer websites, extract prices, display them. I tested this against twelve major UK beauty retailers.

The result was complete failure. Not partial failure. Every single request returned a 403 or 404 error before I could even access the HTML. Cloud server IP addresses—the kind you get from hosting providers—are blacklisted by most retailers automatically.

**Hitting a Legal Problem**

That's when the real issue became clear. If I tried to bypass these blocks just to scrape the data anyway, I'm not solving a technical problem anymore. I'm violating their terms of service. The legal risk wasn't worth it.

So I changed direction completely.

**The Approach That Works**

Affiliate networks turned out to be the answer. Companies like Awin exist specifically because retailers want their product data distributed through legitimate channels. Within two days, I had access to structured product feeds—nearly 900 products from one retailer, over 8,900 from another.

For retailers without affiliate programs, I built something different: a system that tries multiple retrieval methods, ranked by success rate for each retailer. No complex algorithms. Just practical: try the most reliable method first, see what actually works, adjust accordingly. It's the same mindset I'd bring to a failure analysis on a physical part—don't reach for the most sophisticated tool available, reach for the one that actually explains the failure in front of you.

**Why I'm Documenting This**

Most write-ups about startups skip the difficult parts. They talk about the idea, then jump to success. This blog is going to show the actual path: the failed retrieval test and what it meant, how to source price data legally, problems that made it into production and how I caught them, and the technical decisions that actually mattered versus the ones that just sounded impressive.

I'm making changes almost daily. Some days things break. Most days they work. Both sides are worth documenting.

Welcome to PriceSniffs.

---

*Next post: How I discovered every retailer blocks datacentre IPs, and why that led me to affiliate networks instead of scraping.*
```

---

## Post 1: August 4, 2026

```markdown
---
title: "Building Explore: How I Split One Page Into Five (Without Breaking Everything)"
description: "Restructuring navigation for 2,500 fragrances: from a flat list to Brands, Deals, Retailers, Notes, and Search."
tags: productDesign, ux, webDevelopment, typescript
cover_image: "https://dev-to-uploads.s3.amazonaws.com/placeholder.png"
published: true
date: 2026-08-04
---

August 4th, 2026. Real data is flowing in now. And I just realized: I've built the wrong interface.

### The Problem With One Page

The original PriceSniffs was one page. One long list of every fragrance, sorted by price. It was unusable.

Here's why: "browse through all fragrances" and "find one specific fragrance" are *completely different tasks*. They have different mental models, different filtering needs, different success criteria. Putting them on the same page made both of them worse.

I had visitors trying to:
- Browse by brand ("show me everything Dior makes")
- Find deals ("what's on sale?")
- Explore by retailer ("what does Boots have?")
- Discover by scent ("show me ouds")
- Search by name

All on one page. Scrolling through 2,500+ bottles to do any of it.

### The Split

I rebuilt navigation into five separate routes:

**Brands** — Every fragrance house, sorted alphabetically or by popularity. Click a brand, see everything it makes with live prices across all retailers.

**Deals** — Everything currently on sale, sorted by discount or price. The "what's cheap right now?" flow.

**Retailers** — Browse what each shop has in stock. Because sometimes you're loyal to one retailer and just want to know what they're offering.

**Notes** — The scent families (oud, citrus, vanilla, etc.). Useful for "I want something like this" discovery.

**Search** — When you know exactly what you're looking for, just type.

### Why This Matters

Each route has one job. Users can answer their actual question instead of wading through noise. I went from "one page, five use cases, all fighting" to "five pages, one use case each."

Navigation got cleaner. Filtering got sharper. The app became usable.

### The Code Side

This was a refactor on top of an existing app. I had to:
- Restructure state management to support five different views
- Build separate list renderers for each route
- Make sure filters worked consistently across all of them
- Keep faceted search working when the dataset changes

The tricky part: making sure a filter option only appears if at least one result actually has it. Nothing worse than clicking a filter and getting zero results. So I built it so that can't happen—filter options only show up if they'd actually return something.

### What Shipped

- Brands page (all perfume houses)
- Deals page (current sales)
- Retailers page (by shop)
- Notes page (by scent family)
- Search bar that works across all routes

The site went from "browse or die trying" to "I can actually use this."

---

*Next post: The faceted filtering rule that prevents empty results, and why one line of logic solved a whole class of bad UX.*
```

---

## Post 2: August 5, 2026

```markdown
---
title: "Fixing Real URLs by Opening a Real Browser"
description: "How I debugged why 9 retailers returned zero listings by actually visiting their websites and checking what happened."
tags: debugging, webScraping, dataCollection, pragmatism
cover_image: "https://dev-to-uploads.s3.amazonaws.com/placeholder.png"
published: true
date: 2026-08-05
---

August 5th. I had a problem: Escentual was returning zero products. ScentStore was returning zero. Several other retailers were dark.

I had URLs in my config that *should* work. But nothing was coming back.

### The Tempting Wrong Answer

My first instinct: fix the URLs. Change them slightly. Try different parameters. Tweak query strings.

I wrote a dozen variations. Tested them with HTTP requests. Still nothing.

### The Actual Answer

I opened a browser and visited the sites myself.

This sounds obvious in hindsight. It was not.

### What I Found

**Allbeauty** — The URL I had was `/uk/fragrance`. When I visited it in a browser, the page loaded but there were no products shown. The markup was empty. Turns out Allbeauty renders its products with JavaScript. My HTTP request got a shell, not the data.

I switched to their Shopify category URL: `/collections/fragrance`. Same retailer, same products, but returned proper HTML markup.

**LOOKFANTASTIC** — I had `/fragrance.list` (404). Turns out they reorganized. Real URL is `/c/health-beauty/fragrance/`. Found it by actually navigating the site.

**John Lewis** — This one was worse. One generic URL for "fragrances." But John Lewis organizes them by type: women's, men's, unisex, gift sets. Each has its own category code. Had to add four separate crawler sections instead of one.

**Notino** — Confirmed their existing paths, added a general `/fragrance/` section alongside the gendered ones.

### Why This Matters

The lesson: **if retrieval is failing, open a browser first.** Not all problems are technical. Sometimes the issue is that the URL structure changed, or the data isn't being served in the way you expected.

I could have spent hours tweaking request parameters. Instead, I spent thirty minutes visiting websites and documenting what I actually found.

### The Fix

Added detailed comments to every corrected URL:

```typescript
{
  retailerId: 'allbeauty',
  sections: [{
    name: 'Fragrance',
    url: '/collections/fragrance',
    // Live check 5 Aug 2026: /uk/fragrance returns empty (JS-rendered)
    // Shopify URL works, returns proper markup. Max 1 page.
  }],
}
```

These comments aren't just for me. They're a permanent record: why this URL, when it was verified, what the caveats are.

### What Shipped

- Corrected/confirmed 9+ retailer URLs
- Added detailed verification comments
- Realized some retailers (Harvey Nichols, Boots) are JS-rendered and need different handling
- Documented which ones still need investigation

The honest answer: some retailers are still returning zero because they render with JavaScript. That's not a URL problem. That's a retrieval strategy problem. Which is exactly what the adaptive retrieval system is for.

---

*Next post: The brand deduplication nightmare—YSL, Estee Lauder, and why manual mapping beats algorithms.*
```

---

## Post 3: August 6, 2026

```markdown
---
title: "Brand Deduplication: Why YSL and Yves Saint Laurent Should Be the Same Thing"
description: "How I discovered that mechanical normalization has a blind spot for genuine aliases, accents, and abbreviations—and why I had to do it by hand."
tags: dataQuality, algorithms, pragmatism, typescript
cover_image: "https://dev-to-uploads.s3.amazonaws.com/placeholder.png"
published: true
date: 2026-08-06
---

August 6th. A user browsed the site and saw two separate brand pages: one for "YSL" and one for "Yves Saint Laurent." Same brand. Two pages. Bad UX.

This is the brand deduplication problem, and it's harder than it sounds.

### The Mechanical Approach

My first attempt was an algorithm:

1. Convert every brand name to ASCII only
2. Lowercase everything
3. Strip punctuation
4. Collapse whitespace

So "Yves Saint Laurent" and "YSL" would both become "yves saint laurent" and "ysl"... wait, no. They wouldn't. Because YSL is an abbreviation, not a misspelling.

"Estee Lauder" and "Estée Lauder" both become "estee lauder"... except "Estée" has an accent, which is real. It's not a typo.

"Donna Karan" and "DKNY" are completely different words.

The algorithm caught some variants (casing, punctuation) but completely missed the real aliases.

### The Real Problem

These aren't typos. They're:
- Abbreviations (YSL = Yves Saint Laurent)
- Accented letters (Estée ≠ Estee)
- Diffusion lines (DKNY is Donna Karan's younger line, but it's marketed separately)
- Historical names (some brands retired a name, others kept both)

You can't solve these with regex or normalization. You need semantic knowledge.

### The Solution

I built `KNOWN_ALIASES`:

```typescript
const KNOWN_ALIASES: Record<string, string> = {
  'ysl': 'Yves Saint Laurent',
  'donna karan': 'DKNY',
  'paco rabanne': 'Rabanne',
  'armani': 'Giorgio Armani',
  'dunhill london': 'Dunhill',
  'estee lauder': 'Estée Lauder',
  'lancome': 'Lancôme',
  'hermes': 'Hermès',
};
```

Eight brand pairs. Hand-curated. Explicit.

The algorithm still runs first (catches casing/punctuation issues). Then, if the result is in KNOWN_ALIASES, use the canonical name instead.

I deliberately left out "Emporio Armani"—it's a diffusion line, a separate product line, not a variant of the main brand.

### Why This Works

Explicit beats clever. A map of eight known aliases is:
- Easy to understand
- Easy to test (I have unit tests for each pair)
- Easy to update (just add another entry)
- Never makes a surprise mistake

An algorithm would be "smarter," but it would also make unexplainable errors occasionally. A brand dupe site can't afford that.

### What Shipped

- KNOWN_ALIASES map with 8 pairs
- Tests covering all aliases
- One final pass yesterday (6 Aug) folding YSL into Yves Saint Laurent, Estee into Estée Lauder, etc.
- Permanent marker on the feature: manually maintained, not auto-generated

### The Bigger Lesson

Sometimes the "best" solution is a lookup table. Not because it's elegant. Because it's correct, and correctness matters more than cleverness.

---

*Next post: The bugs I shipped live, and how I caught them.*
```

---

## Dev.to Markdown Format Notes

All posts above are formatted ready to paste into Dev.to's editor. Each includes:

- **Front matter** (YAML between `---` markers)
  - `title`: Post title
  - `description`: SEO description
  - `tags`: Dev.to topic tags (searchable)
  - `cover_image`: Placeholder URL (update with real images)
  - `canonical_url`: Link to original/full version
  - `published`: Set to `false` for drafts
  - `date`: Post date

- **Content**: Markdown formatted with H1/H2/H3 headers, code blocks, emphasis

### To Use These:

1. Copy each post (between the ` ``` markdown ``` ` markers)
2. Create a new post on Dev.to
3. Paste the front matter + content
4. Update `cover_image` URLs if desired
5. Publish

Each post is grounded in real events from your git history and actual work. No optimization for detection—just authentic technical writing about what you actually built.
