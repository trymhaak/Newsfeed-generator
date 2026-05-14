# Newsfeed-generator

En automatisk-generert, VG-style nyhetsside for Microsoft-økosystemet
(Intune, Entra, Defender, Purview, Copilot mfl.).

Pipelinen henter RSS/Atom fra offisielle Microsoft-feeds, bruker `claude` CLI
til å oppsummere og kategorisere nye saker, og publiserer en statisk side til
GitHub Pages — hver 6. time.

## Hva er nytt vs. en PDF?

- **Forsiden prioriterer** for deg: storsak øverst, mellomsaker, "siste nytt"
- **Tema-undersider** for Identitet, Sikkerhet, Endpoint og AI & Copilot
- **Norske sammendrag** av engelske kilder — 2-3 setninger per sak
- **Klikkbart hele veien** — alltid lenke til original kilde

## Lokal utvikling

```bash
npm install
npm run dev       # Astro dev på :4321
npm run build     # Statisk build → dist/
npm run pipeline  # Hent feeds → berik via Claude → oppdater data/articles.json
```

For å kjøre `pipeline` lokalt må du ha `claude` CLI installert og innlogget,
eller sette `ANTHROPIC_API_KEY` i miljøet.

## Oppsett

GitHub Pages aktiveres automatisk av workflowen første gang den kjører
(`actions/configure-pages` med `enablement: true`) — ingen manuell UI-config
nødvendig.

Workflowen kjører cron hver 6. time. Første kjøring trigges automatisk når
PR merges til `main` (push-trigger), eller manuelt via Actions-fanen → "Run
workflow".

### AI-auth (valgfritt)

Pipelinen kjører i to moduser:

- **Med auth**: Henter feeds + beriker via Claude. Trenger én av:
  - `CLAUDE_CODE_OAUTH_TOKEN` — generer ved å kjøre `/install-github-app` i
    Claude Code lokalt; tokenet legges automatisk inn som repo-secret.
  - `ANTHROPIC_API_KEY` — legg inn manuelt i Settings → Secrets → Actions.

- **Uten auth**: Workflowen detekterer at ingen nøkkel er satt, hopper over
  enrichment-steget, og bygger siden med eksisterende data. Bra for å teste
  byggeflyt før du legger inn nøkkelen.

## Struktur

Se [CLAUDE.md](./CLAUDE.md) for arkitektur og konvensjoner.
