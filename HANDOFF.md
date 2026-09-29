# Clarity — Onboarding Handoff

Personal finance tracking app (React Native / Expo) for Aditya Kulkarni. This
document is meant to be pasted whole into a fresh Claude Code chat to resume
work with full context.

---

# PRIMARY — read this first, always relevant

## Project identity
- **App name:** Clarity
- **Owner:** Aditya Kulkarni (email: kulkarniaditya1207@gmail.com; git commit
  email: adi.kulkarni1207@gmail.com)
- **Local path:** `~/Developer/clarity` — this is the ONLY real copy. An
  earlier OneDrive-synced copy at `Desktop/ClaudeCode/clarity` was
  intentionally deleted because OneDrive broke Node's `process.cwd()`. If you
  ever see that path mentioned in old context, ignore it — it no longer
  exists.
- **GitHub repo:** `https://github.com/sh4dow-hunt3r/Clarity` (private).
  `sh4dow-hunt3r` is Aditya's own personal GitHub account — confirmed after a
  mixup with a school account (`Sh4dowHunt3r2026`). Always push here unless
  told otherwise.
- **Git remote:** already configured correctly on the local repo. Pushing
  requires Aditya to enter his GitHub PAT interactively in his own terminal —
  Claude cannot do this itself (no stored credentials by design, cleared
  multiple times during setup).

## Tech stack (exact versions matter — see "Version pinning" below)
- Expo SDK **57** (`expo@57.0.0`), React Native **0.86.0**, React 19.2.3
- TypeScript, `expo-sqlite` for local storage, `@react-navigation` (bottom
  tabs + nested stacks per tab)
- `expo-secure-store` for the Anthropic API key
- `pdfjs-dist` (web) / hidden WebView running pdf.js from CDN (native) for
  PDF statement parsing

