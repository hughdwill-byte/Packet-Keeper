# 🥘 Packet Keeper

Photograph the back of food-seasoning packets and keep the recipe forever — so
you can throw the packaging away and still cook it.

Packet Keeper is a **static** single-page app (Vite + React + TypeScript +
Tailwind) hosted on **GitHub Pages**. There is no backend. The **repo itself is
the database**:

- recipes → `recipes/<slug>.json`
- photos + generated dish tiles → `recipes/images/`
- the list of all recipes → `recipes/index.json`

The app reads these files from the public site (with an offline IndexedDB
cache) and **writes** them by committing through the GitHub REST Contents API.

## What it does

- 📷 Upload one or many packet photos at once; attach several photos to one recipe.
  Photos are resized/compressed in the browser (~1600px JPEG) before use.
- 🧠 Each photo is sent to **Claude (vision)** and turned into structured JSON:
  dish, brand, cuisine, serves/prep/cook, grouped ingredients, method, nutrition,
  and the sachet's own ingredient list — with a confidence flag on any cut-off field.
- ✂️ Cut-off method steps are completed by Claude and shown as **reconstructed**
  (different style) vs **from packet**.
- 🌶️ A **"make it without the sachet"** homemade spice blend (measured tsp/tbsp,
  labelled an estimate) is generated for each recipe.
