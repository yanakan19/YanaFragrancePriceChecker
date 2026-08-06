# PriceSniffs Feature Roadmap

## Planned Features (Next Phase)

### 1. My Tracker — User Accounts & Watchlist
**Status:** Planned (not yet started)

**User flow:**
- New "My Tracker" subpage in navigation (top-level or under Settings)
- Users sign up with email address (no password required, email-based auth)
- Add fragrances to personal watchlist
- View all saved fragrances in a list, sorted by cheapest current price
- Click any fragrance to expand to full profile page (existing fragrance detail view)

**Technical requirements:**
- User account system (email-based authentication, no password)
- Database: user accounts, watchlist entries (user_id → fragrance_id mappings)
- Session management / authentication tokens
- Backend API endpoints:
  - `POST /api/auth/signup` (email only)
  - `POST /api/watchlist/add` (user_id, fragrance_id)
  - `DELETE /api/watchlist/remove` (user_id, fragrance_id)
  - `GET /api/watchlist` (user_id) → returns list of fragrances with current cheapest price
- Frontend: "My Tracker" view showing watchlist with live pricing

**Data to persist:**
- User email and account creation date
- Watchlist entries (user_id, fragrance_id, date_added)

**UI/UX notes:**
- "Add to Tracker" button on every fragrance detail page
- Watchlist view: list format with cheapest price per fragrance, click-to-expand to profile

---

### 2. Price History Graphs — Line Charts of Price Trends
**Status:** Planned (not yet started)

**Feature:**
- Every fragrance detail page shows a line graph below the "Active Retailers" section
- Graph displays cheapest price over time, starting from August 1, 2026
- Y-axis: price (GBP)
- X-axis: date
- Updates with every hourly price check run

**Technical requirements:**
- Chart library: Chart.js or Recharts or similar
- Price history database: store price snapshot at each harvest
  - schema: (fragrance_id, date, cheapest_price, retailer_offering_cheapest)
- Backend API endpoint:
  - `GET /api/price-history/:fragranceId` → returns time-series of prices from Aug 1 to today
- Frontend: render line chart on fragrance detail page
- Harvest script modification: after fetching prices, snapshot cheapest price per fragrance to history table

**Positioning on page:**
```
[Fragrance name, image, details]
[Filter facets]
[Active retailers: current prices and stock]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
[PRICE HISTORY LINE GRAPH]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Not available at retailers]
```

**Data to collect:**
- Timestamp of each price check run
- Cheapest price at that moment (and which retailer)
- Store snapshots for all 4,551+ fragrances

**Data accuracy notes:**
- Only include runs where the harvest actually completed (check `run_complete` flag from reconciler)
- Skip partial runs to avoid false price drops
- Resample to daily if hourly is too noisy

---

## Implementation Order

**Phase 1 (My Tracker):**
1. Set up user account system (email signup, session management)
2. Build watchlist backend (database schema, API endpoints)
3. Add "Add to Tracker" button on fragrance detail pages
4. Build "My Tracker" UI page

**Phase 2 (Price History):**
1. Set up price history database schema
2. Modify harvest script to snapshot cheapest price after each run
3. Build `/api/price-history/:id` endpoint
4. Integrate chart library into frontend
5. Render chart on fragrance detail pages

---

## Architecture Considerations

**Current state:** Static site on GitHub Pages (no backend)

**What needs to change:**
- Add a backend server (Node.js/Express, or serverless functions)
- Add a database (PostgreSQL, Firebase, etc.)
- Move from pure static site to hybrid (static content + server for auth/watchlist/graphs)
- Keep demo data generation static (catalogue.generated.ts still works as before)
- New backend handles: user accounts, watchlist, price history, real-time graph data

**Deployment options:**
- Self-hosted: Node.js + PostgreSQL on a VPS
- Serverless: Firebase (auth + Firestore + functions) — easiest for small scale
- Hybrid: Keep GitHub Pages for static content, add separate backend for auth/data

---

## Notes

- My Tracker is the "gateway feature"—once users can sign up and save, they're invested in returning
- Price history graphs create a reason to check back repeatedly ("has my fragrance gotten cheaper?")
- Both features unlock future monetization (ads on graph view, email alerts on price drops, etc.)
- Watchlist is small/cheap to store; price history snapshots will grow ~4,551 × (1 per day) = negligible
