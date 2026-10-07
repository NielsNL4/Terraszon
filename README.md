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

## Locaties ontdekken

Het menu begint gesloten op desktop en mobiel. **Ontdek** opent de geladen horecalocaties in het huidige kaartgebied, gesorteerd op hemelsbrede afstand tot je bevestigde locatie of, zonder locatie, het kaartcentrum. De zoekinvoer in dit menu zoekt direct in die geladen namen, adressen en horecatypes. De algemene adres-/plaatszoeker blijft afzonderlijk beschikbaar. De lijst volgt de bestaande schakelaar **Alleen zon**, inclusief mogelijk gefilterd licht, en de zichtbaarheid van de horecalaag. Eerst worden maximaal 80 rijen opgebouwd; **Toon meer** maakt de volgende rijen beschikbaar.

Een keuze uit de lijst, een kaartmarker of een adresresultaat opent hetzelfde detailpaneel. Een groen omrand punt geeft de geselecteerde analysepositie aan; de camera houdt rekening met het paneel en de tijdbediening. Het paneel toont bestaande broninformatie en acties zoals **Toon op kaart**, **Route**, **Website** en **Bellen** waar beschikbaar. Herkende waarden voor terras, toegankelijkheid, overdekking en seizoen krijgen Nederlandse labels. Onbekende waarden blijven herkenbaar als brondata. Openingstijden worden in F1 nog als brontekst getoond.

Op desktop staat het paneel links onder de zoekbalk. Op mobiel staat het boven een compacte datum-/tijdregel; in landschap kan het naast de bediening staan. Een geopend toetsenbord krijgt een eigen hoogtebudget zodat een volledig zoekresultaat zichtbaar blijft. Teruggaan herstelt de focus naar de lijst; sluiten en Escape geven de focus terug aan de opener. Zoekuitkomsten worden via een afzonderlijke, rustige statusregio aangekondigd.

Eerder geladen plekken blijven bij vernieuwingsfouten beschikbaar, met een herstelactie. Lage zoom, uitgeschakelde horeca, lege gebieden en niet gevonden namen hebben eigen uitleg. Een adres of verplaatst persoonlijk punt krijgt niet automatisch de zonstatus van een horecapin: ontbrekende of mislukte berekeningen worden als onbekend weergegeven.

## Mijn plekken en eigen locaties

**Opslaan** bewaart een gevonden horeca- of adresplek op dit apparaat. Dit kan vanuit een locatieregel of de details. Via **Mijn plekken** vind je opgeslagen en zelf toegevoegde plekken terug, ook buiten het huidige kaartgebied. Zoeken in deze verzameling gebruikt namen en persoonlijke notities; de openbare horecalaag en Alleen-zon-filter beperken deze persoonlijke lijst niet.

**Toevoegen** opent een formulier voor naam, type en optionele notitie. De beginpositie is een voorstel rond het kaartcentrum. Kies de gewenste positie via adreszoeken, een klik op de kaart, het slepen van de groene pin of breedte-/lengtegraad. Het formulier blijft behouden terwijl de kaart beweegt en nieuwe gegevens binnenkomen. **Bewaren** schrijft pas na validatie naar lokale opslag; **Annuleren** of Escape vanuit het formulier slaat niets op. De gewone adreszoeker kan tijdens bewerken eveneens de conceptpin verplaatsen.

**Bewerken** past persoonlijke gegevens en het eerste analysepunt aan. Bij horeca blijft de oorspronkelijke bronpin apart bewaard; eventuele extra analysepunten blijven behouden. Eigen locaties krijgen een persoonlijke groene kaartmarkering en worden niet als openbare of bevestigde horecalocatie voorgesteld. Vanuit de kaart en Mijn plekken opent dezelfde selectie. **Verwijderen** verwijdert een plek; de daaropvolgende melding biedt **Ongedaan maken** zolang die actie beschikbaar blijft.

**Export** downloadt een Terraszon-GeoJSON-bestand met persoonlijke plekken en notities. **Import** leest dit eigen versie-1-formaat en slaat bestaande ID's over; bestaande notities worden niet vervangen. Een bestand boven 32 MB wordt vóór het lezen geweigerd; de bestaande inhouds- en recordvalidatie blijft gelden. Importfouten benoemen zowel de oorzaak als een herstelactie en behouden bestaande plekken. Een opslagquota-fout houdt de formulierinvoer vast zodat opnieuw bewaren mogelijk is. Een wijziging uit een ander tabblad tijdens bewerken overschrijft geen concept: de gebruiker kan expliciet annuleren en opnieuw laden.

