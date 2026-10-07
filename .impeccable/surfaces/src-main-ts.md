---
version: 1
slug: "src-main-ts"
primary_target: "src/main.ts"
related_targets: ["src/place-panel.ts","src/place-panel.css","src/map.ts"]
---

# F1 — ontdekmenu op de kaart

Mode: Operate. Target: src/main.ts, src/place-panel.ts, src/place-panel.css, src/map.ts.

Het bestaande kaartontwerp is visuele autoriteit. De gebruiker bevestigde: menu altijd gesloten bij openen, op desktop en mobiel. F1 is een lokale uitbreiding; geen conceptroll of nieuwe visuele wereld. Scope: lijst van geladen horeca in het kaartgebied, zoeken op lokale naam, details voor kaart/lijst/adres, selectie en focus, laden/fouten/leegte. Afbeeldingen, opslagbediening en zonrapporten volgen in andere fases.

## Direction contract

THESIS: De kaart blijft het werkvlak. Ontdek brengt een compacte lijst en locatiedetails binnen hetzelfde kaartbeeld; een keuze wordt zichtbaar met één geselecteerd kaartpunt.

OWN-WORLD: Behoud de aanwezige roomwitte panelen, donkere groen/grijze tekst, warme zonkleur, systeemsans, afgeronde bediening en zachte schaduwen. Nieuwe rijen krijgen rustige scheidingslijnen en expliciete statuswoorden, geen decoratieve kaartenstapel.

STORY: Open Ontdek, zoek een naam in het bekeken gebied, kies een plek en lees de bestaande informatie. Een adres opent hetzelfde paneel met passende uitleg, zonder verzonnen horecagegevens of zonstatus.

FIRST VIEWPORT: Menu gesloten. Ontdek staat naast locatiezoeken. Open desktop: smal paneel links onder de zoekbalk, boven de tijdbediening. Open mobiel: scrollbaar onderpaneel boven een compacte datum/tijdregel en de zoekbalk; genoeg kaart blijft zichtbaar. In landschap kan het paneel naast de bediening staan.

FORM: Inherited map-sidepanel extension; roll niet van toepassing op deze precies omschreven lokale uitbreiding. Header met terug/sluiten, lokale zoekinvoer, rustige locatierijen, één detailscherm. Selectie, Escape en focus-terugkeer werken zonder modale focusval.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification

Deterministische tests voor kaartgebied, lokale zoekdekking en afstand; browserchecks op desktop, mobiel, smal scherm en landschap voor selectie, zoeken, status/fouten, focus, kaartpunt en overlap. Twee visuele controlerondes maximaal. Testgegevens in screenshots zijn herkenbare testlocaties; de basiskaart is echt.
