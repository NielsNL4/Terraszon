# Terraszon

Terraszon is een statische webapp die laat zien welke horecaterrassen op een gekozen moment waarschijnlijk in de zon liggen. De app combineert een interactieve 3D-kaart, de berekende zonnestand en gebouwschaduwen. Alle berekeningen draaien in de browser; er is geen eigen server of database.

## Stack

- Vite en vanilla TypeScript voor een kleine, statische bundle.
- MapLibre GL JS met de keyless Liberty-stijl van OpenFreeMap.
- OpenStreetMap-gebouwen uit de OpenFreeMap-vector tiles.
- SunCalc voor zonpositie, zonsopkomst en zonsondergang.
- Earcut voor eenmalige triangulatie van gebouwfootprints in een Web Worker.
- Overpass API voor horeca met `outdoor_seating=yes`.

## Lokaal ontwikkelen

Node.js 22 of nieuwer is aanbevolen.

```bash
npm install
npm run dev
```

Vite toont het lokale adres in de terminal. Andere beschikbare opdrachten:

```bash
npm test
npm run lint
npm run build
npm run preview
```

De productiebuild staat na `npm run build` in `dist/`.

## GitHub Pages

De workflow in `.github/workflows/deploy.yml` test en bouwt de app bij iedere push naar `main` en publiceert `dist/` met GitHub Pages.

1. Push het project naar een GitHub-repository met als standaardbranch `main`.
2. Open **Settings > Pages** in de repository.
3. Kies bij **Build and deployment** als bron **GitHub Actions**.
4. Push naar `main` of start de workflow handmatig onder **Actions**.

Vite gebruikt een relatieve `base`, waardoor assets zowel op `<username>.github.io/<repo>/` als op een eigen domein werken.

## Werking

Na het laden vraagt MapLibre de zichtbare gebouwen uit de gerenderde `building-3d`-laag op. Een Web Worker trianguleert de footprints eenmalig tot een compacte mesh. Een eigen MapLibre WebGL-laag bewaart deze mesh op de GPU en projecteert de bovenste vertices tegenovergesteld aan de zon. Het resultaat wordt eerst als binair masker getekend en daarna eenmaal met de kaart gecombineerd. Daardoor worden overlappende driehoeken en gebouwen nooit extra donker.

Gebouwgeometrie wordt alleen opnieuw uitgelezen wanneer de kaart beweegt of nieuwe tiles beschikbaar zijn. Tijdens het slepen van de tijdslider veranderen uitsluitend twee kleine shaderwaarden voor richting en lengte; er wordt geen GeoJSON opgebouwd, gekopieerd of opnieuw door MapLibre geïndexeerd. Sliderupdates worden per animation frame samengevoegd. Na loslaten classificeert de worker de terraspunten rechtstreeks tegen de gebouwfootprints, zonder schaduwpolygonen te materialiseren. Alleen resultaten voor de nieuwste gebouwsnapshot en tijdkeuze worden toegepast. Maximaal 1.500 gebouwen worden tegelijkertijd verwerkt, onder zoomniveau 14 worden geen gebouwschaduwen berekend en extreem lange schaduwen zijn begrensd op 500 meter.

Overpass-resultaten worden per afgeronde bounding box 24 uur in `localStorage` bewaard. Requests starten alleen nadat de kaartbeweging eindigt. Hiermee blijft het gebruik van de publieke API beperkt, maar publieke Overpass-instances geven geen beschikbaarheidsgarantie.

## Nauwkeurigheid en beperkingen

- De geselecteerde tijd gebruikt de tijdzone van de browser. Bij een kaartlocatie in een andere tijdzone moet de gebruiker dit verschil zelf meenemen.
- OpenStreetMap bevat niet voor ieder gebouw een hoogte. Terraszon gebruikt dan een fallback van 9 meter.
- Een OSM-horecapunt is meestal niet de exacte positie of contour van het terras. De zon/schaduwstatus is daarom indicatief.
- Alleen locaties met `outdoor_seating=yes` en `amenity=cafe|restaurant` worden opgehaald. Ontbrekende OSM-tags betekenen dat een bestaand terras niet zichtbaar kan zijn. Algemene POI-lagen van de basiskaart zijn verborgen.
- Bomen, luifels, parasols, hoogteverschillen en tijdelijke objecten worden niet meegenomen.
- Alleen gebouwen uit het geladen kaartbeeld worden verwerkt; vlak langs de rand kan een schaduw van een nog niet geladen gebouw ontbreken.
- Bij zon onder de horizon worden locaties als zonder direct daglicht gemarkeerd en wordt geen slagschaduwlaag getekend.

## Mogelijke vervolgstappen

- Nederlandse 3D BAG/PDOK-hoogtes koppelen en OSM-hoogtes gericht vervangen.
- Een browsergestuurde visuele regressietest toevoegen voor WebGL1 en WebGL2.
- Terraspolygonen of een handmatige terraspositie gebruiken in plaats van het horecacentrum.
- De tijdzone automatisch afleiden uit de kaartlocatie.
- Beschikbaarheids- of bierprijsdata als aparte, optionele bron toevoegen.

## Data en attributie

Kaart- en gebouwdata: [OpenFreeMap](https://openfreemap.org/) en [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Horecadata wordt opgehaald via een publieke [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)-instance. De vereiste kaartattributie staat ook permanent in de MapLibre-kaart.
