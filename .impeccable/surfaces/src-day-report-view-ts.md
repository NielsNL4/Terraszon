---
version: 1
slug: "src-day-report-view-ts"
primary_target: "src/day-report-view.ts"
related_targets: ["src/day-report.css", "src/day-report-controller.ts", "src/place-panel.ts", "src/main.ts", "src/places.ts"]
---

# F4 — Dagzonrapport bij de geselecteerde plek

Mode: Operate. Lokale uitbreiding van het bestaande locatiepaneel, volgens de vastgelegde roadmap; geen nieuwe visuele wereld. Jaar- en dagdeelgrafieken volgen in F5.

## Direction contract

THESIS: Kies een bezoekmoment voor het exacte zitpunt; bronpin, berekende zon en onbekende obstakels blijven zichtbaar verschillende dingen.

OWN-WORLD: Bestaande roomwitte ondergrond, systeemsans, groen/grijze acties en tekst, zonnig geel, blauwgrijze schaduw en groene boomafscherming. Rustige scheidingen, geen geneste kaarten of decoratieve cijfers.

STORY: Open een plek, kies Bekijk zonrapport, lees duur en langste periode en verschuif de tijdlijn. Pas het tijdelijke grondpunt aan via kaartpin of coördinaten. Datum-/puntwijzigingen verwijderen oude uitkomsten direct; kaartbeweging en tijdkeuze vragen geen nieuw dagrapport.

FIRST VIEWPORT: Menu blijft standaard gesloten. In details staat de rapportactie vóór bronfeiten. Het geopende rapport toont datum, directe zonduur, daglichtaandeel/langste periode en de tijdlijn vóór de uitgebreide vensterlijst en modeluitleg. Mobiel krijgt het geopende rapport meer scrollruimte zonder de kaart en klok te bedekken.

FORM: Inherited panel extension; conceptroll niet van toepassing. Native tijdslider, tekstlabels voor alle lichttoestanden, uitklapbare vensters en zonnestand. Laden heeft Annuleren; fouten en gedeeltelijke data hebben opnieuw-berekenen. Puntwijziging is tijdelijk en heeft toepassen/annuleren.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification

Controllerregressies voor datum/punt/instellingen, late replies, annulering en tijdwijziging zonder nieuwe berekening. Presentatiehelpers testen voor duur, onbekend, poolnacht en klokwissels. Eén gezamenlijke desktop-/mobielbrowserronde met herkenbare synthetische rapporten voor tijdlijn, bron-/zitpunt, fouten/onvolledigheid, laden/annuleren, toetsenbord en smalle/liggende viewports; daarnaast echte worker via productie-assets onder /Terraszon/. Visuele review en eventuele correcties begrensd tot één batch plus bevestiging. Geen nauwkeurigheidsclaim over praktijkzon.
