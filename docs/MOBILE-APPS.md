# The PriceSniffs iOS and Android apps

Written 2026-10-01 for whoever builds and submits the apps (a Mac with Xcode,
an Apple Developer account and a Google Play developer account). Everything
needed is in [`apps/`](../apps/).

---

## 1. How the apps stay in sync with the website

Both apps are **native shells around the live site**. They open
`https://pricesniffs.space` inside the app, so:

- **Every website change appears in both apps immediately**, with no app
  update and no store review. That covers new prices (every crawl), new
  features, fixes and design changes.
- **An app update is only needed** when something *native* changes: the
  icon, the app name, the launch screen, a new native feature (e.g. push
  notifications), or a Capacitor upgrade.

Built with [Capacitor](https://capacitorjs.com) 8. The iOS project is Swift
(`apps/ios/App/App/AppDelegate.swift`) using Swift Package Manager, so no
CocoaPods is needed. The Android project is Capacitor's standard template.

What is already set up (`apps/capacitor.config.json`):

| Setting | Value | Why |
|---|---|---|
| App ID / bundle ID | `space.pricesniffs.app` | Must match what you register with Apple and Google |
| Name | PriceSniffs | Shown under the icon |
| Loads | `https://pricesniffs.space` | The sync described above |
| Offline page | `apps/www/offline.html` | Branded "You're offline" with a retry button, instead of a blank error |
| Status bar / notch | content draws edge to edge | The site pads itself clear of the notch and the home bar (`env(safe-area-inset-*)`, added 2026-10-01) |
| User agent | ends `PriceSniffsApp` | Lets the site tell it is running inside the app |
| Icons and launch screen | generated from `apps/assets/` | The logo from `docs/brand/`, on black |
| iOS devices | iPhone only for now | iPad support would need iPad screenshots and an iPad layout review; iPads still run the iPhone app |

**Links to shops open in the phone's browser**, not inside the app, which is
what affiliate tracking needs. Capacitor does this by default for any
address that is not pricesniffs.space.

---

## 2. Before you start

| Need | Cost | Notes |
|---|---|---|
| A Mac with the latest **Xcode** (App Store) | — | Only needed for iOS |
| **Apple Developer Program** membership | $99 / £79 a year | developer.apple.com/programs |
| **Android Studio** (includes Java 21 and the SDK) | free | developer.android.com/studio |
| **Google Play Console** account | $25 once | play.google.com/console |
| **Node.js 22** | free | nodejs.org |

---

## 3. First-time set-up (both platforms)

```bash
git clone https://github.com/yanakan19/YanaFragrancePriceChecker
cd YanaFragrancePriceChecker/apps
npm ci          # Capacitor and its tools, separate from the website's own packages
npx cap sync    # copies the config, offline page and plugins into both native projects
```

**Quick test without any accounts:** every change to `apps/` triggers the
GitHub workflow **"App builds (iOS and Android)"**. It compiles both apps and
attaches **`pricesniffs-android-debug-apk`** to the run, under *Artifacts*.
Download it, unzip, and open the `.apk` on an Android phone (allow "install
unknown apps") to try the app today. You can also run it by hand from
**Actions → App builds → Run workflow**.

---

## 4. iOS: build and submit

1. `npx cap open ios` opens the project in Xcode.
2. Select the **App** target → **Signing & Capabilities** → tick *Automatically
   manage signing* and choose your **Team** (the Apple developer account).
   Bundle Identifier: `space.pricesniffs.app`.
3. Pick a simulator or a plugged-in iPhone and press ▶ to try it.
4. **Version:** App target → General → *Version* (e.g. 1.0) and *Build*
   (1, 2, 3…). Every upload needs a higher build number.
5. **Create the app in App Store Connect** (appstoreconnect.apple.com → Apps → +):
   platform iOS, name **PriceSniffs**, bundle ID `space.pricesniffs.app`,
   SKU `pricesniffs-ios`.
6. **Upload:** in Xcode choose *Any iOS Device*, then Product → **Archive** →
   **Distribute App** → App Store Connect → Upload.
7. **TestFlight:** the build appears after processing (10–30 min). Add
   yourself and the owner as testers and install via the TestFlight app.
8. **Listing** (App Store Connect → the app → App Store tab), with text ready in §7:
   - Screenshots: 6.9" iPhone (1320×2868). Take them in the simulator
     (iPhone 16 Pro Max): ⌘S saves a screenshot.
   - Privacy policy URL: `https://pricesniffs.space/legal/privacy`
   - Category: **Shopping**. Age rating: answer the questionnaire (4+).
   - **App Privacy** ("nutrition label"): the site collects an **email
     address** for sign-in and the **wishlist** (product IDs), both linked to
     the user, for app functionality, and is not used for tracking.
     Check this against the live privacy notice before submitting.
9. **App Review notes** (important, see §6): *"PriceSniffs compares the
   delivered price of 16,000+ fragrances across 33 UK shops, with price
   history, verified discounts, a wishlist with accounts, and an assistant
   that answers questions about the catalogue. Prices update throughout the
   day, which is why the app shows live content. No login is needed to
   browse; to test accounts use <a test email and password you create>."*
10. Submit for review.

---

## 5. Android: build and submit

1. `npx cap open android` opens the project in Android Studio. Let Gradle
   sync, then press ▶ on an emulator or a phone to try it.
2. **Version:** `apps/android/app/build.gradle` has `versionCode` (raise by 1
   on every upload) and `versionName` (e.g. "1.0").
3. **Signed release bundle:** Build → **Generate Signed App Bundle / APK** →
   *Android App Bundle* → create a new **upload key** (keystore).
   **Back the keystore and its passwords up somewhere safe, outside the repo.**
   Never commit it.
4. **Play Console** → Create app → name **PriceSniffs**, app, free. Use
   **Play App Signing** (the default).
5. Fill in the required sections: store listing (text in §7, screenshots,
   512×512 icon = `docs/brand/pricesniffs-logo-1080.png` resized, and a
   1024×500 feature graphic, ask for one), **Data safety** (same answers as
   Apple's App Privacy, §4 step 8), content rating, target audience (18+ is
   simplest for a shopping app), privacy policy URL as above.
6. **Testing first.** Upload the `.aab` to **Internal testing**, install it
   from the opt-in link, and check it.
   - **New personal developer accounts** must run a **closed test with at
     least 12 testers for 14 days** before Google allows production. That was
     the rule at the time of writing; check the current one in Play Console.
     An *organisation* account (needs a D-U-N-S number) is exempt.
7. Promote to **Production** and submit for review.

---

## 6. Store review: the risk, and how to keep it low

Apple rejects apps that are "a website in a frame" (App Store Review
Guideline **4.2, Minimum Functionality**). Capacitor's documentation also
describes loading a live URL as meant for development. PriceSniffs is an
interactive tool rather than a brochure: search, filters, price history,
accounts, wishlist and an assistant. Apps like this are often accepted, but
it is not guaranteed.

To strengthen the submission (each is an app update, and Claude can build
it on request):

1. **Price-drop push notifications** for wishlist items: the strongest "this
   is an app" feature. Needs an APNs key (Apple) and Firebase (Android),
   plus a scheduled check that compares wishlist prices after each crawl.
2. **Native share sheet** on product pages ("share this deal").
3. **Open pricesniffs.space links in the app** (Universal Links / App Links),
   so a shared product link opens the app.

**If Apple still rejects it:** the fallback keeps the sync. Ship the site's
code inside the app, load only the price data from the website, and push
code updates over the air. The first step is already queued as a suggested
task: "Serve the catalogue data as its own cached file".

**Google Play** is usually fine with this set-up, provided the listing
describes real functionality.

---

## 7. Store listing text (ready to paste)

- **Name:** PriceSniffs
- **Subtitle (Apple, 30 max):** `UK perfume prices compared` (26)
- **Short description (Google, 80 max):** `Every UK perfume price compared, delivery included. Real deals only.` (68)
- **Keywords (Apple, 100 max, comma separated, no spaces):**
  `perfume,fragrance,price,compare,deals,uk,cheap,aftershave,dupes,discount,cologne,parfum` (87)
- **Description:**

  > Find the cheapest place in the UK to buy any perfume, with delivery
  > included.
  >
  > PriceSniffs checks 16,000+ fragrances across 33 UK shops and shows what
  > you will actually pay: item price plus delivery. Every "was £X" a shop
  > claims is checked against the other shops selling the same bottle, so
  > you only see real deals.
  >
  > • Every UK price for a bottle, side by side, cheapest first
  > • Delivered prices, not just item prices
  > • Price history: see whether now is a good time to buy
  > • Today's deals, with fake discounts filtered out
  > • Search by brand, name, size, strength or note
  > • Save bottles to your wishlist
  >
  > Some links to shops earn us a commission. It never changes the order
  > prices are shown in.

---

## 8. Day-to-day

| Situation | What to do |
|---|---|
| The website changed | Nothing: the apps already show it |
| Change the icon or launch screen | Replace files in `apps/assets/` → `cd apps && npm run icons && npx cap sync` → new build for both stores |
| Change app name / ID / settings | Edit `apps/capacitor.config.json` → `npx cap sync` → new builds |
| Upgrade Capacitor | `cd apps && npm install @capacitor/core@latest @capacitor/cli@latest @capacitor/ios@latest @capacitor/android@latest && npx cap sync` → run the workflow → new builds |
| Check both apps still build | Actions → **App builds (iOS and Android)** → Run workflow |
