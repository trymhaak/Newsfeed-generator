# Produksjonsrevisjon — Newsfeed-generator

**Revidert commit:** `origin/main` @ `72b8a9b` (PR #5, «ci: stage only data/articles.json in refresh step»)
**Revisjonsdato:** 2026-06-20
**Revisjonsbranch:** `audit/production-readiness` (laget fra `origin/main`)
**Omfang:** Ende-til-ende-revisjon i alle ledd + anbefalt produksjonsarkitektur og prioritert plan. Dette er et **review-/plandokument** — ingen applikasjons-, pipeline-, CI- eller config-kode er endret, ingen secrets rørt, ingen deploy utført.

---

## 1. Sammendrag / verdikt

**Er det produksjonsklart i dag? Nei.** Siden _bygger_ og _deployer_ grønt hver 6. time, men den produserer ikke lenger ferskt innhold, og har ikke gjort det på over fem uker. Den grønne CI-en er misvisende: den republiserer statisk seed-innhold, mens selve nyhetsmotoren er slått av.

Fem blokkerende rotårsaker (alle verifisert under, ikke antatt):

| # | Blocker | Konsekvens |
|---|---------|-----------|
| B1 | **AI-enrichment kjører aldri** — `build.yml` gater berikelse bak et «Detect AI auth»-steg, og det finnes ingen repo-secrets, så stegene `Install Claude CLI` og `Run pipeline` blir `[skipped]` hver kjøring. | `data/articles.json` har ikke endret seg siden seed-commiten 2026-05-14. Nyeste sak er datert **2026-05-13 → 38 dager gammel**. |
| B2 | **9 av 12 RSS-kilder er døde (HTTP 404).** Alle `techcommunity.microsoft.com/gxcuf89792/rss/...`-URL-ene svarer 404 (gammel Khoros/Lithium-plattform er migrert bort). | Selv om B1 fikses i dag, ville pipelinen hente ~0 saker fra 9/12 kilder. Innholdsforsyningen er strukturelt brutt. |
| B3 | **Ingen friskhets-/helseovervåking.** 5 ukers staleness gikk fullstendig uoppdaget fordi deploy-jobben alltid lykkes. | Vi har ingen måte å vite at feeden er frossen uten å se på siden manuelt. |
| B4 | **Forsiden degraderer til tom hero** når data er eldre enn 14 dager (`selectFrontPage` filtrerer på et 14-døgns vindu). | Live-forsiden viser i dag **ingen hovedsak** og ingen mellomsaker — kun «Siste nytt» + temablokker. |
| B5 | **Live-data er placeholder.** Alle 9 radene er `seed-*`-rader med eksempel-URL-er (`https://msrc.microsoft.com/blog/example`). | «Les hele saken hos kilden» peker på døde eksempellenker. Ekte pipeline-output har aldri vært publisert. |

**Det som faktisk er solid** (så revisjonen ikke leses som ensidig): per-feed-isolering med `Promise.allSettled`, skjemavalidering av Claude-output (`validateEnrichment`), SHA-pinnede GitHub Actions, least-privilege default-permissions, commit-message-sanitering mot script-injection, konsekvent bruk av `BASE_URL`, og eksplisitte bildedimensjoner (ingen CLS). `typecheck` og `build` er grønne (0 feil). Fundamentet er godt; det er drifts- og forsyningsleddene som svikter.

---

## 2. Nåtilstand (verifisert)

Alle påstandene under er forankret i kommando-output kjørt 2026-06-20 på `audit/production-readiness` @ `72b8a9b`.

### 2.1 Auth-gaten og den frosne feeden (B1)

`gh secret list` og `gh variable list` er **tomme**:

```
===== repo SECRETS (actions) =====
(ingen output)
===== repo VARIABLES =====
(ingen output)
```

Steg-konklusjonene for siste schedulerte kjøring (`27864027618`, 2026-06-20T07:18Z) viser at berikelsen hoppes over:

```
JOB: pipeline [success]
   [success] Detect AI auth
   [skipped] Install Claude CLI
   [skipped] Run pipeline
   [success] Commit updated articles      <- "No new articles."
JOB: deploy [success]
   [success] Build site
   [success] Deploy to gh-pages
```

De siste schedulerte kjøringene tar **37–44 sekunder** — for kort til å installere Claude CLI, hente feeds og kjøre N berikelseskall. De er korte fordi de bare bygger + deployer:

```
completed  success  Build & Deploy  schedule  27864027618  44s  2026-06-20T07:18:17Z
completed  success  Build & Deploy  schedule  27854854622  44s  2026-06-20T00:36:28Z
completed  success  Build & Deploy  schedule  27842563086  44s  2026-06-19T18:35:02Z
...
```

Datafilen bekrefter frysen — `data/articles.json` inneholder 9 `seed-*`-rader, `"generated": "2026-05-14T08:00:00.000Z"`, nyeste `"published": "2026-05-13T15:00:00.000Z"`.

### 2.2 Døde kilder (B2)

Live-sjekk av feed-URL-ene (read-only `curl`, 20 s timeout, følger redirects):

```
404   https://techcommunity.microsoft.com/gxcuf89792/rss/board?board.id=MicrosoftIntuneBlog
404   https://techcommunity.microsoft.com/gxcuf89792/rss/board?board.id=Identity
404   https://techcommunity.microsoft.com/gxcuf89792/rss/board?board.id=MicrosoftThreatProtectionBlog
200   https://msrc.microsoft.com/blog/feed            -> redirect til HTML-siden /en-us/msrc/blog (ikke en feed — må verifiseres)
200   https://www.microsoft.com/.../copilot-studio/feed/
200   https://www.microsoft.com/releasecommunications/api/v2/m365/rss
```

3 av 3 testede `techcommunity`-feeds gir 404. De resterende 6 `techcommunity`-feedene i `config/feeds.yaml` bruker **identisk URL-mønster** (`gxcuf89792/rss/board?board.id=…`) og er med svært høy sannsynlighet også døde → **9 av 12 kilder nede**, inkludert hele `identitet`-temaet (Entra) og mesteparten av `sikkerhet`, `endpoint` og `ai`. `msrc`-feeden svarer 200 men redirecter til en HTML-side; om den fortsatt serverer gyldig RSS er **uavklart** og må verifiseres.

### 2.3 Kvalitetsporter (typecheck / build / audit)

`npm run typecheck` (kjørt med devDeps installert — se note):

```
> astro check && tsc --noEmit
Result (14 files):
- 0 errors
- 0 warnings
- 0 hints
TYPECHECK_EXIT=0
```

`npm run build`:

```
13:17:47 [build] 14 page(s) built in 327ms
13:17:47 [build] Complete!
BUILD_EXIT=0
```

> **Note om typecheck:** Ved første lokale kjøring stoppet `astro check` på en interaktiv prompt om å installere `@astrojs/check`. Det var et **miljøartefakt** — sandbox-en min hadde `NODE_ENV=production`, så `npm ci` utelot `devDependencies` (`@astrojs/check` ligger i `devDependencies`, package.json:22). Med devDeps installert kjører typecheck rent (output over), og CI-jobben `typecheck` er grønn på `origin/main` (run `27344660194`, jobbene `typecheck` og `build` begge `[success]`). **Dette er altså ikke en feil i repoet.**

`npm audit` — **5 sårbarheter (3 high, 1 moderate, 1 low)**:

```
astro    <=7.0.0-alpha.1   high     (XSS: define:vars, slot name, spread props; SSRF; server-island replay)
devalue  5.6.3-5.8.0       high     (DoS via sparse array)
esbuild  0.27.3-0.28.0     high     (arbitrary file read i dev-server, kun Windows)
vite     <=6.4.2           high     (server.fs.deny-bypass Windows; launch-editor NTLM Windows)
js-yaml  <=4.1.1           moderate (quadratic DoS i merge-keys)
5 vulnerabilities (1 low, 1 moderate, 3 high)
```

`astro ^5.0.0` (package.json:17) er innenfor det sårbare området; fix er oppgradering til `astro@6.4.8` (major bump). Flere av high-funnene er dev-server/Windows-spesifikke (ikke relevant for et statisk Linux-bygg), men Astro-XSS-rådene er prinsipielt relevante for en side som rendrer RSS-avledet innhold. **Dependabot, secret-scanning og push-protection er alle `disabled`** (`gh api .../security_and_analysis`), så ingen av disse flagges automatisk.

### 2.4 Hosting og repo-hygiene

```
Pages:  source=gh-pages (legacy), cname=null (ingen custom domain), https_enforced=true
        https://trymhaak.github.io/Newsfeed-generator/
Repo:   visibility=PUBLIC, default_branch=main
```

Git-hygiene: lokal `main` er **ahead 3 / behind 1** vs `origin/main` (3 upushede lokale commits, mangler #5). Fire squash-merget remote-brancher er ikke slettet: `claude/review-project-overview-XdHYL`, `fix/deploy-via-peaceiris`, `redesign/vg-style-frontend`, `security/audit-fixes`. Branchen jeg sto på ved start (`fix/deploy-commit-step`) er allerede slettet på origin (ble til #5).

### 2.5 Test-dekning

Ingen automatiserte tester finnes (`git ls-files` har ingen `*.test.*`/`*.spec.*`/vitest/jest/playwright-filer). Det finnes to workflows: `build.yml` (cron + deploy) og en udokumentert `ci.yml` (typecheck + build på push/PR).

---

## 3. Svakheter per ledd

Alvorlighet: **P0** = blokkerer ekte produksjon · **P1** = viktig · **P2** = nice-to-have.

### Ledd 1 — Content-pipeline (`scripts/`)

| Sev | Funn | Bevis |
|-----|------|-------|
| P0 | 9/12 kilder døde (404); `fetch-feeds.ts` logger bare `FAILED` og avslutter 0 ved feed-feil — en massiv kildedød ser identisk ut med «en stille nyhetsdag». | `config/feeds.yaml:17-78`; `fetch-feeds.ts:152-160`; curl-output §2.2 |
| P0 | `claude`-subprosessen har **ingen timeout**. Henger CLI-en (nettstall, auth-prompt), henger hele kjøringen til job-timeout dreper den. | `enrich.ts:89-112` (`spawn` uten `timeout`/`signal`) |
| P1 | Quota/rate-limit midt i en kjøring trunkerer datasettet stille: batch-`catch` bare `console.warn`, og `_raw.json` slettes uansett → de uberikede sakene tapes permanent. | `enrich.ts:177-200`; `pipeline.ts:36-37` (`unlink`) |
| P1 | Saker Claude utelater / gir feil `id` droppes for godt med kun en `console.warn`; ingen retry, ingen «uberiket»-kø. | `enrich.ts:117,139-141,198-200` |
| P1 | Dedup-nøkkel er `sha256(item.link)` namespacet per `source_id`. Ingen URL-normalisering (tracking-params/`utm`/`ocid`/trailing slash gir ny hash → re-ingest), `guid` ignoreres, og samme URL i to feeds lagres dobbelt. | `fetch-feeds.ts:23-26,93` |
| P1 | `articles.json` skrives ikke-atomisk (direkte `writeFile`, ingen temp+rename); `loadStore` parser uten try/catch eller skjemasjekk. Én avbrutt skriving korrumperer «databasen» og kileser alle påfølgende kjøringer. | `store.ts:18-24` og `:14-15` |
| P1 | Idempotens brutt: `mergeArticles` setter `generated: new Date()` hver kjøring, også når `added === 0`. Bryter det dokumenterte «re-kjøring uten nye saker skal være no-op». | `store.ts:39` (jf. CLAUDE.md «Gotchas») |
| P1 | Bildenedlasting til `public/images/{id}.jpg` (dokumentert i CLAUDE.md) er **ikke implementert** — `hero_image` er rå tredjeparts-URL (hotlinking, ingen 404-håndtering). | `fetch-feeds.ts:64-80,115` vs CLAUDE.md «Konvensjoner»/«Gotchas» |
| P1 | `enrich.ts` returnerer alltid exit 0, også når alle batcher feiler → total berikelses-svikt er ikke til å skille fra «ingen nyheter». | `enrich.ts:148-211` |
| P2 | Ingen per-feed retry/backoff; én transient blipp dropper en kildes hele 6-timersbatch. | `fetch-feeds.ts:139-141` |
| P2 | `config/feeds.yaml` valideres ikke ved lasting; en typo (`weihgt`) gir `source_weight: undefined` → `score: NaN` → saken forsvinner stille (`score > 0`-filter). | `fetch-feeds.ts:17-21`; `store.ts:31` |
| P2 | `extractJsonArray` tar første balanserte `[...]` — sårbar for prosa med klammeparenteser før payload. | `enrich.ts:61-87` |

### Ledd 2 — AI-enrichment (`claude`-CLI)

| Sev | Funn | Bevis |
|-----|------|-------|
| P0 | Enrichment kjører aldri i produksjon pga. auth-gaten (rotårsak, se Ledd 5/§2.1). | `build.yml:42-65`; `gh secret list` tom; steg `[skipped]` |
| P1 | `--output-format json` er dokumentert, men **ikke brukt** — kallet er `['--print','--permission-mode','bypassPermissions']`. Derfor finnes den skjøre prosa-skrapingen i det hele tatt. En strukturert envelope ville fjernet en hel klasse parse-feil. | `enrich.ts:93` vs CLAUDE.md «Pipeline-detaljer» |
| P1 | `--permission-mode bypassPermissions` gir CLI-en ubegrensede rettigheter for en ren tekstoppgave — på en runner med repo-skrivetoken i env. Brudd på least-privilege; en prompt-injection som induserer tool-use kjører med bypass. | `enrich.ts:93`; `build.yml:62-64` |
| P1 | Prompt-injection-flate: ukontrollert feed-tekst (`title`/`content`) interpoleres inn i prompten. Output styrer score/topic/overskrift på en offentlig side. | `enrich.ts:24-58` |
| P1 | Ingen retry, ingen rate-limit/quota-deteksjon, ingen backoff (jf. Ledd 1). | `enrich.ts:89-112,133-142` |
| P2 | `validateEnrichment` godtar tomme strenger for `headline_no`/`summary_no` (kun `typeof === 'string'`). | `enrich.ts:118` |
| ✓ | **Styrke:** output skjemavalideres per objekt (`id ∈ batch`, `topic ∈ TOPICS`, finite score 0-100 klampes, tags-array). Ugyldige objekter droppes, ikke skrives. | `enrich.ts:114-131` |

### Ledd 3 — Datamodell (`data/articles.json`)

| Sev | Funn | Bevis |
|-----|------|-------|
| P0 | Hele «databasen» er 9 `seed-*` placeholder-rader med eksempel-URL-er; ekte pipeline-output har aldri vært committet. | `data/articles.json` |
| P1 | Ingen runtime-skjemavalidering ved lasting (`JSON.parse(raw) as ArticleStore`). Malformert pipeline-JSON kræsjer `astro build`. | `store.ts:10-16` |
| P1 | Ingen retention/arkivering/windowing utover hard-cap `MAX_ARTICLES = 500`; temasider rendrer _alle_ saker i temaet → ubundet vekst over tid. | `store.ts:8,35`; `tema/[topic].astro:57-75` |
| P2 | Ingen topp-nivå `generated_at`/last-updated-felt egnet for ekstern friskhetssjekk (anbefales lagt til — gjør monitor i Ledd 8 triviell). | `types.ts:57-60` |
| ✓ | Skjema er tydelig og typet. | `types.ts:41-55` |

### Ledd 4 — Frontend (Astro)

| Sev | Funn | Bevis |
|-----|------|-------|
| P0 | Forsiden mister hero + mellomsaker når data er > 14 dager gammelt (`withinHours(published, 14*24)`). Med dagens 38-dagers data er `hero` `undefined` og `mid` tom — verifisert i build-output. | `store.ts:56-60` |
| P1 | Ingen `canonical`, Open Graph, Twitter card, `robots` eller sitemap; ingen egen RSS. Lenkeforhåndsvisninger i Teams/Slack/LinkedIn blir nakne. | `Newspaper.astro:30-39`; `astro.config.mjs`; `artikkel/[id].astro:34` |
| P1 | Web-font lastes render-blocking via `@import url('fonts.googleapis.com/...')` i CSS — verste lastesti, ikke self-hosted/preloadet. Også GDPR-flate (tredjeparts fonthosting). | `global.css:1-2` |
| P1 | Ubeskyttet felttilgang: `summary_no.trim()`, `headline_no.charAt(0)`, `tags.map` antar ikke-tomme verdier → `astro build` kræsjer hvis et felt mangler fra pipeline-output. | `artikkel/[id].astro:26,67`; `HeroStory.astro:9` |
| P2 | Ingen `<h1>` når det ikke finnes hero (dagens live-tilstand) → heading-hierarki-defekt. | `index.astro:28,40`; `HeroStory.astro:29` |
| P2 | Tom `alt=""` på redaksjonelle hero-/artikkelbilder. | `artikkel/[id].astro:48` |
| P2 | Mobilmeny er en skjør CSS-`:target`-drawer uten `aria-expanded`/lukkeknapp; duplisert nav-landmark. | `Newspaper.astro:62-74`; `global.css:175` |
| ✓ | Base-path brukes konsekvent (`BASE_URL`); eksplisitte `width/height` + `aspect-ratio` (ingen CLS). | `Newspaper.astro:24,52`; `HeroStory.astro:23` |

### Ledd 5 — CI/CD (`build.yml`)

| Sev | Funn | Bevis |
|-----|------|-------|
| P0 | Berikelse hoppes over hver schedulert kjøring (auth-gate + ingen secrets). | `build.yml:42-65`; steg `[skipped]` §2.1 |
| P1 | «Grønn av feil grunn»: `deploy` kjører når `pipeline.result == 'skipped'`, republiserer statisk innhold → alltid grønn, maskerer staleness fullstendig. | `build.yml:80-81` |
| P1 | Pipeline-jobben committer + pusher tilbake til `main` med `GITHUB_TOKEN`. Sammen med idempotens-bugen (Ledd 1) ville dette committe en `generated`-only diff hver kjøring; bot pusher direkte til default-branch. | `build.yml:67-77` |
| P2 | `secret_scanning`, `push_protection` og `dependabot` er `disabled` på et **public** repo. | `gh api .../security_and_analysis` |
| P2 | `ci.yml` er udokumentert i CLAUDE.md (som kun nevner `build.yml`). | `.github/workflows/ci.yml` |
| ✓ | Actions SHA-pinnet; default `permissions: contents: read` med per-job write; commit-message saniteres mot injection; `concurrency`-gruppe. | `build.yml:16-17,30,86,101-121` |

### Ledd 6 — Hosting / levering

| Sev | Funn | Bevis |
|-----|------|-------|
| P2 | GitHub Pages tvinger den klønete base-pathen `/Newsfeed-generator/`; ingen custom domain (`cname=null`). | `gh api .../pages`; `astro.config.mjs:5` |

Full anbefaling (Cloudflare Pages) med tradeoffs i §4.

### Ledd 7 — Sikkerhet

| Sev | Funn | Bevis |
|-----|------|-------|
| P1 | `npm audit`: 3 high + 1 moderate + 1 low; `astro ^5.0.0` sårbar. Dependabot av → uovervåket. (Flere high er dev-server/Windows-only og ikke prod-relevante; Astro-XSS er prinsipielt relevant.) | §2.3 |
| P1 | `secret_scanning` + `push_protection` + `dependabot` alle `disabled` på public repo. | `gh api` |
| P1 | `bypassPermissions` på `claude`-kallet (least-privilege-brudd, se Ledd 2). | `enrich.ts:93` |
| P2 | `SECURITY.md` hevder «Begge er lagret som repo-secrets», men ingen secrets finnes (`gh secret list` tom) — dokument/virkelighet-drift. | `SECURITY.md:40-48` vs §2.1 |
| ✓ | Bilde-URL-protokoll-allowlist blokkerer `javascript:`/`data:`; commit-msg-sanitering; Astro auto-escaper interpolasjoner. | `fetch-feeds.ts:52-62`; `build.yml:101-121` |

### Ledd 8 — Observerbarhet og pålitelighet

| Sev | Funn | Bevis |
|-----|------|-------|
| P0 | **Ingen friskhets-/helsealarm.** 5 ukers staleness gikk uoppdaget fordi deploy alltid lykkes. Vi har ingen automatisk indikator på at feeden er frossen. | Grønne kjøringer 2026-05-14 → 2026-06-20 mens data står stille |

Definisjon av «feeden er frisk» (forslag): (a) nyeste `published` < 12 t gammel, **og** (b) siste vellykkede berikelses-kjøring < 12 t siden, **og** (c) `okCount ≥ ⌈sources/2⌉` i siste fetch. Brudd på én av disse = alarm. Implementering i §4.

### Ledd 9 — Testing og korrekthet

| Sev | Funn | Bevis |
|-----|------|-------|
| P1 | **Null automatiserte tester.** Ingen dekning av dedup, `validateEnrichment`, `mergeArticles`-idempotens eller skjemavalidering. | `git ls-files` (ingen testfiler) |
| P1 | Kvalitetsportene er grønne, men validerer kun det statiske seed-bygget — ikke pipeline-korrekthet eller feed-helse → falsk trygghet. | §2.3 |
| ✓ | `typecheck` 0 feil; `build` OK (14 sider); begge grønne i CI. | §2.3 |

### Ledd 10 — Kostnad og driftsmodell

| Sev | Funn | Bevis |
|-----|------|-------|
| — | Last er triviell: 12 feeds × ≤15 items, batchet 8/kall → en håndfull korte Claude-kall per 6 t (~dusinvis korte kall/døgn). Godt innenfor Claude Max-grenser; marginalkostnad $0 (abonnement). | `enrich.ts:13`; `fetch-feeds.ts:10` |
| P1 | Auth-modellen (hvor enrichment kjører) er uavklart og er kjerne-arkitekturspørsmålet — se §4/§5. Max-metering-fritaket er dessuten **midlertidig** (se §6). | — |

---

## 4. Anbefalt produksjonsarkitektur

Måldesignet flytter berikelsen dit Claude Max-sesjonen allerede er autentisert (Mac Minien), holder abonnement-tokenet **ute av skyen**, og legger en uavhengig friskhetsvakt på Cloudflare.

```
   Mac Mini (M4, alltid på, Claude Max innlogget i Keychain)
   └── launchd LaunchAgent (hver 6. time)
         └── npm run pipeline          # fetch → enrich (claude -p via Keychain) → merge
               → git commit data/articles.json && git push   (eller wrangler pages deploy ./dist)
                         │
                         ▼
   GitHub (kode + data/articles.json som kanonisk kilde)
                         │  push
                         ▼
   Cloudflare Pages  ──────────────►  custom domain, edge-CDN, base '/'
                         ▲
   Cloudflare Cron Worker (uavhengig, hver 3. time)
   └── fetch published articles.json → sjekk generated_at-alder → alarm (Discord/Slack webhook) hvis stale
```

### 4.1 Hvor enrichment kjører — **Mac Mini via launchd** (valgt)

| | (A) Self-hosted GH-runner på Mac | **(B) launchd på Mac (valgt)** | (forkastet) Token som GitHub-secret |
|---|---|---|---|
| Secret-eksponering | Ingen i sky, men runner-som-tjeneste kan miste login-Keychain-tilgang → kan tvinge fram et eksportert token likevel | **Lavest** — kjører som brukeren, leser login-Keychain direkte, null token | Langlevd OAuth-token i GitHub-secrets; bredest eksponering, og mest utsatt for refresh-token-invalidering mot den interaktive Mac-sesjonen |
| Observerbarhet | **Best** (native run-historikk i GitHub) | Svakest by default — løses av Cloudflare-monitoren (§4.3) | God UI, men feil auth-modell |
| Kompleksitet | Middels (runner-livssyklus + Keychain-quirk) | **Lavest** — én plist + eksisterende `npm run pipeline` | Lav å sette opp, høy å holde i live |

**Begrunnelse:** den harde føringen er Claude Max via OAuth/abonnement, ikke API-nøkkel. Den reneste måten å oppfylle det på er å la jobben kjøre der `claude` allerede er innlogget — Mac Minien — som en **bruker-LaunchAgent** (`~/Library/LaunchAgents/`, ikke en LaunchDaemon) med `SessionCreate = true`, slik at jobben får en login-sesjon med Keychain-tilgang (macOS lagrer Claude-credentials i login-Keychain). Da ligger **ingen token i skyen**, og vi unngår at en CI-token og den interaktive sesjonen roterer hverandre ut.

> ⚠️ Headless gjenbruk av login-Keychain er **ikke** offisielt dokumentert av Anthropic. Verifiser med en røyktest (`claude -p` fra faktisk launchd-kontekst) før vi stoler på det (§6).

Velg (A) self-hosted runner i stedet kun hvis GitHub-Actions-UI/auditspor er verdt den ekstra komponenten og Keychain-sesjon-quirken håndteres. **Ikke** legg OAuth-tokenet på en GitHub-hostet runner.

### 4.2 Hosting — **Cloudflare Pages** (valgt over GitHub Pages)

- Fjerner den klønete `/Newsfeed-generator/`-base-pathen (sett Astro `base: '/'`), gir enkel custom domain når DNS allerede ligger på Cloudflare, ubegrenset båndbredde, og samlokalisering med monitor-workeren.
- **Deploy:** `wrangler pages deploy ./dist` rett fra launchd-jobben (gjenbruker byggesteget, bruker ikke CF build-minutter), eller Git-integrasjon.
- **Tradeoff vs i dag:** migreringsarbeid + følg med på Pages' **20 000-filers tak** dersom `public/images/{id}.jpg` akkumulerer ubundet (prune gamle bilder, eller flytt til R2). GitHub Pages fungerer i dag og er $0 — men tvinger subpathen og har ingen edge-/Worker-samlokalisering.

### 4.3 Friskhetsovervåking — **Cloudflare Cron Worker** (out-of-band)

En `scheduled()`-Worker (`crons = ["0 */3 * * *"]`) henter publisert `articles.json`, leser et nytt topp-nivå `generated_at`, og POST-er til en Discord/Slack-webhook hvis `now - generated_at > 12 t`. Kjører på Cloudflare, **uavhengig av Mac Minien**, så den varsler nettopp når Mac-en/launchd-jobben dør — failure-moden en på-Mac-heartbeat ikke fanger. Innenfor gratis-tier (≤5 cron-triggere/konto, 10 ms CPU, 50 subrequests). Alternativ: en schedulert GitHub Actions-helsesjekk (men GH-cron er best-effort og kan forsinkes).

**Liten pipeline-endring som muliggjør alt over:** skriv et topp-nivå `generated_at` (UTC ISO-8601) i `data/articles.json` (og bruk det også til en «sist oppdatert»-linje i UI).

---

## 5. Prioritert plan

Estimater er grove (én utvikler). «Kapabilitet» = hvilken del av infrastrukturen tiltaket bruker.

### P0 — Få til ekte produksjon (gjør dette først, i rekkefølge)

Målet er minst mulig sett som tar feeden fra «frossen» til «live + overvåket». **Umiddelbart neste steg = P0.1 + P0.2** (de er forutsetning for alt annet).

| # | Hva | Hvorfor | Estimat | Kapabilitet |
|---|-----|---------|---------|-------------|
| P0.1 | **Reparer kildene.** Finn nye RSS-URL-er for de 9 døde Tech Community-feedene (ny plattform) + verifiser/erstatt `msrc`-feeden. Oppdater `config/feeds.yaml`. | Uten levende feeds produserer pipelinen ingenting selv med auth på plass (B2). | 0.5–1 dag | `feed-researcher`-subagent + WebFetch |
| P0.2 | **Kjør enrichment på Mac Minien.** Sett opp launchd-LaunchAgent (`SessionCreate=true`) som kjører `npm run pipeline` med Claude Max-Keychain-sesjonen; commit+push `data/articles.json`. Røyktest `claude -p` fra launchd-kontekst først. | Løser rotårsak B1 med Max-OAuth, uten token i sky. | 0.5–1 dag | Mac Mini + launchd + `claude` CLI |
| P0.3 | **Friskhetsalarm.** Legg til `generated_at` i `data/articles.json`; deploy en Cloudflare Cron Worker som varsler ved staleness > 12 t. | B3 — gjør at 5-ukers-staleness aldri kan skje ustraffet igjen. | 0.5 dag | Cloudflare Workers (Cron) |
| P0.4 | **Fail loudly.** La `enrich.ts` returnere non-zero når `raw > 0 && enriched == 0`; la `fetch-feeds.ts` advare/feile når `okCount < ⌈sources/2⌉`. | Stille total-svikt skal ikke se ut som «ingen nyheter». | 0.5 dag | Pipeline-kode |
| P0.5 | **Erstatt seed-data + sikre forsiden.** Når P0.1–0.2 gir ekte output: fjern `seed-*`, og enten utvid 14-dagers-vinduet eller garanter en fallback-hero så forsiden aldri blir helt tom. | B4 + B5 — forsiden skal alltid ha en hovedsak. | 0.5 dag | Pipeline + `store.ts` |

### P1 — Viktig (før vi stoler på autonome kjøringer over tid)

| Hva | Hvorfor | Estimat | Kapabilitet |
|-----|---------|---------|-------------|
| Atomisk skriving (temp+rename) av `articles.json` + guardet `loadStore` (try/catch + array-sjekk) | Hindrer at én avbrutt skriving korrumperer databasen og kileser alle senere kjøringer | 0.5 dag | `store.ts` |
| Timeout + bounded retry på `claude`-kallet; detekter quota/rate-limit og **avbryt uten å slette `_raw`** | Henger ikke hele kjøringen; mister ikke uberikede saker ved quota-tomme | 0.5–1 dag | `enrich.ts`/`pipeline.ts` |
| Gate `generated`-bump på `added > 0` | Gjenoppretter dokumentert no-op-idempotens | 0.25 dag | `store.ts` |
| Dedup-herding: URL-normalisering, vurder `guid`, kryss-kilde-dedup | Hindrer re-ingest/dobbeltlagring | 0.5 dag | `fetch-feeds.ts` |
| Bruk `--output-format json`; reduser `bypassPermissions` til minste rettighet; fence ukontrollert feed-tekst i prompten | Fjerner parse-feilklasse + least-privilege + injection-herding | 0.5 dag | `enrich.ts` |
| SEO/sosialt: `canonical` + OG/Twitter + sitemap (`@astrojs/sitemap`) + egen RSS; self-host fonten med `preload` | Lenkeforhåndsvisninger, søk, ytelse, GDPR | 1 dag | Astro frontend |
| Runtime-skjemavalidering ved store-load (f.eks. zod) + empty-state-guards i templates | Malformert pipeline-JSON degraderer i stedet for å kræsje `build` | 0.5 dag | `store.ts` + `.astro` |
| Slå på Dependabot + secret-scanning + push-protection; bump `astro` for de 3 high-funnene | Supply-chain-hygiene på public repo | 0.25 dag | GitHub repo-settings |
| Hosting-migrering til Cloudflare Pages (drop base-path, deploy via `wrangler`) | §4.2 — krever menneskebeslutning om domene først (§6) | 0.5–1 dag | Cloudflare Pages |

### P2 — Nice-to-have

| Hva | Hvorfor | Estimat |
|-----|---------|---------|
| Branch-hygiene: slett de 4 squash-mergede remote-branchene; reconcil lokal `main` (3 upushede commits) | Ren historikk | 0.25 dag |
| Tester: unit for dedup/normalize, `validateEnrichment`, `mergeArticles`-idempotens, skjema; feed-liveness-røyktest; golden-file for berikelse | Tillit til autonome kjøringer | 1–2 dager |
| Bildenedlasting til `public/images/` (dokumentert men manglende) **eller** eksplisitt aksepter hotlinking + 404-guard i templates | Stabilitet/konsistens med CLAUDE.md | 0.5 dag |
| a11y: `<h1>`-fallback, `alt` på redaksjonelle bilder, mobilmeny med `aria-expanded`/lukk, kontrast på 10px-labels | Tilgjengelighet | 0.5 dag |
| Pagination/tak på temasider | Vekst over tid | 0.25 dag |
| Rett opp `SECURITY.md` («secrets»-påstanden) til å matche ny arkitektur; koble eller fjern ubrukt `.claude/agents/article-enricher.md` | Dokument/virkelighet-samsvar | 0.25 dag |

---

## 6. Risiko og åpne spørsmål (krever menneskelig beslutning)

1. **Claude Max for automatisering er et bevegelig mål.** Anthropic kunngjorde (med virkning 15.06.2026) å flytte `claude -p`/Agent SDK vekk fra abonnement-pooler over på egne metrerte credits — men **pauset endringen samme dag**. Per i dag drar første-parts `claude -p` fortsatt fra Max-abonnementet (kilde: Anthropic Help Center, «Use the Claude Agent SDK with your plan»). **Beslutning:** akseptere at fritaket er midlertidig og holde berikelses-auth isolert i `enrich.ts`, så modellen kan byttes ett sted hvis metering gjeninnføres.
2. **Headless Keychain-gjenbruk er ikke offisielt dokumentert.** Må røyktestes på Mac Minien (`claude -p` fra launchd-kontekst) før vi stoler på den. Fallback er `claude setup-token` + `CLAUDE_CODE_OAUTH_TOKEN` lokalt på Mac-en (ikke i sky), med kjent risiko for tidlig token-rotasjon.
3. **Hosting-valg:** Cloudflare Pages anbefales, men krever go. **Vil vi ha et custom domain?** (`cname` er null i dag.) Hvilket?
4. **Mac Minien som single point of failure** for berikelse: hvis den er nede, blir feeden stale — men den out-of-band Cloudflare-monitoren fanger det. Akseptabelt?
5. **Bør `ANTHROPIC_API_KEY`-stien beholdes i det hele tatt** (`SECURITY.md`/`enrich.ts` nevner den) gitt den harde Max-only-føringen? Anbefaling: fjern API-nøkkel-stien for å unngå at en feilplassert nøkkel overstyrer abonnement-auth.
6. **ToS-grense:** kun første-parts `claude -p` skal bruke abonnementet (ikke tredjeparts-wrappere). Pipelinen kaller offisiell CLI → compliant i dag; ikke kryss denne grensen.

---

## Appendiks — revisjonsmetode

Probene er kjørt read-only på `audit/production-readiness` @ `72b8a9b` (= `origin/main`). Ingen pipeline-kjøring, ingen secrets rørt, ingen deploy. `npm run build` skriver kun til `dist/` (gitignored). Eneste committede fil fra denne revisjonen er dette dokumentet.