Er is geen account, serveropslag of automatische synchronisatie. Export/import is de handmatige manier om een kopie over te zetten. Gewone succesmeldingen verdwijnen na vier seconden; fouten en acties zoals Ongedaan maken blijven staan totdat ze worden vervangen of het paneel wordt gesloten.

## Locatiemodel en persoonlijke opslag

De technische basis voor locatiebeheer staat in `src/places.ts` en `src/saved-places.ts`. Horeca, gezochte adressen en eigen kaartpunten gebruiken één locatiemodel. OSM-records krijgen een stabiel ID zoals `osm:node/42`; Photon-resultaten behouden hun OSM-identiteit wanneer die beschikbaar is. Adressen zonder bron-ID krijgen een naam-/positie-ID en eigen punten een UUID. De bestaande kaartklik en adreszoeker zijn op dezelfde selectie aangesloten.

Bronpositie en horecagegevens staan los van persoonlijke gegevens: favorietstatus, eigen naam, notitie, type en maximaal acht analysepunten. Een vernieuwde zaaknaam of bronpin overschrijft geen persoonlijke terraspositie of notitie. Kleine persoonlijke records worden lokaal bewaard onder `terraszon:personal-places`, met schema versie 1 en maximaal 500 locaties. Er is geen account of cloudopslag. Gegevens worden pas opgeslagen via een expliciete opslagactie; een kaartklik of zoekselectie schrijft geen favoriet.

De opslagmodule ondersteunt toevoegen, bijwerken, verwijderen, herladen en een versieerbare GeoJSON-roundtrip. Het importformaat is een Terraszon-`FeatureCollection` met `terraszon.version = 1`, puntgeometrie, bronreferenties en persoonlijke metadata. Ongeldige coördinaten, inconsistentie tussen geometrie en record, onbekende versies of een te groot bestand worden geweigerd voordat iets wordt opgeslagen. Duplicaten worden overgeslagen, zodat import geen bestaande notities overschrijft. Algemene GPX- of andere GeoJSON-formaten zijn nog geen ondersteund importformaat.

Opslagfouten worden teruggegeven; er is geen onzichtbaar tijdelijk "opgeslagen" resultaat. Beschadigde of onbekende opslagversies worden behouden. De laatste geldige geheugenversie kan bij latere opslagproblemen worden geëxporteerd. Een optimistische controle op de laatst gelezen opslagwaarde herkent wijzigingen uit een ander tabblad; dit is geen synchronisatie tussen apparaten. Bij toekomstige beperkte providers bevat de persoonlijke collectie alleen bron-ID's en eigen gegevens: hun zaakdetails, foto's en broncoördinaten worden niet automatisch opgeslagen of geëxporteerd. Open bronverwijzingen en, waar relevant, OSM-attributie blijven wel aanwezig.

Het ontdekmenu en Mijn plekken gebruiken deze onderlaag; zie [de roadmap](./ROADMAP.md).

## Restaurantverrijking, openingstijden en media

T4 levert de data-onderlaag voor de rijkere presentatie in F3. OSM-menulinks, voorzieningen, dieet-/afhaal-/reserveringsvelden, zaak-/keuken-/terrasuren en Wikimedia-verwijzingen worden afzonderlijk verwerkt. `provenance` bewaart de gebruikte bronrecord, bronlink, oorspronkelijke tag per veld en, na een download, het ophaalmoment. Een door OSM opgegeven `check_date:opening_hours` blijft onderscheiden van dat ophaalmoment; ophalen betekent niet dat de zaakgegevens daadwerkelijk zijn gecontroleerd.

