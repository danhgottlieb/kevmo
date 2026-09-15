# KevMo — One Man's Quest to Rate Every Beer

## Project Overview
A beer exploration website for Kevin, displaying ~6,000+ beers with ratings, styles, tasting notes, and more. Features 5 tabs: The Collection, Insights, Leaderboards, Trophy Case, and Play.

## Architecture
- **Frontend**: Single-page HTML/CSS/JS app (no framework)
- **Data source**: Excel file hosted on Dropbox (`Beer3.xlsx`, first tab "Beer")
- **Data loading**: `loader.js` fetches Excel via `/api/beer-data` proxy → parses with SheetJS → sets `BEER_DATA` global → loads `app.js`
- **Local dev server**: `server.js` (Express on port 8080) — proxies Dropbox to avoid CORS
- **Production**: Vercel (static site + serverless function)

## Key Files
| File | Purpose |
|------|---------|
| `index.html` | Main page structure, all 5 tab panels |
| `styles.css` | All styling, responsive breakpoints at 820px/480px/360px |
| `app.js` | All interactivity — filters, charts, leaderboards, achievements, games |
| `loader.js` | Fetches Excel from API, parses with SheetJS, bootstraps app |
| `data.js` | Fallback static data (used if Dropbox fetch fails) |
| `server.js` | Local Express dev server (port 8080) with Dropbox proxy |
| `api/beer-data.js` | Vercel serverless function — Dropbox proxy for production |
| `vercel.json` | Vercel config: no build, static site, outputDirectory "." |
| `site.webmanifest` | Installable-site metadata and home-screen icon definitions |
| `assets/` | Kevin images plus favicon, Apple touch, and install icons |

## Hosting & Deployment

### GitHub
- **Repo**: https://github.com/danhgottlieb/kevmo
- **Account**: `danhgottlieb` (personal Gmail account, NOT work account)
- **Branch**: `master`

### Vercel
- **Live URL**: https://kevmo.vercel.app
- **Project**: https://vercel.com/danhgottliebs-projects/kevmo
- **Account**: Signed up via `danhgottlieb` GitHub account
- **Auto-deploy**: NOT YET CONNECTED — need to install Vercel GitHub app (see below)

### How to Deploy Changes
1. Make edits to the code locally in `C:\Users\dagottl\kevmo`
2. Commit and push:
   ```
   cd C:\Users\dagottl\kevmo
   git add -A && git commit -m "description" && git push
   ```
3. Deploy to Vercel (until auto-deploy is set up):
   ```
   cd C:\Users\dagottl\kevmo && npx vercel deploy --prod
   ```

### To Enable Auto-Deploy (one-time setup)
1. Open a browser signed in as `danhgottlieb` on GitHub
2. Go to https://vercel.com → Project Settings → Git
3. Connect the `danhgottlieb/kevmo` repo
4. After this, every `git push` will auto-deploy — no manual `vercel deploy` needed

## Git Auth Notes
- `gh` CLI is normally authenticated as `dagottl_microsoft` (work account)
- The kevmo repo uses `danhgottlieb` credentials stored in git credential manager
- `git push` from the kevmo directory works without switching `gh` accounts
- If credentials expire, generate a new Fine-grained PAT from `danhgottlieb`:
  - https://github.com/settings/tokens?type=beta
  - Scope: `kevmo` repo only, Contents: Read & Write

## Local Development
```bash
cd C:\Users\dagottl\kevmo
npm install        # install Express
node server.js     # starts on http://localhost:8080
```

## Data Pipeline
- Source: Dropbox shared Excel (`Beer3.xlsx`)
- Dropbox link (dl=1): https://www.dropbox.com/scl/fi/0f3beusdcstafy7ynf5tj/Beer3.xlsx?rlkey=tzupj0ip8barsn48rhjqjzdat&st=cz2qy013&dl=1
- Columns: Beer, Brewery, City, State/Country, Style, ABV, Serving Type, Purchased, Rating, Simple Rating, Tasting Notes, Adjuncts, Hops, Barrel, Time
- To update data: edit the Excel in Dropbox — the site refreshes from it on each page load (cached 5 min via `s-maxage=300`)

## Previous Work (Session History)
- Built enrichment scripts to add Hops, Simple Rating, Adjuncts columns to Excel
- Integrated 6 Kevin photos throughout the site
- Built loading screen with Kevin sipping beer + animated bubbles
- Added Dropbox integration replacing static `data.js`
- Switched the live data source to `Beer3.xlsx` with 200 additional beer records and source-backed ABV/location/style enrichment
- Swapped the homepage and Leaderboards Kevin images; the homepage image also supplies the browser and home-screen icons
- Fixed filter bugs (DOM orphaning in updateResultCount, tab-switching logic)
- Mobile fixes: sticky tabs, removed "Dive In" overlay, removed "Try KevMo AI" link
