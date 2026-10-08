---
version: 1
slug: "src-duration-search-view-ts"
primary_target: "src/duration-search-view.ts"
related_targets: ["src/duration-search.ts", "src/shared-selection.ts", "src/place-panel.ts", "src/place-panel.css", "src/main.ts", "src/day-report-view.ts"]
---

# F6 — Resterende zon en een gedeeld zitpunt

Mode: Operate. Lokale uitbreiding van de bestaande lijst/details; F3/providerdetails blijven geparkeerd.

## Direction contract

THESIS: Kies een berekende buitenplek voor je aankomst en deel precies het zitpunt/tijdstip, zonder onberekend als nul zon te behandelen.

OWN-WORLD: Bestaande roomwitte ondergrond, systeemsans, groene native acties, rustige lijstscheiding en tekstuele zon-/onzekerheidswaarden. Geen nieuwe visuele wereld of kaartenstapel.

STORY: Open zoeken op zonneduur, kies aankomst en minimumduur en analyseer zes huidige kandidaten. Krijg geschikte plekken aflopend op resterende directe zon, met aparte onbekende/onberekende resultaten. Open een resultaat voor hetzelfde dagrapport. Deel vanuit details alleen punt en tijd; ontvangen punten worden tijdelijk geopend en alleen expliciet opgeslagen.

FIRST VIEWPORT: Menu standaard gesloten. De bestaande lijst krijgt een compacte uitklapactie vóór de rijen; de zoekform en resultaten scrollen binnen de bestaande sidebar/sheet. Details hebben een deelactie met heldere inhoud en handmatige kopieerfallback.

FORM: Inherited extension; geen conceptroll. Eén lazy groepsworker, zes per stap/maximaal 24 kandidaten, sequentieel en annuleerbaar. Geen ongevraagde bronuitbreiding. Onvolledigheid blijft onbekend; epoch plus bronklok/tijdzone maakt deellinks eenduidig, ook bij klokwissels.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification

Tests voor link-roundtrip/invalid/duplicaten/geen persoonlijke payload, DST/tijdzone, kandidaatbudget, annulering/late replies, onzekerheid/filter/sortering en dezelfde voorbereide dag bij selectie. Desktop-/mobielbrowserflows, clipboardfallback, ontvangen link zonder autosave en native productie-worker. Eén gezamenlijke inspectie plus hoogstens een bevestiging; geen garantie op weer/terraspositie en geen fysieke-device-performanceclaim.
