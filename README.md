# Terraszon

Terraszon is een statische webapp die laat zien welke horecaterrassen op een gekozen moment waarschijnlijk in de zon liggen. De app combineert een interactieve 3D-kaart, de berekende zonnestand en gebouwschaduwen. Alle berekeningen draaien in de browser; er is geen eigen server of database.

## Stack

- Vite en vanilla TypeScript voor een kleine, statische bundle.
- MapLibre GL JS met de keyless Liberty-stijl van OpenFreeMap.
- OpenStreetMap-gebouwen uit de OpenFreeMap-vector tiles.
- SunCalc voor zonpositie, zonsopkomst en zonsondergang.
- Earcut voor eenmalige triangulatie van gebouwfootprints in een Web Worker.
- Overpass API voor horeca en apart gemapte `leisure=outdoor_seating`-locaties.
- Boomgegevens van gemeente Groningen (waar beschikbaar) en OpenStreetMap via Overpass voor een optionele schatting van boomschaduw.
- Photon voor wereldwijde suggesties bij het zoeken naar adressen, plaatsen en straten.

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

Bij openen vraagt de browser toestemming voor je locatie en beweegt de kaart ernaartoe. Een gele locatie-indicator met een lichtgele kring, zoals de zon in het logo, toont de bevestigde browserpositie en wordt automatisch bijgewerkt wanneer je beweegt. Deze updates verplaatsen de kaart niet opnieuw: je kunt zelf zoeken en rondkijken. De locatieknop bepaalt je positie opnieuw en centreert de indicator. Op mobiel wordt de locatie in het zichtbare kaartgedeelte boven de bediening geplaatst. Het volgen pauzeert wanneer de pagina op de achtergrond staat en hervat bij terugkeer; bij verlaten van de pagina wordt de watcher opgeruimd. Als locatie niet beschikbaar is, begint de kaart in Groningen zonder een verzonnen locatie-indicator. Browserlocatie vereist HTTPS of localhost.

De zoekbalk toont na een korte typ-pauze maximaal vijf suggesties; een gekozen locatie verplaatst de kaart. Op mobiel staan zoekbalk en locatieknop onder het bedieningspaneel, met zoekresultaten die naar boven openen. De bediening houdt rekening met schermrotatie, veilige schermranden en het zichtbare scherm bij een geopend toetsenbord. Op desktop blijft de zoekbalk linksboven. De tijdlijn heeft SVG-markeringen voor zonsopkomst en zonsondergang, met de bijbehorende tijden. Hun posities volgen de geselecteerde datum en kaartlocatie en blijven gelijk tijdens het verschuiven van de tijdslider. Ontbrekende gebeurtenissen, zoals tijdens pooldag of poolnacht, worden niet op de tijdlijn getekend. De slider blijft met muis, aanraking en toetsenbord bedienbaar.

Via **Gebouwkleuren aanpassen** open je `gebouwkleuren.html`. Die pagina toont 200 op de OpenStreetMap-wiki gedocumenteerde `building=*`-waarden met een kleurenpreview, zoekfunctie en categorieën. Elke categorie heeft een eigen kleurkiezer en hexveld. Een categoriewijziging geldt voor alle types in die categorie, ook als de zoekfunctie een deel verbergt. Individueel aangepaste types krijgen de markering **Eigen kleur** en behouden hun kleur bij latere categoriewijzigingen. **Volg categorie** verwijdert zo'n uitzondering. Deze keuze blijft na herladen bestaan, ook als de individuele kleur gelijk is aan de categoriekleur. Eerder opgeslagen kleuren die afwijken van de oorspronkelijke standaard worden automatisch als eigen kleur overgenomen.

Autosave bewaart wijzigingen lokaal in de browser; de status toont **Opslaan…**, **Opgeslagen** of een opslagfout. Bij verlaten van de pagina worden openstaande wijzigingen direct opgeslagen. Terugkeren naar de kaart of de kaart in een ander tabblad openhouden past de kleuren toe. **Kopieer kleuren als JSON** zet het versieerbare palet inclusief categoriekleuren en individuele uitzonderingen op het klembord. Een browser kan dit bestand niet zelf in de projectbroncode opslaan. Gebouwen zonder bekend type gebruiken de aanpasbare kleur van `building=yes` (standaard beige-wit).

