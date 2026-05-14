# Sikkerhetspolicy

## Rapportere sårbarheter

Hvis du oppdager en sikkerhetssårbarhet i Newsfeed-generator, vennligst
**ikke** rapporter den via offentlig issue. I stedet, bruk én av disse:

- **GitHub privat advisory**: Gå til
  https://github.com/trymhaak/Newsfeed-generator/security/advisories
  og klikk "Report a vulnerability"
- **E-post**: Bruk noreply-adressen på din GitHub-profil for kontakt

Inkluder i rapporten:
- Beskrivelse av sårbarheten
- Reproduksjonssteg
- Potensiell påvirkning
- Forslag til fix (om mulig)

Du kan forvente en bekreftelse innen 7 dager og en oppdatering om
status innen 30 dager.

## Hva som er innenfor scope

Som et automatisk generert statisk nyhetsoversikt har vi følgende
sikkerhets-fokusområder:

- **GitHub Actions-workflow**: script-injeksjon, kompromittert tredjeparts-action
- **Pipeline-script** (`scripts/`): injeksjon via RSS-innhold, command-injeksjon
- **Frontend-rendering**: XSS via RSS-innhold som ikke escapes
- **Secret-handling**: utilsiktet logging eller eksponering av tokens

## Hva som er utenfor scope

- Sårbarheter i tredjeparts RSS-feeds vi henter fra (kontakt feed-eier)
- Sårbarheter i GitHub Pages-infrastrukturen (kontakt GitHub)
- Sårbarheter i Microsoft-produktene vi rapporterer om (kontakt MSRC)

## Auth-modell

Pipelinen kjører i GitHub Actions og bruker enten:
- `CLAUDE_CODE_OAUTH_TOKEN` (Claude Code OAuth-token), eller
- `ANTHROPIC_API_KEY` (Anthropic API-nøkkel)

Begge er lagret som repo-secrets. Hvis du tror disse er kompromittert,
roter dem umiddelbart via Anthropic-konsollet og oppdater secret i
Settings → Secrets and variables → Actions.