## How to run it (mobile, via Expo Go — the only working test path)
```bash
cd ~/Developer/clarity
npx expo start --clear
```
Then generate a QR code for the phone to scan (Expo Go on iOS removed manual
URL entry per Apple App Store rules — QR scan via the Camera app, or Expo
Go's own "Development servers" list, are the only ways in):
```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
qrencode -o /tmp/clarity_qr.png -s 10 "exp://$(ipconfig getifaddr en0):8081"
```
Send that PNG to the user (SendUserFile tool) and have them scan it with the
Camera app (not Expo Go directly — Camera app avoids some picker bugs too).

**Expo account:** Modern Expo Go requires sign-in to open ANY local project,
even over plain LAN. Aditya is signed in on his phone via Google
(`adinj1207`), and the CLI is logged in via `npx expo login --browser`. If a
fresh machine/session ever hits "You need to be signed in to Expo Go", that's
why — not a bug.

## Critical environment gotchas (do not re-discover these the hard way)
1. **iOS Simulator is DISABLED in this Claude Code environment** by an
   internal feature flag (`"iosSimulator":"unsupported","reason":"disabled by
   its rollout flag"`). Do not spend time debugging Simulator.app — it does
   not exist in this environment no matter how many times Xcode is
   reinstalled (confirmed via two clean installs). **Real device via Expo Go
   is the only viable test path.**
2. Native builds (`npx expo run:ios`) DO work for verifying the app compiles
   (CocoaPods installed via Homebrew, deployment target patched to 16.4 via
   `expo-build-properties`), but since the Simulator can't be viewed, this is
   only useful for confirming "does it build," not for visual testing.
3. Homebrew is installed at `/opt/homebrew` but not on PATH by default in
   fresh Bash tool calls — always start relevant commands with
   `eval "$(/opt/homebrew/bin/brew shellenv)"`.
4. `qrencode` (installed via brew) generates the QR PNGs for phone
   connection.

## Version pinning (do not casually `npm install`/upgrade Expo packages)
Expo Go on real devices auto-updates itself from the App Store to the latest
SDK. The project MUST match that exact SDK (currently 57) or Expo Go refuses
to open it ("Project is incompatible with this version of Expo Go"). When
adding/upgrading any `expo-*` package or React Native itself, always check
`node_modules/expo/bundledNativeModules.json` for the exact version Expo
Go's SDK 57 client expects, and pin with `--save-exact`. Getting this wrong
previously caused a real crash ("Cannot find native module 'ExpoAsset'") that
took a long debugging chain to trace back to version drift.

## Database schema (SQLite, `src/db/database.ts`)
- `transactions` — id, date, amount, description, category, subcategory,
  shop, source ('manual'|'scan'|'statement'), notes, `import_batch`,
  `import_filename`, **`raw_description`** (critical — see below),
  created_at
- `food_items` — linked to transactions, for macro tracking
- `custom_categories` — user-added categories beyond the 11 defaults
- `ignored_subscriptions` — dismissed false-positive subscription detections
- `merchant_aliases` — **the AI merchant-name cache**: `raw_key` (normalized
  original statement text) → `clean_name` + `category`. This is what makes
  AI cleanup only cost money once per unique merchant, ever.

**`raw_description` is load-bearing.** It preserves the exact original
statement text forever, even after `description`/`shop` get AI-cleaned. This
was the subject of a real bug (fixed) where transactions predating this
column had their already-cleaned name mistaken for raw text on a second
cleanup run, producing a different wrong name each time. Any future code that
touches `description`/`shop` for cleanup purposes MUST read/write
`raw_description` as the stable cache key, never the mutable
`description` field. `getDb()` also has an init-promise cache to prevent a
concurrent-call race that caused a duplicate-column migration crash —
preserve that pattern if you ever touch `getDb()`.

## Current features (all working, tested on real device)
- Dashboard: monthly total, pie chart, tappable category cards that
  jump to filtered Transactions, AI Insights card (optional, needs API key)
- Transactions: search, category filter chips, **month/year filter chips**
  (new), bulk-delete-by-period, long-press to delete one, tap to edit
- Add/Edit Transaction: manual entry, camera "Scan Bill" (**OCR is a
  placeholder — not implemented**), Import Statement (CSV + PDF, **multi-file
  select supported**), custom category creation, shop as free-text field
  with quick-pick chips
- Subscriptions tab: auto-detects recurring ~monthly charges from
  transaction history, "ignore" to dismiss false positives
- Export tab: CSV export (transactions / monthly summary), **"Manage
  Imported Statements"** sub-screen to view/delete a whole prior import by
  batch (fixes accidental double-imports)
- Settings tab: Anthropic API key management (`expo-secure-store`), **"Clean
  Up Merchant Names"** — rewrites messy statement text ("IMAGINUS CANADA
  LIMITE TORONTO ON") into readable names ("Imaginus") using AI, cache-first

## AI features — current state vs. what was actually asked for
- **Model:** `claude-sonnet-5` (Haiku doesn't support the web search tool,
  which is required for identifying obscure merchants — confirmed this
  during design, per user's own suspicion).
- **Current implementation is SINGLE-AGENT.** One Claude call (with the
  `web_search_20250305` server tool) identifies a merchant name + category,
  cached in `merchant_aliases`.
- **Aditya originally asked for a two-agent / dual-check validation system**
  (a second independent pass to verify the first agent's answer isn't
  hallucinated) before accepting/caching a result. **This was never built.**
  It's an open, explicitly-requested feature — do not assume it exists.
  Implementing it means roughly doubling AI cost per *new* merchant (cache
  hits stay free either way) and adding a verify step before `setMerchantAlias`
  is called.
- All AI features gate gracefully on `getApiKey()` returning null — never
  assume a key is present; check first the way `AddTransactionScreen.tsx`
  and `SettingsScreen.tsx` already do.

## Explicitly open / requested-but-not-done work (in priority order per last discussion)
1. **Dual-agent AI validation** for merchant cleanup (see above) — requested,
   not built.
2. **Settings screen redesign** — Aditya wants a clean, iOS-Settings-style
   list (short rows, chevron-to-detail, an info "ⓘ" circle icon instead of
   paragraphs of description text) instead of the current big-card layout,
   because more settings are coming: username/account, and general prep for
   **eventually launching this app publicly** (this raises real architecture
   questions — local-only profile vs. real multi-user accounts+sync — clarify
   scope with Aditya before building).
3. Data repair: Aditya has some transactions corrupted by the now-fixed
   `raw_description` bug (two pairs seen: "Imaginus Posters" /
   "Brock University Poster Fair" — both wrong, from the same original
   merchant, renamed differently across two buggy cleanup runs). He also has
   genuine duplicate transactions from re-importing the same RBC statement
   multiple times during testing. **Recovery path:** Export tab → "Manage
   Imported Statements" → delete the affected batch(es) → re-import the
   statement fresh (now safe/idempotent with the bug fixed).
4. Real OCR for "Scan Bill" (currently just opens camera, no text
   extraction).
5. Installable standalone build (EAS Build) — app currently only runs via
   Expo Go's dev-client connection to a running Metro server on the laptop,
   not as a standalone tappable app icon.
6. Web deployment (only a local `npx expo start --web` dev preview exists;
   no hosted version).
7. App icon is still the default Expo placeholder.

---

# SECONDARY — useful context, safe to skip if short on space

## Design conventions
- Primary blue: `#1976D2`. AI/purple accent (Subscriptions tab, AI cards):
  `#7B1FA2`. Destructive red: `#E53935`.
- 11 default categories (Food, Clothes, Medicine, Entertainment, Gifting,
  Furniture, Gym, Fuel, Insurance, Utilities, Rent), each with an icon/color,
  plus user-created custom categories stored in `custom_categories`.
- Food has a further breakdown: subcategory (fruits/vegetables/grains/dairy/
  prepared/other) and per-item macros (protein/fat/carbs/fibre in grams) —
  this was an original differentiator from apps like Mint.

## Notable resolved bugs (context for "why is the code shaped this way")
- **pdf.js CDN version**: pinned to `3.11.174` — newer pdf.js versions
  dropped the classic global-script (`pdfjsLib`) build in favor of ES
  modules only, which 404'd our hardcoded CDN URL.
- **WebView null-origin bug**: the native PDF extractor's hidden WebView
  needs `baseUrl: 'https://localhost/'` on its `source` prop, or it loads at
  a restricted origin that silently blocks fetching the CDN script.
- **Chrome file-picker bug**: `expo-document-picker`'s web implementation
  hides its `<input>` with `display:none`, which triggers a real Chrome bug
  where a false `cancel` event fires right after a genuine file selection.
  Worked around with a custom picker (`src/utils/webFilePicker.ts`) using
  off-screen positioning instead of `display:none`.
- **FlatList sizing bug**: sibling FlatLists with no explicit `style` (only
  `contentContainerStyle`) can have React Native's layout engine hand
  leftover vertical space to the wrong one when the other's content
  collapses (e.g. an empty list). Fixed by explicit `style={{flexGrow:0,
  height:52}}` on filter-chip rows and `style={{flex:1}}` on the actual
  scrollable list.
- **Homebrew/CocoaPods/Ruby**: macOS's bundled Ruby is too old to compile
  native gem extensions against the current Xcode SDK — Homebrew's Ruby
  (installed via `brew install cocoapods`) was required.

## File map
- `src/db/database.ts` — all SQLite schema + queries
- `src/types/index.ts` — shared types, default categories, color/icon maps
- `src/screens/` — one file per tab/sub-screen (DashboardScreen,
  TransactionsScreen, AddTransactionScreen, SubscriptionsScreen,
  ExportScreen, ImportBatchesScreen, SettingsScreen)
- `src/navigation/AppNavigator.tsx` — bottom tabs, with Transactions and
  Export each wrapped in their own stack for sub-screen navigation
- `src/utils/statementParser.ts` — CSV + PDF-text-to-transactions parsing
  (keyword-based category inference, regex date/amount extraction)
- `src/utils/subscriptionDetector.ts` — groups transactions by merchant,
  flags ~monthly recurring consistent-amount charges
- `src/utils/aiService.ts` — all Anthropic API calls (`identifyMerchantAI`,
  `generateSpendingInsights`)
- `src/utils/aiSettings.ts` — secure API key storage
- `src/utils/pdfParser.ts` (web) / `src/components/PdfTextExtractorWebView.tsx`
  (native) — PDF text extraction
- `src/utils/webFilePicker.ts` — custom web file picker (see Chrome bug above)
- `src/hooks/useCategories.ts` — merges default + custom categories

## Miscellaneous
- Node/npm/git all installed and working. `xcode-select` points at full
  Xcode. `sudo xcodebuild -license` already accepted.
- The user is a student (Brock University references seen in transaction
  data) — not directly relevant to the app, just context for why certain
  merchant names appeared in test data.