De schakelaar **Bomen** staat standaard aan en toont ingetekende bomen vanaf zoomniveau 14. Op lagere zoom zijn dit donkergroene symbolen met een minimale zichtbare grootte; vanaf zoomniveau 15 verschijnen gestileerde 3D-bomen met een permanente stam en takken en een seizoensafhankelijke kroon. Nederlandse en Latijnse soortnamen uit de gemeente bepalen een van zeven boomprofielen: rond, breed, ovaal, zuilvormig, treurend, kegelvormig of open. Cultivars zoals een zuilpopulier worden afzonderlijk herkend. Bladcyclus staat los van kroonvorm: lariks, moerascipres en watercipres verliezen bijvoorbeeld hun blad ondanks hun naaldboomvorm. OSM kan dit aanvullen met `species`, `genus`, `species:nl` en `leaf_cycle`.

Elke profielmesh wordt eenmaal per WebGL-context geüpload. Een WebGL2-instanced draw (of `ANGLE_instanced_arrays` op WebGL1) tekent de bomen in groepen met 32 bytes plaatsingsgegevens per boom: positie, kroonradius, totale hoogte, rotatie en seizoenseigenschappen. Er worden geen vier afzonderlijke GeoJSON-3D-volumes per boom meer opgebouwd. Bij een datumwijziging verandert alleen een shaderparameter; camera- en tijdwijzigingen uploaden geen boomgeometrie. Nieuwe boomgegevens vervangen alleen de kleine instantiebuffers. Zonder instancing blijft dezelfde gedeelde mesh bruikbaar met gewone tekenopdrachten. GPU-resources worden bij contextverlies opnieuw aangemaakt en bij verwijderen vrijgegeven.

De gekozen datum stuurt een geleidelijke, soortafhankelijke schatting van bladontwikkeling in de lente en bladverlies in de herfst. Wintergroene soorten behouden hun kroon; bladverliezende bomen tonen in de winter hun takstructuur. De seizoenscurve benadert een gemiddeld gematigd seizoen, met een halfjaarverschuiving op het zuidelijk halfrond. Onbekende soorten worden niet automatisch als volledig bladloos beschouwd. Dezelfde profielen, hoogten, kroonmaten, rotaties en bladcyclus worden voor tekenen en berekenen gebruikt. In de worker wordt een lichtstraal in 3D tegen het gedeelde model getest, zodat een verhoogde kroon geen massief grondvolume is. Gebouwschaduw blijft doorslaggevend. Alleen mogelijke boomafscherming krijgt de status **Mogelijke boomschaduw / gefilterd licht** en een eigen markering. Deze locaties blijven zichtbaar bij **Alleen zon**. De popup en boomstatus vermelden dat boomvorm en bladstand geschat zijn.

Boomschaduwen worden uit de gedeelde modellen in het bestaande schaduwmasker getekend, met een zachtere dekking voor bladeren en MAX-blending om onbedoelde verdonkering door zelfoverlap te voorkomen. Het gebouwmasker blijft volledig dekkend. Zonder de WebGL1-MAX-blendextensie wordt geen misleidend dicht boommasker getekend; de indicatieve terrasclassificatie blijft beschikbaar. Uitschakelen verbergt de bomen en haalt hun bijdrage uit de schaduw en terrasstatus. Gras en parken zijn dieper groen; gebouwkleuren volgen het gekozen palet. Als fietspad gemarkeerde paden zijn rood; overige wegen behouden hun kleur.