De volledige OSM-parser **opening_hours.js 3.15.0** draait in een aparte browserworker. De kaartstart downloadt die worker niet; een geselecteerde locatie met openingstijden vraagt hem op. Datum-/tijdwijzigingen hergebruiken de worker. Het resultaat bevat open/gesloten/onbekend, een begrensde volgende wissel en zeven dagoverzichten. Zaak, keuken en terras worden niet gelijkgesteld. Ontbrekende of conditionele regels, parserwaarschuwingen, ongeldige kloktijden en ontbrekende feestdagcontext blijven onbekend. Land/regio komen uit brongegevens; alleen een kleine, zekere regio binnen Groningen krijgt een gedocumenteerde Nederlandse fallback. Een bekende afwijking tussen locatie- en browsertijdzone geeft onbekend in plaats van een verkeerd omgerekende status. Een wereldwijde tijdzone-/landlookup is hiermee niet geïmplementeerd.

De worker en relatieve asset-URL's werken op statische hosting, inclusief een pad zoals `/Terraszon/` op GitHub Pages. De productiebuild publiceert onder `licenses/opening_hours/` het upstream LGPL-/GPL-licentiebestand, CC0-/ODbL-teksten, bronverwijzingen en het oorspronkelijke ongewijzigde ESM-modulebestand. Deze bron-/licentie-assets en de parserworker worden niet bij de kaartstart gedownload. opening_hours.js-bron: [GitHub](https://github.com/opening-hours/opening_hours.js/tree/v3.15.0).

Media worden alleen via concrete Commons-bestanden of een gekoppeld Wikidata-P18-bestand opgezocht; een categorie levert geen willekeurig gekozen foto. Een losse OSM-`image`-URL geeft geen hergebruikrecht. De metadata bevatten maker, licentie/link, Commons-bronpagina, attributietekst, dimensies, onderwerp en eventuele beoordelingsdatum. De resolver accepteert herkenbare CC BY, CC BY-SA, CC0 en public-domain-licenties; ontbrekende attributie of onduidelijke rechten leveren geen bruikbare afbeelding. Metadata-HTML wordt tekst en is niet bestemd voor `innerHTML`.

De kleine, gecontroleerde Groningen-selectie koppelt OSM-node 918944223 (Huis De Beurs) aan een pandfoto uit 2016 van Gouwenaar/CC0, en nodes 2752222651 en 1129293293 (De Drie Gezusters) aan een pandenfoto uit 2012 van Baykedevries/CC BY-SA 3.0 nl. De onderschriften benoemen het historische buitenaanzicht; dit zijn geen actuele terrasmetingen. Metadata worden maximaal 24 uur in een begrensde geheugencache bewaard; negatieve metadata kort, netwerkfouten niet als succesvolle foto. Tijdwijzigingen hergebruiken de lopende foto-opvraag. Pixels worden via een aparte, expliciete image-loader geladen; fouten of timeouts veranderen locatie- en openingsgegevens niet. Deze verrijking wordt niet automatisch in persoonlijke opslag of exports overgenomen.

