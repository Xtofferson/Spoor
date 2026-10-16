# Spoor app review

Reviewed on 12 October 2026, at commit `3183d30` (navigation and Trips redesign). No code was changed for this review.

**Progress:** ✅ #1, #2, #3, #4, #5, #7, #8, #9, #10, #13, #14, #16, #17, #20, #21, #23–#27 and #31 are fixed (#31 by locking the app to light).

**Effort:** **S** = under 2 hours · **M** = half a day to a day · **L** = several days.

**What's in good shape:**
- Every Supabase table has row-level security.
- No keys or `.env` files were ever committed.
- Trips are offline-first, with a tested merge.
- Route plans, options and OpenStreetMap results are saved on the phone.
- All screen text is in English and Afrikaans, with tests that keep the two files in step.

The findings below are what to fix next.

---

## Must fix

| # | Area | Finding | One-line fix | Effort |
|---|---|---|---|---|
| 1 | ✅ Inefficiency / quota | **The same OpenRouteService and Overpass requests are sent twice.** The Trips home card and the open trip each run their own trip plan, and neither knows the other is already fetching. Opening the next trip before its first lookup finishes doubles route requests (200/day quota), Overpass load and the OSM seeding calls. | Share one in-flight request per cache key (a module-level `Map<key, Promise>`) in `useRoutePlan`, `useRouteSupplies` and `useRouteOptions`. | S |
| 2 | ✅ Security | **The OpenRouteService key ships inside the app** (`EXPO_PUBLIC_ORS_KEY` is built into the JavaScript bundle). Anyone can pull it out and use up the daily quota, and route planning then stops for every user. | Call OpenRouteService through a Supabase Edge Function that holds the key, checks the user is signed in and limits requests per user. | M |
| 3 | ✅ Security | **Any signed-in user can overwrite shared OpenStreetMap places.** `seed_osm_supply_points` is `security definer` and does `on conflict (osm_id) do update`, so one user can rename or move every butchery, add fake phone numbers, or flood the table with up to 500 rows per call. | Change it to `on conflict do nothing`, and refresh existing OSM rows only from a server-side job that fetches Overpass itself; add a per-user rate limit. | S–M |
| 4 | ✅ Data loss risk | **Sync trusts the phone's clock and uploads blindly.** `updated_at` comes from the device, and the upload is a plain `upsert`. A phone with a wrong clock, or an old offline edit synced late, can overwrite a newer version. An offline edit to a trip deleted on another phone brings it back. | Have Supabase set `updated_at` (trigger), upload through an RPC that only updates when the copy is newer, and keep deleted-trip records so deletions win. | M |
| 5 | ✅ Crash | **Saving a new place can crash the app.** `addSupplyPoint` copies the photo with `copySync` and nothing catches errors (e.g. phone storage full, or the picker's temporary file already gone), so an exception reaches the Save button. | Wrap the copy in `try/catch`, save the place without the photo, and say so. | S |
| 6 | Release blocker | **Maps will be blank in Android release builds.** On Android, react-native-maps uses Google Maps, which needs an API key in `app.json`. Expo Go hides this because it has its own key. | Add a restricted Google Maps key (`android.config.googleMaps.apiKey`) before the first EAS Android build. | S |

## Should fix

### Bugs and risks
| # | Finding | One-line fix | Effort |
|---|---|---|---|
| 7 | ✅ **One bad place stops every later upload.** The upload queue (`syncSupplyPoints`) stops at the first failure: a deleted photo file or a rejected row keeps failing, and nothing after it ever uploads. | Handle each place separately: skip a missing photo, keep failed places with a retry count, and move on. | S |
| 8 | ✅ **The sign-out dialog can be wrong.** It says "Your trips stay saved in your account" even when changes haven't uploaded yet (e.g. offline). | Check for unsynced trips, vehicle and places; offer "Sync first" or warn clearly. | S |
| 9 | ✅ **A wrong or empty download hides trips.** `mergeRemoteTrips` drops every synced trip that's missing from the download. They're still in Supabase, but a wrong session or a future row-level-security mistake would make them vanish from the phone until fixed. | Don't drop more than a few trips from one download without checking again (or require a non-empty result when the phone has synced trips). | S |
| 10 | ✅ **Saved data on the phone only grows.** Route plans (`spoor.route.v3.*`), route options, Overpass results (`spoor.supplies.v4.*`) and supply points are never deleted. Every stop edit adds a new plan, and older versions (`supplies.v2`/`v3`, `route.v1`/`v2`) are left behind. | On launch, remove old key versions, and keep only the newest N entries per kind (or entries for current trips). | M |
| 11 | **Big saved data is read on the screen thread.** `storage.getItem` + `JSON.parse` of saved plans and Overpass results runs synchronously during render (kv-store sync API), which can make opening a trip stutter. | Read large entries with the async kv-store API in an effect, or keep them in SQLite tables. | M |
| 12 | **Text saved before a language change stays in the old language.** Route option names, notes and tags, and error messages, are stored in whatever language was on when they were fetched. | Store keys and values (e.g. `{ key: 'routeOptions.allTar' }`) and translate when shown. | S |

### Security
| # | Finding | One-line fix | Effort |
|---|---|---|---|
| 13 | ✅ **A place can point at someone else's photo.** `supply_points.photo_path` isn't checked, so a user can set it to another user's photo. | Add `check (photo_path is null or photo_path like created_by::text \|\| '/%')`. | S |
| 14 | ✅ **Overpass is called from every phone.** That's fine for a few users, but against the public servers' fair-use rules at scale, and their answers take 10–90 s. | Fetch Overpass server-side (Edge Function + the existing `supply_points` table) and let phones read Supabase. This also fixes #3 and helps ratings (#33). | M |

### Inefficiencies (battery, data, speed)
| # | Finding | One-line fix | Effort |
|---|---|---|---|
| 15 | **Too much is redone on every trip save.** The route depends on the whole trip, so ticking a fuel town rebuilds the route line and re-finds every fuel, water and supply place. `locateOnRoute` (route points × places) runs about 6 times per change, and the screen stutters on long trips. | Depend on `trip.stops` only, find each place on the route once and reuse it, and use a 100 m simplified line for distances. | M |
| 16 | ✅ **Sync downloads every trip each time.** It runs on each foreground and each edit, including chosen-route geometry. | Download only trips with `updated_at` after the last sync (needs #4's server timestamps). | S |
| 17 | ✅ **Supply points are fetched for a whole rectangle.** A long diagonal route covers most of a country, and the query allows up to 5,000 rows. | Add a PostGIS RPC that returns points within 10 km of a simplified route line. | M |
| 18 | **Supply points are fetched again every time a trip opens,** and on the Trips home screen. | Reuse saved points for a day unless you pull to refresh or add a place. | S |
| 19 | **Many map markers are slow.** Supply markers are custom views (one timer each); hundreds of them are slow on Android and drain battery while the map moves. | Use small image markers per category (like fuel and water) and cluster when zoomed out. | M |
| 20 | ✅ **Unused packages:** `expo-device`, `expo-glass-effect`, `expo-web-browser`. | Remove them with `npm uninstall`. | S |
| 21 | ✅ **Template leftovers:** `scripts/reset-project.js` and its npm script; unused images `expo-badge*.png`, `expo-logo.png`, `logo-glow.png` (330 KB), `react-logo*.png`, `tutorial-web.png`, `tabIcons/`; `src/global.css` (old font variables); unused `SafariColors` and `suppliesFound` (`suppliesFound` is used now, so it stays). | Delete them. | S |
| 22 | **Duplicated code:** saved-JSON readers (`readSaved` / `readJson`, 3 copies), `close()` (5 copies), the subscribe/emit store pattern (trips, vehicle, map layers, i18n, supplies), form `Field`s (Vehicle, Add a place), route lines (Route and Supplies tabs), the `TERRAINS` list (2 copies). | Move them into shared `lib/store.ts`, `lib/saved.ts`, `components/form.tsx` and `components/button.tsx`. | M |

### Design and usability
| # | Finding | One-line fix | Effort |
|---|---|---|---|
| 23 | ✅ **Several screens still have the old look:** sign-in (text "Spoor" instead of the wordmark), the trip form, Vehicle, Add a place, place details, route options and the map picker. They use 1–1.5 px borders, 8–12 px corners and white-on-cream fields, not the mockups' 2 px brown outlines, 14 px corners and rust buttons. | Make shared `Button`, `Input` and `Card` components from the mockup styles and use them on every screen. | M |
| 24 | ✅ **Some touch targets are too small:** the trip form's move/remove buttons are 36×36 and the map filter chips are 36 high. "Refresh", "Move pin" and "Remove pin" are small text links that rely on `hitSlop`. | Make them at least 44 × 44 pt. | S |
| 25 | ✅ **The Supplies tab is very long:** about 12 sections. Its loading spinner and "servers are busy" error are at the very bottom, so for 10–30 s the top shows nothing. | Show loading and errors at the top, and fold the detailed cards under "Show details". | S–M |
| 26 | ✅ **Five of the nine main places are "Coming soon":** Community, Maps, Camps, Prep and Friends. Non-technical users will keep landing on dead ends. | Hide the unfinished tabs until they work, or give each a useful first version. | S |
| 27 | ✅ **Adding a place is hard to find:** only by pressing and holding the map. | Add a visible "Add a place" button that opens the map picker. | S |
| 28 | **Water is nearly always amber.** OpenStreetMap has very few water points in southern Africa, so almost every route warns, and people learn to ignore it. | Count towns or fuel stations as places to buy water (setting or default). | S–M |
| 29 | **Missing hints and states:** with no vehicle saved, the Trips card silently leaves out fuel; route options says "Use: Via A1"; messages mention "OpenRouteService" and "OpenStreetMap" to people who don't know what those are. | Add an "Add your vehicle" chip, and rewrite those messages in plain words ("Route planning is busy, try again later"). | S |
| 30 | **Hard-coded colours** don't follow the theme or dark mode: water layer `#3E7CA6`, marker outline `#F3E7CF`, colours inside marker PNGs. | Move them into `Colors`. | S |
| 31 | ✅ **Dark mode isn't in the mockups,** and the dark palette hasn't been checked on a phone. | Check every screen in dark mode, or lock the app to light until it's designed. | S |
| 32 | **The Afrikaans was written by Claude, not a native speaker.** Supabase's sign-in errors are English only. | Have a native speaker review `af.json`, and translate common auth errors by code. | S |

## Nice to have

| # | Area | Finding | One-line fix | Effort |
|---|---|---|---|---|
| 33 | Structure: ratings | **Fuel stations and water points exist only in each phone's Overpass cache,** not in Supabase, so there's nothing shared to attach ratings to (fuel stop choices already keep OSM ids, which helps). | Add fuel and water as categories in `supply_points` (seeded server-side, see #14), and add a `ratings` table keyed by point id with one rating per user. | M–L |
| 34 | Structure: sharing | **Each trip has a single owner, and all its stops sit in one jsonb blob.** Friends editing the same trip would overwrite each other's changes, and row-level security only allows the owner. | Add a `trip_members` table, base the trips policies on membership, use server timestamps (#4), and consider one row per stop. | L |
| 35 | Structure: offline maps | **react-native-maps can't store map tiles offline,** and the app uses it in two places (`RouteMap` and `LocationPicker`). Offline maps will need MapLibre (a development build, not Expo Go) and tile downloads with expo-file-system. | First put all map use behind one map component, then swap in MapLibre with offline packs. | L |
| 36 | Structure | **The trip plan is one large provider,** and data fetching (caching, retries, de-duplication, time limits) is hand-written per hook. | Move fetching to a shared query cache (e.g. TanStack Query with the kv store), which also fixes #1, #18 and the retries. | M |
| 37 | Structure | **All trips sit in one JSON value per user,** rewritten on every save. That's fine now, but slow with many trips, photos and offline maps. | Move trips (and the later tile index) into expo-sqlite tables (already installed). | M |
| 38 | Security | **Public points show who added them:** `supply_points.created_by` (a user id) is readable by everyone. | Hide it behind a view, or show it only to the person who added the place. | S |
| 39 | Security | **Supabase gives `anon` table rights by default** (row-level security still blocks access). | `revoke all on public.trips, public.supply_points, public.supply_categories from anon;` for extra safety. | S |
| 40 | Structure | **The name and vehicle live in user metadata** (they travel inside every login token, and other users can't see them). Friends will need to see vehicles. | Add a `profiles` table with row-level security for the name and vehicle. | S–M |
| 41 | Tests | **The data logic is well tested, but sync, the place upload queue and the trip plan aren't,** and there are no screen tests. | Add tests with a mocked Supabase client for sync and uploads. | M |
| 42 | Tooling | **No crash reporting and no `eas.json` yet.** | Add `eas.json` build profiles and Sentry (or EAS Insights) before testing with real users. | S |
| 43 | Usability | **The phone's language is read only at launch.** | Re-read it when the app comes back to the foreground (`useLocales`). | S |
| 44 | Usability | **Maps are hard to use with a screen reader:** routes and markers have no summary. | Add an accessible text summary under each map, e.g. "Route from Joburg to Kubu Island, 3 fuel stops". | S |

---

### Suggested order
1. **#1, #5, #7:** quick fixes that protect quota and users' places.
2. **#2, #3, #14:** move OpenRouteService and Overpass behind Supabase. This closes the key leak and the shared-data vandalism risk, and sets up ratings.
3. **#4, #16:** server timestamps for sync, before sharing (#34) builds on top.
4. **#23–#27:** finish the v2 look across all screens before more features land.