Na het laden vraagt MapLibre de zichtbare gebouwen uit de actieve gerenderde 3D-gebouwlaag op. Zodra de OSM-contouren beschikbaar zijn, gebruikt zowel de kleurenkaart als de schaduwberekening die afzonderlijke gebouwen en hun hoogten. Tijdens het laden of bij een bronfout gebruikt de kaart de neutrale OpenFreeMap-gebouwen. Een Web Worker trianguleert de footprints eenmalig tot een compacte mesh. Een eigen MapLibre WebGL-laag bewaart deze mesh op de GPU en projecteert de bovenste vertices tegenovergesteld aan de zon. Het resultaat wordt eerst als binair masker getekend en daarna eenmaal met de kaart gecombineerd. Daardoor worden overlappende driehoeken en gebouwen nooit extra donker.

Gebouwgeometrie wordt alleen opnieuw uitgelezen wanneer de kaart beweegt of nieuwe tiles beschikbaar zijn. Tijdens het slepen van de tijdslider veranderen uitsluitend twee kleine shaderwaarden voor richting en lengte; er wordt geen GeoJSON opgebouwd, gekopieerd of opnieuw door MapLibre geïndexeerd. Sliderupdates worden per animation frame samengevoegd. Na loslaten classificeert de worker de terraspunten rechtstreeks tegen de gebouwfootprints, zonder schaduwpolygonen te materialiseren. Alleen resultaten voor de nieuwste gebouwsnapshot en tijdkeuze worden toegepast. Maximaal 1.500 gebouwen worden tegelijkertijd verwerkt, onder zoomniveau 14 worden geen gebouwschaduwen berekend en extreem lange schaduwen zijn begrensd op 500 meter.

Horecaresultaten worden per genormaliseerde bounding box 24 uur in `localStorage` bewaard. Requests starten alleen nadat de kaartbeweging eindigt. Bevestigde terrassen, apart gemapte terrasgebieden en mogelijke horeca worden afzonderlijk gemarkeerd. In Groningen vraagt de app eerst bomen uit de gemeentelijke bomenkaart op; elders (of als die bron niets oplevert) gebruikt hij OpenStreetMap. Gemeentelijke bomen laden in stabiel op `OBJECTID` gesorteerde pagina's van 1.000 records, met maximaal vier pagina's per gebied. OSM vraagt één extra record op om afkapping te herkennen. Alleen volledige, niet-lege boomresultaten worden 24 uur bewaard; gedeeltelijk, leeg en mislukt resultaat krijgt die permanente cache niet. Maximaal 1.000 geselecteerde bomen worden getekend, onafhankelijk van het aantal opgehaalde bomen. Aanvullende Overpass-queries halen gebouwcontouren met hun `building=*`-type op, inclusief multipolygonen met binnenplaatsen en gebouwonderdelen. Dit is nodig omdat OpenFreeMap vele afzonderlijke gebouwen onder één tegel-ID samenvoegt. De eigen GeoJSON-gebouwlaag geeft ieder gebouw zijn juiste kleur; er wordt geen kleur meer gekoppeld via een gedeeld tegel-ID. De hoogte komt uit OSM (`height`, niveaus en dakhoogte), bij ontbreken uit een ruimtelijke koppeling met de kaarttegels, en anders uit een fallback van 9 meter. Publieke data-API's geven geen beschikbaarheidsgarantie.

Gebouwtypes laden op desktop per vaste cel van 0,01° breedtegraad en 0,02° lengtegraad, met maximaal vier cellen per GET-query en twee gelijktijdige queries. Op mobiele schermen zijn de cellen half zo groot in beide richtingen, met maximaal twee cellen per query, één gelijktijdige query en kleinere uitvoerbudgetten. Daarmee wordt minder onzichtbare geometrie gedownload en verwerkt. Zo kan een groot scherm meer dan 20.000 gebouwen tonen zonder alle typen weg te gooien. Geladen cellen krijgen meteen hun kleuren; nog niet geladen of mislukte gebieden houden afzonderlijke neutrale tegelgebouwen. Hoge tegelonderdelen, zoals een toren, worden behouden en nemen waar mogelijk het gebruikstype van hun omliggende gebouw over. Bestaande kleuren blijven bij kaartbeweging en bronfouten zichtbaar. De status toont voortgang per gebied en bij fouten verschijnt **Opnieuw laden**. Afgekapt of leeg resultaat wordt niet permanent gecachet.

