# Microsoft-ecosystem source research — 2026-06-20

**Branch:** `research/microsoft-sources` · **Scope:** strictly Microsoft IT / security / admin / Copilot · **Schema:** unchanged (`id / name / url / topic / weight`, topics `identitet | sikkerhet | endpoint | ai`).

This catalog proposes **net-new** feeds for the Newsfeed-generator. It does **not** touch `config/feeds.yaml`; the ready-to-merge snippet lives in `config/feeds.candidates.yaml` (reproduced below).

## Summary

| | count |
|---|---|
| Candidate URLs discovered & curl-tested | 100+ |
| **Validated → ready-to-merge** (`feeds.candidates.yaml`) | **49** |
| — official Microsoft | 20 |
| — community / MVP (Microsoft-focused) | 29 |
| Rejected / needs-work (evidence + reason in Appendix B) | 34 |
| Other integratable non-board source types (Appendix A) | 9 classes |

Validated split by topic: **identitet** 14 · **sikkerhet** 13 · **endpoint** 20 · **ai** 2. None duplicates the 11 sources already in `config/feeds.yaml`.

---

## Methodology

**Discovery.** Three parallel research passes were run and then *every* URL they produced was independently curl-proven here (nothing was pattern-filled or trusted on a researcher's say-so):
1. Official **Tech Community** blog boards (post-migration `board.id` values), across endpoint / identity / security / AI / collaboration.
2. Official **non-Tech-Community** feeds on `microsoft.com`, `azure.microsoft.com`, `devblogs.microsoft.com`, `blogs.windows.com`, plus API feeds (Azure Updates, MSRC, Graph changelog, Microsoft Learn, GitHub releases).
3. **Community / MVP** blogs that cover *only* Microsoft, cross-referenced against the `merill/awesome-entra` list and Feedspot's SCCM directory.

**Validation standard (mandatory, applied to every ready-to-merge feed).** For each URL I ran:

```
curl -sSL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" "<url>"
```

and required **all** of:
1. **HTTP 200**.
2. Root element is **`<rss>` or `<feed>`** — real XML, not an HTML error/login page.
3. **≥ 10** `<item>` / `<entry>` elements.
4. A **recent latest-item date** — parsed from the *first item/entry*, **not** the channel build-time. (`~90 days` was the "still alive" line; older → Rejected/needs-work.)

Recorded per feed: item count + latest item **title** and **pubDate**. This matches what makes a feed valid for *this* pipeline: `scripts/fetch-feeds.ts` parses with `rss-parser`, **requires a browser User-Agent** (Tech Community 403s otherwise), and **treats a 0-item feed as a failure** (a renamed board returns HTTP 200 + an empty "Resource Not Found" feed).

**Validation-trap found & handled.** Tech Community RSS sets the *channel* `<pubDate>` to the current server time, so a naive date read makes every TC feed look "updated today." Reading the **first item's** date instead immediately exposed three dead-but-200 TC boards (`sbs` last post 2023, `DefenderExternalAttackSurfaceMgmtBlog` 2024, `DefenderThreatIntelligence` Nov-2025) — all correctly rejected.

**Spot-check (raw curl, two feeds).**

```
office365itpros.com/feed/   → <item> count = 100
  <pubDate>Fri, 19 Jun 2026 07:00:00 +0000   (then 18, 17, 16, 15 Jun — daily cadence)
exchange (Tech Community)   → <item> count = 20
  <pubDate>Fri, 19 Jun 2026 12:22:17 GMT  Mon, 15 Jun  Tue, 16 Jun  Tue, 19 May …
  (first <pubDate> Sat 20 Jun 15:23 = channel build-time, confirming the trap above)
```

---

## Validated catalog (ready-to-merge)

Type = official | community. Weight bands: official MS 0.8–1.0, community/MVP 0.6–0.8. All evidence captured 2026-06-20, HTTP 200 + `<rss>`/`<feed>` root.

### identitet — Entra ID, Conditional Access, PIM, B2B/B2C, MFA, hybrid identity

| id | name | type | wt | items | latest item · date | covers |
|---|---|---|---|---|---|---|
| `entra-identity-platform` | Microsoft Entra Identity Platform (devblogs) | official | 0.8 | 10 | "GA: Refresh Token Transfer to Apple Watch in Entra External ID Native Auth" · 29 Apr 2026 | auth/MSAL/External ID/token & CA platform changes |
| `office365-itpros` | Office 365 for IT Pros (Tony Redmond) | community | 0.75 | 100 | "Entra ID Tightens Conditional Access Processing for Baseline Scopes" · 19 Jun 2026 | daily deep M365/Entra/Teams/PowerShell/Copilot |
| `vasil-michev` | Vasil Michev — Michev.info | community | 0.75 | 30 | "Converting Get-MailboxFolderStatistics ids for the Graph API" · 6 Jun 2026 | M365/Graph/Exchange/Entra PowerShell |
| `dirteam-berkouwer` | Sander Berkouwer — dirteam | community | 0.75 | 25 | "A critical vulnerability was resolved in Veeam Backup & Replication…" · 10 Jun 2026 | Entra/AD/hybrid identity (use non-www host) |
| `ourcloudnetwork` | Our Cloud Network (Daniel Bradley) | community | 0.7 | 10 | "One Person One License philosophy for Microsoft Entra Update" · 17 Jun 2026 | Entra/Intune/Graph PowerShell |
| `janbakker` | JanBakker.tech | community | 0.7 | 10 | "Domainless SAML federation in Microsoft Entra External ID" · 19 May 2026 | Entra CA/passkeys/External ID/Graph |
| `alitajran` | ALI TAJRAN | community | 0.7 | 10 | "How to Remove Unlock Teams Premium Button in Microsoft Teams" · 10 Jun 2026 | Exchange/AD/Entra step-by-steps |
| `hybridbrothers` | Hybrid Brothers | community | 0.7 | 45 | "European Cloud & AI Summit" · 7 May 2026 | Entra/hybrid identity/Defender (feed at /index.xml) |
| `goodworkaround` | Good Workaround! (Marius Solbakken) | community | 0.7 | 10 | "Diving into the SCIM API available Entra ID" · 1 Apr 2026 | Entra provisioning/SCIM/Graph internals (low cadence) |
| `smbtothecloud` | SMBtotheCloud | community | 0.65 | 10 | "Huntress Intune Launchpad – Automate Huntress Deployment for Intune" · 7 May 2026 | M365/Entra/Intune automation for SMB |
| `damienbod` | damienbod — Software Engineering | community | 0.6 | 10 | "Software development and AI" · 15 Jun 2026 | Entra/OAuth/OIDC/ASP.NET auth (dev-leaning) |
| `thatlazyadmin` | ThatLazyAdmin | community | 0.6 | 12 | "Why Most Joiner-Mover-Leaver Processes in M365 Are Still Broken" · 25 May 2026 | M365/Entra/PowerShell admin |
| `admindroid` | AdminDroid Blog | community | 0.6 | 10 | "Entra ID Adds New Service Plans for Agent Conditional Access…" · 18 Jun 2026 | M365/Entra/Defender admin reporting (vendor) |
| `o365reports` | Office 365 Reports (AdminDroid) | community | 0.6 | 10 | "Get AD Users' Password Expiration Date Using PowerShell" · 16 Jun 2026 | M365 reporting/PowerShell (sister of AdminDroid) |

### sikkerhet — Defender, Sentinel, Purview, MSRC, vulnerabilities, baselines

| id | name | type | wt | items | latest item · date | covers |
|---|---|---|---|---|---|---|
| `defender-endpoint` | Microsoft Defender for Endpoint Blog | official | 0.9 | 20 | "Reduce unnecessary internet exposure with Microsoft Defender" · 11 Jun 2026 | MDE / EDR |
| `defender-office365` | Microsoft Defender for Office 365 Blog | official | 0.9 | 20 | "Defender for Office 365 Plan 1 rolling out to M365 E3 / Office 365 E3" · 18 Jun 2026 | email/collab threat protection |
| `msrc-update-guide` | MSRC Security Update Guide (RSS) | official | 0.9 | 4323 | "CVE-2025-5791 Users: `root` appended to group listings" · 20 Jun 2026 | authoritative CVE feed — **HIGH VOLUME** |
| `core-infra-security` | Core Infrastructure and Security Blog | official | 0.85 | 20 | "Check This Out! (CTO!) Guide (May/June 2026)" · 18 Jun 2026 | Windows Server/AD/PKI security |
| `security-baselines` | Microsoft Security Baselines Blog | official | 0.85 | 20 | "Security Review for Microsoft Edge version 149" · 8 Jun 2026 | official security baselines |
| `defender-vuln-mgmt` | Defender Vulnerability Management Blog | official | 0.85 | 20 | "Introducing the updated exposure score in MDVM" · 31 May 2026 | vuln/exposure mgmt |
| `security-copilot` | Microsoft Security Copilot Blog | official | 0.85 | 20 | "From alert overload to decisive action: Security Copilot agents" · 21 Apr 2026 | AI for SecOps (could map `ai`) |
| `azure-network-security` | Azure Network Security Blog | official | 0.8 | 20 | "A deep dive into Azure Bastion session recording" · 11 Jun 2026 | Azure Firewall/DDoS/Bastion/WAF |
| `security-experts` | Microsoft Security Experts Blog | official | 0.8 | 20 | "EDR coexistence by design: A practical starting point to Defender" · 30 Apr 2026 | MDR / Defender Experts |
| `security-community` | Microsoft Security Community Blog | official | 0.8 | 20 | "Microsoft Leads a New Era of Software Supply Chain Transparency" · 16 Jun 2026 | post-migration umbrella security blog |
| `jeffrey-appel` | Jeffrey Appel — Microsoft Security | community | 0.75 | 10 | "Closing the Azure AD Graph Visibility Gap (AADGraphActivityLogs)" · 15 Jun 2026 | Defender XDR/Sentinel/Entra security |
| `albert-hoitingh` | Albert Hoitingh — InfoSec & Compliance | community | 0.7 | 10 | "Understanding Agent 365: Governance for AI Agents" · 5 Jun 2026 | Purview/labels/compliance/AI governance |
| `cloudbrothers` | Cloudbrothers (Fabian Bader) | community | 0.7 | 10 | "Now You See Me: AADGraphActivityLogs" · 10 May 2026 | Defender/Entra/KQL detections (feed at /index.xml) |

### endpoint — Intune, MDM, Autopilot, Windows, Cloud PC, Surface, infra

| id | name | type | wt | items | latest item · date | covers |
|---|---|---|---|---|---|---|
| `azure-virtual-desktop` | Azure Virtual Desktop Blog | official | 0.9 | 20 | "AVD supports greater application and identity functionality…" · 2 Jun 2026 | AVD / Cloud PC |
| `surface-it-pro` | Surface IT Pro Blog | official | 0.85 | 20 | "Inside the new Intel-powered Surface portfolio: A deep dive" · 21 May 2026 | Surface device mgmt for IT |
| `windows-os-platform` | Windows OS Platform Blog | official | 0.85 | 20 | "Share the Moment: Listen Together with Shared Audio" · 27 May 2026 | Windows client OS platform |
| `windows-insider` | Windows Insider Blog | official | 0.8 | 300 | "Announcing new builds for 19 June 2026, version 26H2 (Experimental)" · 19 Jun 2026 | Insider Preview builds — **HIGH VOLUME** |
| `windows-server` | Windows Server News and Best Practices | official | 0.8 | 20 | "Opt-In Windows Server 2025 Feature Update from WS 2022/2019…" · 29 Apr 2026 | Windows Server (infra-leaning) |
| `windows-networking` | Windows Networking Blog (Core Networking) | official | 0.8 | 20 | "DoH is now generally available on Windows DNS Server" · 11 Jun 2026 | Windows DNS/DHCP/DoH (infra-leaning) |
| `fasttrack` | Microsoft FastTrack Blog | official | 0.8 | 20 | "Microsoft 365 Copilot on mobile: What staged rollout plans can miss" · 2 Jun 2026 | M365 deployment/adoption |
| `windows-admin-center` | Windows Admin Center Blog | official | 0.75 | 20 | "WAC: Virtualization Mode public preview build updated!" · 11 Jun 2026 | WAC server mgmt (infra-leaning) |
| `msendpointmgr` | MSEndpointMgr | community | 0.75 | 10 | "EPM Part 1: The End of Local Admin…" · 15 Jun 2026 | Intune/ConfigMgr/EPM (top-tier) |
| `oofhours` | Out of Office Hours (Michael Niehaus) | community | 0.75 | 50 | "Windows 11 26H2 will be an enablement package" · 19 Jun 2026 | Autopilot/Windows/Intune |
| `petervanderwoude` | All about Microsoft Intune (P. van der Woude) | community | 0.75 | 10 | "Turning off account notifications in Start and multi-app kiosk mode" · 15 Jun 2026 | Intune/Autopilot/ConfigMgr |
| `call4cloud` | Call4Cloud (Rudy Ooms) | community | 0.7 | 10 | "Autopatch Client Broker Fails During Autopilot Pre-Provisioning" · 15 Jun 2026 | Intune/Autopilot/Autopatch |
| `mobile-jon` | Mobile Jon's Blog | community | 0.7 | 10 | "Managing Secure Boot Certificate Lifecycle with Intune" · 28 May 2026 | Intune/AVD/PIM architecture |
| `niallbrady` | Just Another Windows Noob (Niall Brady) | community | 0.7 | 20 | "update for Windows 365 Cloud PC via USB-C on an iPhone 15/16/17" · 5 Jun 2026 | ConfigMgr/Intune/OSD/W365 |
| `ccmexec` | CCMEXEC (Jörgen Nilsson) | community | 0.7 | 10 | "Microsoft Intune Endpoint Privilege Management – Overview" · 14 Jun 2026 | ConfigMgr/Intune/EM |
| `mikemdm` | Mike's MDM Blog | community | 0.7 | 15 | "Inventory locally running VMs in VMware or Hyper-V" · 14 Jun 2026 | Intune/MDM automation |
| `andrew-taylor` | Andrew Taylor (andrewstaylor.com) | community | 0.65 | 10 | "Intune Newsletter – 19th June 2026" · 19 Jun 2026 | Intune/Graph PowerShell + newsletter |
| `prajwal-desai` | Prajwal Desai | community | 0.65 | 10 | "KB38232642 Security Update for ConfigMgr Console Extension" · 18 Jun 2026 | Intune/SCCM/Windows 11 |
| `thomas-maurer` | Thomas Maurer | community | 0.6 | 10 | "Speaking at the Microsoft Digital Sovereignty Day – Zurich 2026" · 17 Jun 2026 | Azure/Arc/Windows Server (infra-leaning) |
| `danielengberg` | Daniel Engberg — Endpoint Management | community | 0.6 | 10 | "Endpoint Management Newsletter – June 1–14, 2026" · 14 Jun 2026 | biweekly Intune/ConfigMgr roundup |

### ai — M365 Copilot, Copilot Studio, AI in admin consoles

| id | name | type | wt | items | latest item · date | covers |
|---|---|---|---|---|---|---|
| `m365-blog` | Microsoft 365 Blog (official) | official | 0.8 | 10 | "Copilot Cowork is now generally available" · 16 Jun 2026 | broad M365, currently Copilot-heavy |
| `handsontek` | HANDS ON tek (João Ferreira) | community | 0.7 | 30 | "Copilot Cowork Pricing: Real Costs, Risks & Free Alternatives" · 18 Jun 2026 | SharePoint/Teams/Copilot extensibility |

> Note: `ai` is intentionally thin here — the two strongest official AI boards (`Microsoft365CopilotBlog`, `copilot-studio`) are already integrated. `security-copilot` (above) is the other obvious AI source but is filed under `sikkerhet` for its SecOps audience.

---

## Ready-to-merge snippet (`config/feeds.candidates.yaml`)

> Reproduced for review. The canonical file is `config/feeds.candidates.yaml`. **Cost note:** the live pipeline runs every 5 min and calls `claude` per *new* article, so merging all 49 multiplies enrichment cost — feeds are ordered best-first within each topic; enable the subset you want (or set `enabled: false` on the rest). `msrc-update-guide` (4000+ CVEs) and `windows-insider` (300 items) are the highest-volume — consider `enabled: false` until tuned.

```yaml
feeds:
  # ===== IDENTITET =====
  - id: entra-identity-platform     # Entra auth/MSAL/External ID/token & CA platform (dev-leaning, official)
    name: Microsoft Entra Identity Platform (devblogs)
    url: https://devblogs.microsoft.com/identity/feed/
    topic: identitet
    weight: 0.8
  - id: office365-itpros            # Tony Redmond — daily deep M365/Entra/Teams/PowerShell/Copilot
    name: Office 365 for IT Pros (Tony Redmond)
    url: https://office365itpros.com/feed/
    topic: identitet
    weight: 0.75
  - id: vasil-michev               # M365/Graph/Exchange/Entra PowerShell (Michev MVP)
    name: Vasil Michev — Michev.info
    url: https://www.michev.info/feed/
    topic: identitet
    weight: 0.75
  - id: dirteam-berkouwer          # Entra/AD/hybrid identity (use non-www host)
    name: Sander Berkouwer — The things that are better left unspoken
    url: https://dirteam.com/sander/feed/
    topic: identitet
    weight: 0.75
  - id: ourcloudnetwork            # Entra/Intune/Graph PowerShell
    name: Our Cloud Network (Daniel Bradley)
    url: https://ourcloudnetwork.com/feed/
    topic: identitet
    weight: 0.7
  - id: janbakker                  # Entra CA/passkeys/External ID/Graph
    name: JanBakker.tech
    url: https://janbakker.tech/feed/
    topic: identitet
    weight: 0.7
  - id: alitajran                  # Exchange/AD/Entra step-by-steps
    name: ALI TAJRAN
    url: https://alitajran.com/feed/
    topic: identitet
    weight: 0.7
  - id: hybridbrothers             # Entra/hybrid identity/Defender (static-site /index.xml)
    name: Hybrid Brothers
    url: https://hybridbrothers.com/index.xml
    topic: identitet
    weight: 0.7
  - id: goodworkaround             # Entra provisioning/SCIM/Graph internals (low cadence)
    name: Good Workaround! (Marius Solbakken)
    url: https://goodworkaround.com/feed/
    topic: identitet
    weight: 0.7
  - id: smbtothecloud             # M365/Entra/Intune automation for SMB
    name: SMBtotheCloud
    url: https://smbtothecloud.com/feed/
    topic: identitet
    weight: 0.65
  - id: damienbod                  # Entra/OAuth/OIDC/ASP.NET auth (dev-leaning)
    name: damienbod — Software Engineering
    url: https://damienbod.com/feed/
    topic: identitet
    weight: 0.6
  - id: thatlazyadmin              # M365/Entra/PowerShell admin
    name: ThatLazyAdmin
    url: https://thatlazyadmin.com/feed/
    topic: identitet
    weight: 0.6
  - id: admindroid                 # M365/Entra/Defender admin reporting (vendor)
    name: AdminDroid Blog
    url: https://blog.admindroid.com/feed/
    topic: identitet
    weight: 0.6
  - id: o365reports                # M365 reporting/PowerShell (AdminDroid sister site)
    name: Office 365 Reports (AdminDroid)
    url: https://o365reports.com/feed/
    topic: identitet
    weight: 0.6

  # ===== SIKKERHET =====
  - id: defender-endpoint
    name: Microsoft Defender for Endpoint Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftDefenderATPBlog
    topic: sikkerhet
    weight: 0.9
  - id: defender-office365
    name: Microsoft Defender for Office 365 Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftDefenderforOffice365Blog
    topic: sikkerhet
    weight: 0.9
  - id: msrc-update-guide          # authoritative CVE feed — HIGH VOLUME (4000+), consider enabled:false until tuned
    name: MSRC Security Update Guide (RSS)
    url: https://api.msrc.microsoft.com/update-guide/rss
    topic: sikkerhet
    weight: 0.9
  - id: core-infra-security        # camelCase board.id
    name: Core Infrastructure and Security Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=CoreInfrastructureandSecurityBlog
    topic: sikkerhet
    weight: 0.85
  - id: security-baselines
    name: Microsoft Security Baselines Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=microsoft-security-baselines
    topic: sikkerhet
    weight: 0.85
  - id: defender-vuln-mgmt
    name: Microsoft Defender Vulnerability Management Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=Vulnerability-Management
    topic: sikkerhet
    weight: 0.85
  - id: security-copilot           # AI for SecOps (could map ai)
    name: Microsoft Security Copilot Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=securitycopilotblog
    topic: sikkerhet
    weight: 0.85
  - id: azure-network-security
    name: Azure Network Security Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=AzureNetworkSecurityBlog
    topic: sikkerhet
    weight: 0.8
  - id: security-experts
    name: Microsoft Security Experts Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftSecurityExperts
    topic: sikkerhet
    weight: 0.8
  - id: security-community         # post-migration umbrella security blog
    name: Microsoft Security Community Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=microsoft-security-blog
    topic: sikkerhet
    weight: 0.8
  - id: jeffrey-appel              # Defender XDR/Sentinel/Entra security
    name: Jeffrey Appel — Microsoft Security
    url: https://jeffreyappel.nl/feed/
    topic: sikkerhet
    weight: 0.75
  - id: albert-hoitingh            # Purview/labels/compliance/AI governance
    name: Albert Hoitingh — Information Security & Compliance
    url: https://www.alberthoitingh.com/feed/
    topic: sikkerhet
    weight: 0.7
  - id: cloudbrothers              # Defender/Entra/KQL detections (static-site /index.xml)
    name: Cloudbrothers (Fabian Bader)
    url: https://cloudbrothers.info/index.xml
    topic: sikkerhet
    weight: 0.7

  # ===== ENDPOINT =====
  - id: azure-virtual-desktop
    name: Azure Virtual Desktop Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=azurevirtualdesktopblog
    topic: endpoint
    weight: 0.9
  - id: surface-it-pro             # camelCase board.id (SurfaceITPro)
    name: Surface IT Pro Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=SurfaceITPro
    topic: endpoint
    weight: 0.85
  - id: windows-os-platform
    name: Windows OS Platform Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=windowsosplatform
    topic: endpoint
    weight: 0.85
  - id: windows-insider            # Insider Preview builds — HIGH VOLUME (300 items)
    name: Windows Insider Blog
    url: https://blogs.windows.com/windows-insider/feed/
    topic: endpoint
    weight: 0.8
  - id: windows-server             # infra-leaning
    name: Windows Server News and Best Practices
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=windowsservernewsandbestpractices
    topic: endpoint
    weight: 0.8
  - id: windows-networking         # Windows DNS/DHCP/DoH (infra-leaning)
    name: Windows Networking Blog (Core Networking)
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=networkingblog
    topic: endpoint
    weight: 0.8
  - id: fasttrack
    name: Microsoft FastTrack Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=fasttrackblog
    topic: endpoint
    weight: 0.8
  - id: windows-admin-center       # infra-leaning
    name: Windows Admin Center Blog
    url: https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=windows-admin-center-blog
    topic: endpoint
    weight: 0.75
  - id: msendpointmgr              # Intune/ConfigMgr/EPM (top-tier)
    name: MSEndpointMgr
    url: https://msendpointmgr.com/feed/
    topic: endpoint
    weight: 0.75
  - id: oofhours                   # Autopilot/Windows/Intune (Niehaus)
    name: Out of Office Hours (Michael Niehaus)
    url: https://oofhours.com/feed/
    topic: endpoint
    weight: 0.75
  - id: petervanderwoude           # Intune/Autopilot/ConfigMgr
    name: All about Microsoft Intune (Peter van der Woude)
    url: https://www.petervanderwoude.nl/feed/
    topic: endpoint
    weight: 0.75
  - id: call4cloud                 # Intune/Autopilot/Autopatch
    name: Call4Cloud (Rudy Ooms)
    url: https://call4cloud.nl/feed/
    topic: endpoint
    weight: 0.7
  - id: mobile-jon                 # Intune/AVD/PIM architecture
    name: Mobile Jon's Blog
    url: https://mobile-jon.com/feed/
    topic: endpoint
    weight: 0.7
  - id: niallbrady                 # ConfigMgr/Intune/OSD/W365
    name: Just Another Windows Noob (Niall Brady)
    url: https://niallbrady.com/feed/
    topic: endpoint
    weight: 0.7
  - id: ccmexec                    # ConfigMgr/Intune/EM
    name: CCMEXEC (Jörgen Nilsson)
    url: https://ccmexec.com/feed/
    topic: endpoint
    weight: 0.7
  - id: mikemdm                    # Intune/MDM automation
    name: Mike's MDM Blog
    url: https://mikemdm.de/feed/
    topic: endpoint
    weight: 0.7
  - id: andrew-taylor              # Intune/Graph PowerShell + newsletter
    name: Andrew Taylor (andrewstaylor.com)
    url: https://andrewstaylor.com/feed/
    topic: endpoint
    weight: 0.65
  - id: prajwal-desai              # Intune/SCCM/Windows 11
    name: Prajwal Desai
    url: https://www.prajwaldesai.com/feed/
    topic: endpoint
    weight: 0.65
  - id: thomas-maurer              # Azure/Arc/Windows Server (infra-leaning)
    name: Thomas Maurer
    url: https://www.thomasmaurer.ch/feed/
    topic: endpoint
    weight: 0.6
  - id: danielengberg             # biweekly Intune/ConfigMgr roundup (meta-aggregator)
    name: Daniel Engberg — Endpoint Management
    url: https://danielengberg.com/feed/
    topic: endpoint
    weight: 0.6

  # ===== AI =====
  - id: m365-blog                  # broad M365, currently Copilot-heavy
    name: Microsoft 365 Blog (official)
    url: https://www.microsoft.com/en-us/microsoft-365/blog/feed/
    topic: ai
    weight: 0.8
  - id: handsontek                 # SharePoint/Teams/Copilot extensibility
    name: HANDS ON tek (João Ferreira)
    url: https://www.handsontek.net/feed/
    topic: ai
    weight: 0.7
```

---

## Appendix A — Other integratable source types (beyond plain board-RSS)

All validated 2026-06-20 unless noted. These are **not** in the ready-to-merge set because of topic-fit, format, auth, or volume — documented so the maintainer can opt in deliberately.

1. **Azure Service Updates (RSS)** — `https://www.microsoft.com/releasecommunications/api/v2/azure/rss` — 200, `<rss>`, **200 items**, latest "[In preview] Azure Migrate – GitHub Copilot Modernization integration…" · 17 Jun 2026. The Azure sibling of the already-integrated `m365-roadmap`; plain RSS, drops straight into the pipeline. Excluded only because it's broad Azure infra (compute/network/storage) that mostly doesn't map to the 4 topics — enable with heavy filtering or a future Azure/infra topic.
2. **MSRC Security Update Guide — CVRF v3 API** — `https://api.msrc.microsoft.com/cvrf/v3.0/cvrf/<YYYY-Mon>` (e.g. `2026-Jun`); index at `…/cvrf/v3.0/updates`. JSON, or CVRF-XML via `Accept: application/xml`. **Auth-free** since the CVRF 3.0 upgrade. *Not* a feed — you'd fetch the current month, diff vs. last run, and synthesize items. The **RSS** form (`/update-guide/rss`) is what's in the ready-to-merge set; this API form is for richer per-CVE detail.
3. **Microsoft Graph Changelog (RSS)** — `https://developer.microsoft.com/en-us/graph/changelog/rss` — 200, `<rss>`, **2523 items**, latest 3 Jun 2026. Plain RSS but entries are terse API-change notes (a latest item title is literally "User"); dev audience, low news value. Integratable but needs title/synthesis work.
4. **Microsoft Learn "what's new" search-RSS** — `https://learn.microsoft.com/api/search/rss?search=%22what's+new%22&locale=en-us&$filter=scopes/any(t:%20t%20eq%20'Intune')` — 200, `<rss>`, 13 items, latest 21 May 2026. The scope-filter form generalizes to Defender/Purview/Windows 365/etc. by swapping the scope string. Caveat: items are **doc-page results** ("Microsoft Intune documentation"), not article headlines — needs query tuning + title cleanup before it reads like news. (The bare-`search` Entra variant returned only 3 items → too narrow; see Appendix B.)
5. **GitHub `releases.atom` for Microsoft OSS** — `https://github.com/<org>/<repo>/releases.atom`. Validated: `PowerShell/PowerShell` (10 entries, "v7.6.3", 16 Jun 2026), `Azure/azure-cli` (10, "Azure CLI 2.87.0", 1 Jun 2026), `microsoft/WSL` (10, "2.7.9", 19 Jun 2026). Atom 1.0, no auth (anon ~60 req/hr/IP — fine for a 5-min cron if ETags are cached). Good for release-tracking; map per repo. Docs repos often have an empty `releases.atom` — use `/commits/main.atom` instead (noisy).
6. **M365 Message Center / Service Health** — **not RSS**. Surfaced via Microsoft Graph (`serviceAnnouncement/messages`, `serviceAnnouncement/healthOverviews`), requiring an Entra app registration + `ServiceMessage.Read.All` and a tenant. Heaviest integration, but it's the "what changes hit *my* tenant" source.
7. **Azure AI / Azure OpenAI blog product feeds** — `https://azure.microsoft.com/en-us/blog/product/azure-ai/feed/` (10, 11 Jun 2026) and `…/azure-openai/feed/` (10, 11 Jun 2026). Validated plain RSS, but content is Azure AI-platform / data-science / exec ("3 things leaders need to know from Build 2026") — off the `ai` topic's M365-Copilot/admin intent. Easy to add if scope widens.
8. **M365 collaboration Tech Community boards** — validated plain RSS, in-scope (M365 workloads) but **no clean fit in the 4 topics** (would suit a future `samarbeid`/collaboration topic). Evidence: `exchange` Exchange Team Blog (20, "Introducing EWSAllowedAppIDs…", 19 Jun 2026 — the most security-relevant: SUs, EWS/basic-auth retirements), `microsoftteamsblog` (20, 18 Jun), `spblog` SharePoint (20, 29 May), `OneDriveBlog` (20, 11 Jun), `microsoft_365blog` M365 board (20, 11 Jun), `microsoft365insiderblog` (20, 18 Jun — consumer-ish).
9. **Other validated-but-off-focus official blogs** (plain RSS, add if scope widens): Azure Blog `azure.microsoft.com/en-us/blog/feed/` (10, broad Azure), The Microsoft Cloud Blog `microsoft.com/en-us/ai/blog/feed/` (10, exec/strategy), Windows Blog / Windows Experience `blogs.windows.com/...` (consumer-mixed), Windows Developer (10, 2 Jun); and `devblogs.microsoft.com` — PowerShell Team (10, 21 May), Microsoft 365 Developer (10, 11 Jun), Microsoft Foundry (10, 18 Jun), Azure SDK (25, 2 Jun), .NET (10, 17 Jun), Visual Studio (10, 15 Jun), Engineering@Microsoft (10, 27 Feb). All developer/consumer-leaning rather than IT-admin/security.

---

## Appendix B — Rejected / needs-work

Each was actually curl-tested; reason given. Nothing here is in the ready-to-merge set.

### Dead / renamed Tech Community boards (HTTP 200 + 0-item "Resource Not Found", or empty)
| board.id | reason |
|---|---|
| `MicrosoftEndpointManagerBlog` | 0 items — board retired post-migration; content folded into the integrated Intune blog |
| `windows365blog` / `Windows365Blog` | 0 items — no Windows 365 board; W365 rides on `windows-it-pro` + `m365-roadmap` |
| `microsoftedgeinsiderblog` | 0 items — Edge blogs live on blogs.windows.com / msedgedev, not a TC board |
| `IdentityStandards` | 0 items — board not present on the new platform |
| `MicrosoftDefenderforCloudAppsBlog` | 0 items — MDA content runs under Defender XDR / Defender for Cloud blog |
| `MicrosoftDefenderIoTBlog` | 200 but 0 items — empty board |
| `securityexposuremanagement` | only **4** items (< 10) |

### Stale / dormant (≥10 items but newest item too old)
| feed | newest item | reason |
|---|---|---|
| `sbs` (Windows Server Essentials/SBS, TC) | 27 Jul 2023 | ~3 yr stale |
| `DefenderExternalAttackSurfaceMgmtBlog` (TC) | 21 May 2024 | ~2 yr stale |
| `DefenderThreatIntelligence` (TC) | 18 Nov 2025 | ~7 mo dormant |
| `practical365.com/feed/` | 27 Jan 2026 | feed frozen/moved ~5 mo (flagship — worth re-finding current feed URL) |
| `nathanmcnulty.com/index.xml` | 9 Sep 2025 | ~9 mo stale |
| `garytown.com/feed/` | 28 Jan 2026 | ~5 mo |
| `sccmentor.com/feed/` | 21 Dec 2025 | ~6 mo |
| `inthecloud247.com/feed/` | 21 Feb 2026 | ~4 mo — re-verify (author usually active; feed may be truncated) |
| `jeffbrown.tech/feed/` | 2 Dec 2024 | ~18 mo |
| `securecloud.blog/feed/` | 12 Aug 2024 | ~22 mo |
| `learnsentinel.blog/feed/` (Microsoft Sentinel 101) | 15 May 2023 | ~3 yr (author moved to Microsoft) |

### Too few items (< 10), though fresh — needs full-feed URL
| feed | items | note |
|---|---|---|
| `anoopcnair.com/feed/` (HTMD) | 5 | fresh (19 Jun) but feed truncated to 5 |
| `eskonr.com/feed/` | 6 | — |
| `scloud.work/feed/` | 5 | fresh (12 Jun) but truncated |

### Wrong path / blocked / HTTP error
| url | reason |
|---|---|
| `www.microsoft.com/en-us/msrc/blog/feed/` | 404 HTML — MSRC blog has no working feed; use the Security Update Guide RSS instead |
| `azure.microsoft.com/.../azure-ai-foundry/feed/` | 404 HTML — wrong slug (use `azure-ai` / `azure-openai`) |
| `devblogs.microsoft.com/surface-it-pro-blog/feed/` | 404 HTML — no such devblogs blog (Surface IT content is the TC `SurfaceITPro` board) |
| `learn.microsoft.com/api/search/rss?...Azure Active Directory...` | 200 but only **3** items — query too narrow |
| `blog.mindcore.dk/feed/` | HTTP **454** Cloudflare "Checking your browser" challenge — blocks the pipeline UA too |
| `systemcenterdudes.com/blog/feed/` | 0 items — that path is a *comments* feed; try `/feed/` |
| `cloud-architekt.net/index.xml` | 404 — Hugo site; try `/rss.xml` |
| `oceanleaf.ch/rss.xml` | 404 — wrong path |
| `merill.net/rss.xml` | 404 — Merill's "Entra.News" is a Substack (`entra.news/feed`); verify separately |
| `hybridbrothers.com/feed.xml` | 404 — correct feed is `/index.xml` (passed; in ready-to-merge) |

### Excluded on scope (validated & live, but not Microsoft-only)
| feed | reason |
|---|---|
| `specterops.io/feed/` | live (50 items, 18 Jun 2026) but multi-vendor offensive security (BloodHound, K8s, red-team) — not Microsoft-only |
| `petri.com/feed/` | live (10 items, 19 Jun 2026) but multi-vendor enterprise IT news — mostly-but-not-only Microsoft |

---

## Constraints honored

- `config/feeds.yaml` **unchanged**; nothing merged to `main`; pipeline **not run**; nothing deployed.
- Schema and the 4 topics unchanged; no non-Microsoft sources in the ready-to-merge set.
- Every ready-to-merge feed has recorded curl evidence above (HTTP 200 + `<rss>`/`<feed>` root + ≥10 items + recent date) and none duplicates the 11 existing sources.
