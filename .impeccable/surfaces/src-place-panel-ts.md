---
version: 1
slug: "src-place-panel-ts"
primary_target: "src/place-panel.ts"
related_targets: ["src/place-editor.ts","src/place-panel.css","src/main.ts","src/map.ts"]
---

# F2 — Mijn plekken en persoonlijke punten

Mode: Operate. Target: src/place-panel.ts, src/place-editor.ts, src/place-panel.css, src/main.ts, src/map.ts.

Lokale uitbreiding van de vastgelegde Terraszon-stijl; geen nieuwe visuele wereld of conceptroll. Behoud het standaard gesloten paneel, kaartwerkvlak en niet-modale bediening. Persoonlijke plekken blijven lokaal zonder account.

## Direction contract

THESIS: Een gevonden of ontbrekende plek kan een persoonlijke plek worden, zonder brongegevens of openbare horeca te veranderen.

OWN-WORLD: Gebruik bestaande roomwitte panelen, systeemsans, groen/grijze tekst, groene acties, warme focusringen en stroked SVG-iconen. Lijstregels en formuliergroepen krijgen rustige scheiding, geen kaartenstapel.

STORY: Sla een gevonden plek op of open Mijn plekken. Voeg daar een naam/type/notitie en een eigen punt toe via adres, klik, slepen of coördinaten. Opslaan meldt pas succes nadat lokale opslag slaagt. Import en export maken handmatig overzetten mogelijk.

FIRST VIEWPORT: Menu gesloten. Open lijst: In de buurt/Mijn plekken. Details: opslaanstatus en bewerken/verwijderen. Editor: compact scrollbaar formulier met blijvende kaartpin en expliciete opslaan/annuleren. Mobiel en toetsenbord houden een bruikbaar invoer-/resultaatgebied.

FORM: Inherited panel extension, roll niet van toepassing. Geen modale bevestigingsflow. Verwijderen heeft een ongedaan-makenactie; fouten bewaren de invoer en bestaande data. Eigen punten en bronpinnen blijven apart en herkenbaar.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification

Regressies voor bron-/persoonlijke positie, extra analysepunten, opgeslagen lijst buiten de huidige kaartbounds en opslagfouten. Browserflow toevoegen → bewaren → herladen → bewerken → export/import → verwijderen/undo; kaartklik/drag, adres, annuleren, toetsenbord, smal scherm en landschap. Bounded visual review: inspecteer desktop/mobiel samen, herstel als batch, bevestig één keer. Alleen herkenbare synthetische testdata in captures.