Een afgekapt gebouwbatch wordt eerst opgesplitst in afzonderlijke cellen. Te dichte cellen worden daarna ruimtelijk gehalveerd, tot maximaal drie niveaus, zonder de footprintgeometrie af te snijden. Per laadoperatie zijn er maximaal zestien extra deelqueries op desktop en acht op mobiel; de bestaande totale deadline blijft gelden. Bruikbare deelresultaten worden al tijdens vervolgqueries getoond en blijven beschikbaar bij fouten of de deadline. Alleen complete cellen worden permanent gecachet. Aantoonbaar lege cellen worden één minuut in geheugen onthouden. De status onderscheidt verwerkte gebieden van volledig gedekte gebieden; gedeeltelijke gebieden worden niet als volledig geladen onthouden.

Netwerkverzoeken, JSON-verwerking, hoogte-indexen en het samenvoegen van gebouwgeometrie draaien in een aparte Web Worker. Cellen worden 24 uur in een begrensde geheugencache en asynchrone IndexedDB-opslag bewaard; grote gebouwrecords worden niet synchroon in `localStorage` omgezet. Kleurenvoorkeuren blijven in `localStorage`. De kaart ontvangt kleine statusberichten en alleen toegevoegde, verwijderde of gewijzigde gebouwen via `GeoJSONSource.updateData()`, met stabiele feature-ID's. Identieke voortgangs- en eindresultaten veroorzaken geen nieuwe geometrie-update. Een `idle`-melding zonder gewijzigde data of kaartgebied loopt niet opnieuw door de gebouwpolygonen. Aanvragen voor dezelfde cellen worden tijdens het laden hergebruikt, zodat kleine bewegingen of schermresizes de deadline niet steeds herstarten. Een bronverzoek en zijn response-body worden ook bij genegeerde abort-signalen begrensd; de worker heeft 45 seconden en de hoofdthread een onafhankelijke watchdog van 48 seconden. Een stilgevallen weergave krijgt eveneens een herstelmelding. Maximaal 24 cellen en 60.000 bekende gebouwen worden per kaartbeeld verwerkt; grotere beelden behouden hun gedeeltelijke kleuren en vragen verder in te zoomen.

Gebouwen, OSM-bomen en horeca delen één Overpass-planner: maximaal twee gelijktijdige toegelaten requests op desktop en één op mobiel. De gebouwworker vraagt via kleine berichten een slot aan; downloaden en JSON-verwerking blijven in de worker. Een slot blijft bezet tot de body gelezen is of de aanvraag eindigt. Geannuleerd wachtend werk start geen fetch. Bij HTTP 429, 503 en 504 gebruikt de planner oplopende backoff met jitter en bron-cooldowns; beschikbare `Retry-After`-informatie blijft behouden, ook wanneer een ouder parallel verzoek slaagt. Een 429 pauzeert ook fallback-endpoints. Actieve gebouwqueries hebben maximaal 25 seconden, OSM-boom- en horecaqueries 30 seconden, tegenover serverlimieten van 15 respectievelijk 20 seconden. Wachten telt mee in de totale laaddeadline van 45 seconden.

Bij een nieuw kaartbeeld blijven lopende gebouwbatches behouden als ze nog relevante cellen leveren. De oude view-abonnee wordt losgekoppeld, maar het bronverzoek houdt zijn oorspronkelijke deadline. Alleen ontbrekende cellen krijgen nieuwe requests; nutteloze batches worden geannuleerd zodra er geen abonnee meer is. Complete bronresultaten vullen de cache ook tijdens een viewwissel. Late voortgang van oude views mag de actuele selectie niet overschrijven. Voor boom- en horecaloads geldt eveneens een totale deadline van 45 seconden.