- 🍽️ A dish image is generated for every recipe — a food **emoji tile** rendered as
  SVG (free, offline, no image API). See [Image generation](#image-generation).
- 🔎 Browse a card grid, search by name or ingredient, open a detail page.
- ✏️ Edit any field, delete (with confirmation), re-run extraction or regenerate
  the image — all commit to the repo.

Every screen is built for a 390px iPhone first, with large touch targets and
hash routing (deep links survive a refresh).

## Image generation

Anthropic's API does not generate images. `generateDishImage(recipe)`
(`src/lib/dishImage.ts`) is the single seam for this. It currently picks a
matching **food emoji** and renders it on a gradient **SVG** tile — free, no key,
works offline. To switch to a real image provider later, replace that one
function; nothing else changes.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173/Packet-Keeper/
npm run build    # type-check + production build into dist/
```

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site,
copies `recipes/` into the output, and deploys to GitHub Pages.

**Live site:** `https://hughdwill-byte.github.io/Packet-Keeper/`

Enable once in **Settings → Pages → Build and deployment → Source: GitHub Actions**.

> ⚠️ A free GitHub Pages site is **public**: anyone can view the site and every
> recipe/image file in the repo. Your API keys are **not** in the repo — they
> live only in your browser (see below).

## Create the GitHub token (exact permissions)

The app needs a **fine-grained personal access token** to commit recipes.

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Resource owner:** your account (`hughdwill-byte`).
3. **Repository access:** *Only select repositories* → **Packet-Keeper**.
4. **Permissions → Repository permissions → Contents:** **Read and write**.
   (Leave everything else at *No access*. Metadata read-only is added
   automatically.)
5. Set an expiry, generate, and copy the `github_pat_…` token.

## What to enter in Settings on your phone

Open the live site on your iPhone, tap **⚙️ Settings**, and fill in:

| Field | Value |
| --- | --- |
| **Anthropic API key** | your `sk-ant-…` key |
| **Claude model** | `claude-sonnet-5` (default) |
| **GitHub fine-grained token** | the `github_pat_…` from above |
| **Owner** | `hughdwill-byte` |
| **Repo** | `Packet-Keeper` |
| **Branch** | `main` |

Tap **Test GitHub access** to confirm, then **Save settings**. Everything is
stored only in that browser's localStorage — never committed.

## One-off sample import (local)

Processes `./samples/*.jpg` into `./recipes/` on your machine (not in the browser,
not in CI):

```bash
cp .env.example .env         # add ANTHROPIC_API_KEY (and optional ANTHROPIC_MODEL)
npm run import               # writes recipes/*.json, images, and index.json
git add recipes && git commit -m "Import samples" && git push
```

`.env` is git-ignored and must never be committed. The script never touches or
commits `./samples/`.

## v2 — books, filters & cost estimates

- **Upload PDFs & recipe photos** — as well as packets, you can upload a **PDF of a
  recipe book** or a **photo of a recipe**. PDFs are rendered page‑by‑page in the
  browser (pdf.js) and each page can yield **one or more recipes**.
- **Dish photo tiles** — if a finished‑dish photo is visible, it's cropped out and
  used as the card image; otherwise a food‑emoji tile is used.
- **Filters** — filter the grid by **dish type**, **cuisine**, **diet**
  (vegetarian/vegan/gluten‑free/…) and **exclude allergens**; sort A–Z or by cost.
- **Cost estimates & shopping lists** — pick a store (**ALDI / Coles / Woolworths /
  IGA**) to see an estimated **cost to make** and a **shopping list of suggested
  products** (whole packs + a total). Costs come from `recipes/prices.json`.

### About the prices

Prices live in `recipes/prices.json` and are **updated automatically every day** by
a GitHub Actions workflow (`.github/workflows/update-prices.yml`, ~4am Melbourne).
It can't run in the browser (CORS + supermarket bot‑protection), so it runs on
GitHub's servers, which have open internet, and commits the results.

**How a day's run works** (`scripts/update-prices.ts`, run locally with `npm run prices`):
1. A per‑store adapter (`scripts/stores/{woolworths,coles,aldi,iga}.ts`) searches
   each staple, picks the best match (home brand, closest size to the staple's
   `pack`, in stock, not a multipack) and saves its `productId` so future runs
   price the *same* product.
2. The product's price is **normalised to the staple's pack** (e.g. $/kg × pack g).
3. Each `stores[store]` entry gets `productId`, `url`, `size`, `unitPrice`,
   `onSpecial`, `wasPrice`, `lastChecked`, and `source: "live"`.
4. Every recipe's `costByStore` and `recipes/index.json` are recomputed.
5. The site redeploys (the update workflow calls `deploy.yml`).

**Reality check — which stores actually work:** ALDI and IGA expose JSON APIs (ALDI's
online range is limited; IGA is per‑store — set your store in
`scripts/stores/config.json`). Woolworths sits behind Akamai and Coles behind
Imperva; the adapters use Playwright with a warm‑up visit, but **Coles in
particular is often blocked from GitHub's datacenter IPs** and will simply keep the
last good price. See the per‑store status in the app's **Prices** tab and the
`match-report.md` artifact on each run.

**Safety:** a failed store never zeroes a price (the previous value + date are
kept); a jump of more than ±60% is rejected and logged; `updatedAt` and
`storeStatus` record each run.

**Fixing a bad match:** open `recipes/prices.json` and edit that store's
`productId` (to pin the right product) or `searchTerm` (to change what's searched),
then commit — or set `"locked": true` (or tap 🔒 in the **Prices** tab) to freeze a
manual price so the daily run never overwrites it. `recipe_base` and unmatched
items are left untouched. The `scripts/output/match-report.md` artifact from each
run lists every chosen product so you can spot mismatches.

**Run it manually:** GitHub → **Actions → Update prices → Run workflow**. You can
still edit prices by hand in the **Prices** tab and hit **Recompute recipe costs**.

### Why it runs on a self-hosted runner

GitHub's cloud runners use data-centre IPs, which **Coles (Imperva) and Woolworths
(Akamai) block**. From a **home/residential IP** they usually don't. So the
`update` job is set to `runs-on: [self-hosted]` — a runner you run on a machine at
home. (The deploy job stays on GitHub's cloud; it doesn't scrape.) ALDI is national
API pricing and works anywhere but only lists a small online range.

**Test locally first** (on the machine that will host the runner, i.e. your home
network):

```bash
npm ci
npx playwright install chromium
npm run prices                 # all stores; prints a per-store live/blocked table
npm run prices -- --stores=coles,woolworths   # just the tricky two
```

Nothing is committed by the local run's git unless you commit it; `prices.json` and
`recipes/` are updated in place so you can inspect the diff. If Coles/Woolies are
still challenged headless, try a visible browser or your installed Chrome:

```bash
PW_HEADED=1 npm run prices -- --stores=coles,woolworths
PW_CHANNEL=chrome npm run prices -- --stores=coles,woolworths
```

### Self-hosted runner setup

1. GitHub → repo **Settings → Actions → Runners → New self-hosted runner**. Pick
   your OS and follow the shown `download` + `./config.sh --url … --token …`
   commands (Windows: `config.cmd`).
2. Install it as a service so it starts on boot and runs overnight:
   - **macOS/Linux:** `./svc.sh install && ./svc.sh start`
   - **Windows:** choose "Run as a service" during `config.cmd`.
3. Keep the machine **awake overnight** (macOS: `caffeinate`, or Settings → Battery
   → prevent sleep; Windows: Power → Sleep → Never). The job runs ~4am.
4. Ensure Node 20 is installed on that machine (the workflow uses `setup-node`,
   which the self-hosted runner honours; otherwise install Node 20 yourself).
5. Security (the repo is public): **Settings → Actions → General → Fork pull request
   workflows → require approval for all outside collaborators**, and the workflow is
   deliberately limited to `schedule` + manual `workflow_dispatch` only (never
   `pull_request`), so no outside PR can run code on your machine.

Once the runner shows **Idle** in Settings → Actions → Runners, the daily job (and
**Run workflow**) will execute on it.

## Project layout

```
src/shared/    schema (zod), prompts, emoji tile, small utils  (app + script share these)
src/lib/       settings, github API, image compress, dish image, cache, recipes, pipeline
src/pages/     Home, Upload, Recipe, Edit, Settings
scripts/       import-samples.ts  (local Node import)
recipes/       the database (JSON + images)
.github/workflows/deploy.yml
```
