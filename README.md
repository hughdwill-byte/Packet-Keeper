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

### About the prices (important)

Prices are **estimates**, stored in `recipes/prices.json`, **not scraped live**.
Live direct‑from‑browser pricing isn't possible from a static site (CORS +
supermarket bot‑protection + terms of service), and ALDI/IGA barely publish prices
online. ALDI & IGA figures are estimates; IGA varies by store; ALDI cost excludes
items ALDI doesn't stock (e.g. the Mingle sachet).

**To refresh prices:** edit `recipes/prices.json` (each staple has a per‑store
`price` and `product`), commit, and push. Re‑open a recipe and hit **Save** in the
editor to recompute its cost, or costs recompute automatically the next time a
recipe is saved.

## Project layout

```
src/shared/    schema (zod), prompts, emoji tile, small utils  (app + script share these)
src/lib/       settings, github API, image compress, dish image, cache, recipes, pipeline
src/pages/     Home, Upload, Recipe, Edit, Settings
scripts/       import-samples.ts  (local Node import)
recipes/       the database (JSON + images)
.github/workflows/deploy.yml
```