Boomdata heeft een ruimtelijke buffer rondom het kaartbeeld en een begrensde geheugencache van maximaal 32 gebieden en 12.000 records. Tijdens nieuwe aanvragen worden de bestaande bomen en hun schaduwbijdrage behouden, ook bij netwerkfouten. Kleine kaartbewegingen binnen volledige dekking doen geen nieuwe boomquery; bij uitbreiding worden alleen ontbrekende stroken geladen. Afgekapt resultaat kan tot drie niveaus worden opgesplitst, met maximaal twaalf bronrequests inclusief gemeentelijke pagina's en endpoint-fallbacks per laadoperatie. Alleen volledige gebieden tellen als gedekt; complete lege gebieden worden één minuut in geheugen onthouden. De status meldt gedeeltelijke boomdekking. Overlappende boom-ID's worden samengevoegd, met maximaal 1.000 geselecteerde bomen; zichtbare bomen hebben voorrang op bufferbomen en afstand houdt rekening met de breedtegraad. Identieke boomdata wordt niet opnieuw naar de kaartbronnen of GPU geüpload. Gebouw- en boomobstakels worden afzonderlijk naar de schaduwworker gestuurd: een bomenupdate bouwt geen nieuwe gebouwschaduwmesh en een gebouwenupdate bereidt niet alle bomen opnieuw voor.

Zoekopdrachten gaan naar de publieke Photon-server van komoot. Verzoeken worden vertraagd en bij nieuwe invoer geannuleerd om de dienst te ontzien. De server kan verzoeken beperken of tijdelijk onbereikbaar zijn; in dat geval blijft de kaart bruikbaar. Zoekopdrachten worden naar die externe dienst verstuurd; de browserpositie zelf wordt niet voor zoeken verzonden.

## Locatiemodel en persoonlijke opslag

De technische basis voor locatiebeheer staat in `src/places.ts` en `src/saved-places.ts`. Horeca, gezochte adressen en eigen kaartpunten gebruiken één locatiemodel. OSM-records krijgen een stabiel ID zoals `osm:node/42`; Photon-resultaten behouden hun OSM-identiteit wanneer die beschikbaar is. Adressen zonder bron-ID krijgen een naam-/positie-ID en eigen punten een UUID. De bestaande kaartklik en adreszoeker zijn op dezelfde selectie aangesloten.

Bronpositie en horecagegevens staan los van persoonlijke gegevens: favorietstatus, eigen naam, notitie, type en maximaal acht analysepunten. Een vernieuwde zaaknaam of bronpin overschrijft geen persoonlijke terraspositie of notitie. Kleine persoonlijke records worden lokaal bewaard onder `terraszon:personal-places`, met schema versie 1 en maximaal 500 locaties. Er is geen account of cloudopslag. Gegevens worden pas opgeslagen via een expliciete opslagactie; een kaartklik of zoekselectie schrijft geen favoriet.

De opslagmodule ondersteunt toevoegen, bijwerken, verwijderen, herladen en een versieerbare GeoJSON-roundtrip. Het importformaat is een Terraszon-`FeatureCollection` met `terraszon.version = 1`, puntgeometrie, bronreferenties en persoonlijke metadata. Ongeldige coördinaten, inconsistentie tussen geometrie en record, onbekende versies of een te groot bestand worden geweigerd voordat iets wordt opgeslagen. Duplicaten worden overgeslagen, zodat import geen bestaande notities overschrijft. Algemene GPX- of andere GeoJSON-formaten zijn nog geen ondersteund importformaat.

Opslagfouten worden teruggegeven; er is geen onzichtbaar tijdelijk "opgeslagen" resultaat. Beschadigde of onbekende opslagversies worden behouden. De laatste geldige geheugenversie kan bij latere opslagproblemen worden geëxporteerd. Een optimistische controle op de laatst gelezen opslagwaarde herkent wijzigingen uit een ander tabblad; dit is geen synchronisatie tussen apparaten. Bij toekomstige beperkte providers bevat de persoonlijke collectie alleen bron-ID's en eigen gegevens: hun zaakdetails, foto's en broncoördinaten worden niet automatisch opgeslagen of geëxporteerd. Open bronverwijzingen en, waar relevant, OSM-attributie blijven wel aanwezig.

Deze onderlaag wordt gebruikt voor het ontdekmenu in F1 en de bediening voor Mijn plekken, toevoegen en import/export in F2; zie [de roadmap](./ROADMAP.md).

## Nauwkeurigheid en beperkingen

