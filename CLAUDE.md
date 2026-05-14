# Newsfeed-generator

En VG-style nyhetsside som automatisk aggregerer, oppsummerer og kategoriserer
nyheter fra Microsoft-økosystemet (Intune, Entra, Defender, Copilot mfl.).

## Hva dette repoet er

- En **statisk Astro-side** som bygges av en pipeline som kjører i GitHub Actions
- Pipeline henter RSS/Atom-feeds, dedupliserer, og bruker `claude` CLI til å
  oppsummere + kategorisere hver nye artikkel
- Resultat publiseres til GitHub Pages hver 6. time

## Kommandoer

```bash
npm install              # Installer avhengigheter
npm run dev              # Start Astro dev-server på :4321
npm run build            # Bygg statisk side til dist/
npm run preview          # Forhåndsvis bygd side
npm run pipeline         # Kjør full pipeline: fetch → dedup → enrich → skriv data
npm run pipeline:fetch   # Bare hent feeds (skriver data/_raw.json)
npm run pipeline:enrich  # Bare berik via claude CLI (leser _raw, skriver articles.json)
npm run typecheck        # Astro check + tsc --noEmit
```

## Arkitektur

```
config/feeds.yaml              → kilder + tema-mapping
scripts/fetch-feeds.ts         → RSS/Atom → data/_raw.json (deduped mot articles.json)
scripts/enrich.ts              → kaller `claude --print` for sammendrag + score
scripts/pipeline.ts            → orkestrering (fetch → enrich → commit-ready)
data/articles.json             → "databasen" (committet til git)
src/                           → Astro: forside + temasider + artikkelsider
.github/workflows/build.yml    → cron hver 6. time + deploy til gh-pages
```

## Pipeline-detaljer

`scripts/enrich.ts` skriver en strukturert prompt og pipe-er rå artikler til
`claude --print --output-format json`. Claude returnerer JSON med:

```json
{
  "id": "...",
  "summary_no": "2-3 setninger på norsk",
  "headline_no": "Fengende norsk overskrift",
  "topic": "identitet" | "sikkerhet" | "endpoint" | "ai",
  "score": 0-100,
  "tags": ["intune", "byod", ...]
}
```

Score-heuristikk: 80+ = forsidens hero, 60-79 = mellomsak, <60 = "siste nytt".

## Temaer

| Slug | Navn på forsiden | Dekker |
|---|---|---|
| `identitet` | Identitet & Tilgang | Entra ID, CA, PIM, B2B/B2C, MFA |
| `sikkerhet` | Sikkerhet | Defender, Purview, MSRC, sårbarheter, Sentinel |
| `endpoint` | Endpoint | Intune, MDM, Autopilot, Windows 365, Cloud PC |
| `ai` | AI & Copilot | M365 Copilot, Copilot Studio, AI i admin-konsoller |

## Konvensjoner

- Pipeline-skripter er TypeScript kjørt med `tsx`, ESM, Node 22+
- Astro-komponenter på norsk i UI-tekst, engelske identifiers i koden
- `data/articles.json` er kanonisk kilde — committes til git, ingen ekstern db
- Aldri commit `data/_raw.json` eller `data/_pending.json` (er i .gitignore)
- Bilder lastes ned til `public/images/{id}.jpg` på pipeline-tid for stabilitet

## Gotchas

- `claude --print` krever `CLAUDE_CODE_OAUTH_TOKEN` env-var i Actions-runner
- RSS-feeds gir ofte HTML i `content` — strip til ren tekst før vi sender til Claude
- OG-bilder kan være 404; pipeline bør tåle manglende bilder og bare droppe `hero_image`
- GitHub Pages base path er `/newsfeed-generator/` — bruk Astro's `base` config konsekvent
- Pipeline må være idempotent: re-kjøring uten nye saker skal være no-op
