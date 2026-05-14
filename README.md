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

For å kjøre `pipeline` lokalt må du ha `claude` CLI installert og innlogget.

## Oppsett av GitHub Pages

1. Push branch til GitHub
2. Settings → Pages → Source: "GitHub Actions"
3. Settings → Secrets → Actions: legg til `CLAUDE_CODE_OAUTH_TOKEN`
   (genereres ved `/install-github-app` i Claude Code lokalt)
4. Workflowen kjører cron hver 6. time, eller manuelt via "Run workflow"

## Struktur

Se [CLAUDE.md](./CLAUDE.md) for arkitektur og konvensjoner.