Referenties: [opening_hours API](https://github.com/opening-hours/opening_hours.js#library-api), [Commons Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo), [Commons hergebruik](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia). Beelddekking is beperkt tot beschikbare, gekoppelde of gecontroleerde bestanden; de volledige fotoshow en leesbare openingstijdenbediening volgen in F3.

## Dagzonrapport

Open een horecaplek, gezocht adres of eigen plek en kies **Bekijk zonrapport**. Het rapport wordt pas dan berekend. Het toont circa directe zonduur, aandeel daglicht, de langste zonperiode en de lichtstatus bij het gekozen tijdstip, met resterende of volgende directe zon waar berekend. Opkomst, ondergang en daglichtduur staan eronder. **Alle lichtperioden**, **Zonhoogte en richting** en **Data en modelbeperkingen** klappen afzonderlijk open.

De rapporttijdlijn en de kaarttijd volgen elkaar. De kleurstrook heeft tekstlabels voor directe zon, gebouwschaduw, mogelijk gefilterd licht, nacht en onbekend; de vensterlijst is met toetsenbord bedienbaar. Tijdkeuze is per minuut, terwijl de berekening iedere vijf minuten samplet en gevonden overgangen tot circa één minuut verfijnt. Rond zomer-/wintertijd volgt de rapporttijdlijn de werkelijke dagduur; UTC-offsets onderscheiden de dubbele kloktijd in het najaar.

**Pas zitpunt aan** laat je een tijdelijke grondpositie kiezen door op de kaart te tikken, de pin te slepen of coördinaten in te vullen. **Gebruik dit punt** past het toe; **Annuleren** of Escape bewaart het eerdere punt. De oorspronkelijke horeca-/adrespin verandert niet. Wil je het punt bewaren, sla de plek op en gebruik **Bewerken → Bewaren**; het formulier begint bij de geselecteerde zitpositie. Een nieuwe selectie herstelt het opgeslagen punt of, zonder eigen punt, de bronpositie. Dit is geen balkonhoogte-analyse.

Een andere datum, toegepast zitpunt of bomeninstelling wist oude rapportuitkomsten en start een nieuwe berekening als het rapport open is. Kaartbeweging en tijdkeuze hergebruiken de daganalyse. Tijdens laden kun je annuleren; na een fout kun je opnieuw proberen of het punt aanpassen. Onvolledige obstakeldata blijven expliciet vermeld: onbekende perioden zijn geen zekere zon en mogelijk gefilterd licht telt niet als directe zon. De modeluitleg bevat een actie om opnieuw te berekenen.

Het paneel blijft standaard gesloten. Een geopend rapport geeft mobiel meer scrollruimte, met de kaart en klok bereikbaar. De uitkomsten blijven modelschattingen, geen weersvoorspelling of bewezen praktijknauwkeurigheid. Het jaaroverzicht en de dagdeelgrafieken volgen in F5.

## Puntgebonden zonrapport-engine

`src/sun-report-client.ts` levert de technische dag-/jaaranalyse. F4 gebruikt de daganalyse via `src/day-report-controller.ts` en `src/day-report-view.ts`; F5 sluit later de jaaranalyse aan. Maak één client aan en geef de exacte grond-/zitpositie met een stabiel analysepunt-ID door; een horecabronpin is niet automatisch die positie. De worker laadt een eigen obstakelgebied rond het punt en ontvangt geen kaartviewport of gerenderde tilehoogtes.

```ts
import { createSunReportClient } from './sun-report-client';

const reports = createSunReportClient(); // Worker start pas bij de eerste aanvraag.
const controller = new AbortController();
const target = { id: 'custom:garden:seat', coordinates: [6.568, 53.219] as [number, number] };
const day = await reports.day(target, '2026-07-15', controller.signal);
// Alleen op aanvraag:
const year = await reports.year(target, 2026, controller.signal);
// controller.abort() annuleert de actieve aanvraag; reports.destroy() ruimt op.
```

Vensters bevatten epoch-milliseconden; duurvelden en dagdeeltotalen zijn minuten. `directShareOfDaylight` is een percentage of `null` bij onvolledigheid. `sun`, `shade`, `filtered`, `night` en `unknown` sluiten elkaar uit. Ontbrekende obstakeldata leveren geen zekere zon op. `coverage`, `complete`, `warnings` en `accuracy` moeten bij presentatie worden meegenomen. `sunAvailability()` uit `src/sun-report-engine.ts` geeft resterende/volgende directe zon voor een tijdstip.

Sampling gebeurt iedere vijf minuten met circa één minuut verfijning voor gevonden overgangen; kortere perioden kunnen worden gemist. Daglicht is de zonmiddelpuntstand boven de horizon. Opkomst en ondergang volgen de eigen standaardhorizon van SunCalc. Jaarresultaten zijn twaalf representatieve maanddagen en vier afzonderlijke seizoensdagen, geen maandgemiddelden. Tijd en dagdelen volgen de browsertijdzone; dagen rond zomer-/wintertijd kunnen 23 of 25 uur duren.

Een nieuwe aanvraag vervangt de actieve taak van dezelfde client. Resultaten en voorbereide obstakels worden begrensd hergebruikt op basis van punt, datum, instellingen, revision en modelversie. `invalidate()` wist rapport-/snapshotcaches en annuleert de actieve analyse; onderliggende broncaches behouden hun bestaande TTL. De productiebuild bevat een afzonderlijke `sunReports`-entry en een lazy rapportworker, ook bruikbaar op een genest GitHub Pages-pad. De technische fase T5 en daginterface F4 zijn afgerond; het jaaroverzicht volgt in F5 en buitenvalidatie volgt later. Zie [de roadmap](./ROADMAP.md).

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
