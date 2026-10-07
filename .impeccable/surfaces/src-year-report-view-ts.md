---
version: 1
slug: "src-year-report-view-ts"
primary_target: "src/year-report-view.ts"
related_targets: ["src/report-charts.ts", "src/year-report-controller.ts", "src/day-report-view.ts", "src/day-report-controller.ts", "src/day-report.css", "src/main.ts"]
---

# F5 — Jaaroverzicht en dagdelen

Mode: Operate. Uitbreiding van het bestaande dagrapport, volgens de vastgelegde F5-scope. De bestaande stijl en het kaartwerkvlak zijn leidend; geen conceptroll of nieuwe visuele wereld.

## Direction contract

THESIS: Vergelijk bezoekmomenten op werkelijk berekende representatieve dagen, zonder maandgemiddelden te suggereren.

OWN-WORLD: Roomwitte panelen, systeemsans, rustige scheidingen en bestaande zon-/boom-/onbekendkleuren. Horizontale datarijen met leesbare duurwaarden en native knoppen, zonder kaartenstapel of chartdependency.

STORY: Open Zon per dagdeel bij een dagrapport. Vraag daarna expliciet het jaaroverzicht op, vergelijk twaalf dagen op de 15e en vier afzonderlijke seizoensdagen, en kies een rij om precies dat dagrapport te bekijken. Het huidige dagrapport blijft tijdens de jaarberekening bruikbaar.

FIRST VIEWPORT: Dagrapport blijft de eerste inhoud; het jaar heeft een eigen actie en jaarveld onder de bestaande dagbediening. Het geopende overzicht toont methode en gedeelde grafiekschaal vóór de maandrijen; seizoenen volgen binnen dezelfde scrollruimte. Bij alle grafieken staan tekstwaarden en gebruikte datums.

FORM: Inherited report extension. Native datumrij-knoppen en jaarinvoer, Annuleer jaaranalyse en herstelactie. Dagdelen gebruiken vóór 12:00, 12:00–17:00 en daarna; onbekend en gefilterd licht staan los van directe zon. Punt-/instellingen-/jaarwissel wist oude uitkomsten en vraagt expliciete herberekening.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification

Controllers: expliciete aanvraag, gedeelde worker zonder dag/jaar-race, annulering/late replies, jaar/punt/instellingen/revision, hergebruik bij datumkeuze binnen hetzelfde jaar en overnemen van exact dezelfde dagdata uit het jaar. Grafiekwaarden volgen dag-/dagdeeltotalen, ook bij nul, onvolledigheid en schrikkeljaar. Gecontroleerde browserflows plus native productie-worker onder /Terraszon/, één gezamenlijke desktop-/mobielreview en hoogstens één bevestiging. Geen praktijkzon- of performanceclaim.