- De geselecteerde tijd gebruikt de tijdzone van de browser. Bij een kaartlocatie in een andere tijdzone moet de gebruiker dit verschil zelf meenemen.
- OpenStreetMap bevat niet voor ieder gebouw een hoogte. Terraszon gebruikt dan een fallback van 9 meter.
- Niet ieder gebouw heeft een specifiek `building=*`-type; `building=yes` en onbekende types gebruiken de instelbare onbekend-kleur. Gebouwonderdelen zonder eigen type nemen waar mogelijk het type van hun omliggende gebouw over. Als Overpass voor gebouwen onbereikbaar is, blijft de kaart bruikbaar met neutrale gebouwen.
- Een OSM-horecapunt is meestal niet de exacte positie of contour van het terras. De zon/schaduwstatus is daarom indicatief.
- Horeca wordt breder opgehaald (`restaurant`, `cafe`, `bar`, `pub`, `biergarten`, `fast_food`, `food_court` en `ice_cream`). Locaties zonder terras-tag worden als mogelijke horeca getoond; expliciet `outdoor_seating=no` wordt uitgesloten. Apart gemapte `leisure=outdoor_seating`-locaties worden ook opgehaald. Algemene POI-lagen van de basiskaart zijn verborgen.
- Niet alle bomen staan in OpenStreetMap. De gemeentelijke boomkaart heeft hoogteklassen, geen exacte boomhoogte: Terraszon kiest per boom een kleine, vaste variatie binnen zijn klasse. Bij ontbrekende hoogte wordt 8–12 meter geschat. Kroonmaten worden uit hoogte en soortprofiel geschat; een beschikbare OSM-kroonmaat wordt behouden. Kroonvorm, takoriëntatie, snoeitoestand, bladstand en lichtdoorlatendheid zijn niet gemeten. De modellen en seizoenscurve zijn illustratieve schattingen, geen reconstructie van een specifieke boom of het daadwerkelijke uitlopen in een bepaald weerjaar. Er wordt geen gemeten percentage lichtdoorlatendheid of kans op zon getoond. Dicht bij zonsopkomst en zonsondergang worden extreem lange schaduwen op 500 meter begrensd. Bij meer dan 1.000 bomen in één kaartbeeld wordt slechts een deel verwerkt.
- Luifels, parasols, hoogteverschillen en tijdelijke objecten worden niet meegenomen.
- Alleen gebouwen uit het geladen kaartbeeld worden verwerkt; vlak langs de rand kan een schaduw van een nog niet geladen gebouw ontbreken.
- Bij zon onder de horizon worden locaties als zonder direct daglicht gemarkeerd en wordt geen slagschaduwlaag getekend.

## Mogelijke vervolgstappen

Het uitgewerkte plan voor locatiebeheer, restaurantgegevens, zonrapporten en laadoptimalisaties staat in [ROADMAP.md](./ROADMAP.md). Het onderscheidt technische fases en featurefases, met afhankelijkheden, oplevercriteria en een afzonderlijke commit per afgeronde bouwfase.

- Nederlandse 3D BAG/PDOK-hoogtes koppelen en OSM-hoogtes gericht vervangen.
- Een browsergestuurde visuele regressietest toevoegen voor WebGL1 en WebGL2.
- Terraspolygonen of een handmatige terraspositie gebruiken in plaats van het horecacentrum.
- De tijdzone automatisch afleiden uit de kaartlocatie.
- Beschikbaarheids- of bierprijsdata als aparte, optionele bron toevoegen.

## Data en attributie

Kaart- en gebouwdata: [OpenFreeMap](https://openfreemap.org/) en [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Boomdata in Groningen: [Gemeente Groningen](https://data.groningen.nl/dataset/bomen/04da3775-07f0-4388-bc12-7cd7536b04cd) (CC BY 4.0); elders OpenStreetMap. Horecadata wordt opgehaald via een publieke [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)-instance; zoeken gebruikt [Photon](https://photon.komoot.io/) met OpenStreetMap-data. De vereiste kaartattributie staat ook permanent in de MapLibre-kaart.
