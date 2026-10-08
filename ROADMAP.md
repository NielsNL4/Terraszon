# Terraszon — technische en featurefases

Dit plan is opgesteld op 7 oktober 2026. T1, T2, T3, T4, T5, T6, T7, F1, F2, F4, F5 en F6 zijn uitgevoerd en gecontroleerd. Praktijkvalidatie van de zonnauwkeurigheid volgt later en blokkeert de technische oplevering niet. F3 is op gebruikersverzoek geparkeerd; de overige fases staan nog open. Implementatie en commits volgen per bouwfase.

## Uitgangspunten

- Groningen eerst valideren, met Nederland als volgende doelgebied.
- Favorieten en zelf toegevoegde plekken blijven persoonlijk en lokaal, zonder account.
- Gratis restaurantdata en toegestane afbeeldingen eerst; betaalde bronnen zijn een latere, expliciete keuze.
- Het zonrapport volgt de aangeleverde Coffee in the Sun-referentie: dagelijkse zonduur, langste zonperiode, seizoensvergelijking en ochtend-/middag-/avondverdeling.
- Een zonrapport is beschikbaar voor horeca, een gezocht adres en een zelf gekozen buitenpunt.
- Zonuren zijn berekende directe zon op het analysepunt, geen weersvoorspelling. Mogelijk gefilterd licht blijft een afzonderlijke uitkomst.
- Restaurantidentiteit, terras-/analysepositie, persoonlijke gegevens en brongegevens worden afzonderlijk beheerd.

## Commit- en opleverafspraak

1. Iedere fase heeft een eigen afgebakende wijziging, controles en commit.
2. Markeer een fase pas afgerond nadat de oplevercriteria en relevante controles slagen.
3. Inspecteer voor iedere commit `git status`, `git diff` en `git log --oneline -10`; stage alleen de bestanden die bij de fase horen.
4. Gebruik de Engelstalige commitstijl van de bestaande repository. De titels hieronder zijn voorstellen.
5. Neem de statusupdate van deze roadmap mee in de commit van de betreffende fase. Vermeld uitgevoerde controles en eventuele beperkingen.
6. Een geblokkeerde of gedeeltelijk uitgevoerde fase wordt niet als afgerond gecommit. Splits een te grote fase vooraf in benoemde subfases met eigen oplevercriteria en commits.
7. Na codewijzigingen zijn `npm test`, `npm run lint` en `npm run build` de eindchecks per fase. Voeg gerichte tests toe waar gedrag, rekenuitkomsten of opslaggrenzen dat vragen.
8. Bij UI-fases: één gezamenlijke desktop-/mobielcontrole, herstel bevindingen als batch en bevestig de fixes. Controleer toetsenbordbediening, laden, fouten, lege resultaten en ontbrekende gegevens.
9. Commit betekent lokaal vastleggen; push en deployment zijn afzonderlijke acties.

## Twee sporen

**Technische fases (T)** leveren betrouwbare data, opslag, bronkoppelingen en berekeningen. **Featurefases (F)** leveren gebruikersfuncties en hun presentatie. Een feature gebruikt de bijbehorende technische basis; de technische basis bevat geen vooruitgeschoven feature-UI.

| Fase | Doel | Afhankelijk van | Status |
| --- | --- | --- | --- |
| T1 | Volledigheid van gebouw- en boomdata | — | Afgerond — 7 oktober 2026 |
| T2 | Requesthergebruik en netwerkplanning | T1 | Afgerond — 7 oktober 2026 |
| T3 | Locatiemodel en persoonlijke opslag | — | Afgerond — 7 oktober 2026 |
| T4 | Restaurantverrijking, openingstijden en afbeeldingen | T3 | Afgerond — 7 oktober 2026 |
| T5 | Zonrapport-engine per analysepunt | T1, T3 | Afgerond — 7 oktober 2026 |
| T6 | Gemeten verwerking- en cacheoptimalisatie | T2, T4, T5 | Afgerond — 8 oktober 2026 |
| T7 | Statische Groningen-datapilot | T1, T2; vergelijking met T6 | Afgerond — 8 oktober 2026 |
| T8 | Nederlandse databronnen en hoogteverrijking | Evaluatie T7 | Open, later |
| F1 | Ontdekmenu en gedeelde locatieselectie | T3 | Afgerond — 7 oktober 2026 |
| F2 | Mijn plekken, toevoegen en import/export | T3, F1 | Afgerond — 7 oktober 2026 |
| F3 | Rijke locatiedetails, foto's en basisfilters | T4, F1 | Geparkeerd op gebruikersverzoek |
| F4 | Dagzonrapport voor iedere locatie | T5, F1 | Afgerond — 7 oktober 2026 |
| F5 | Jaaroverzicht en dagdeelgrafieken | F4 | Afgerond — 7 oktober 2026 |
| F6 | Selecteren op zonneduur en deelbare locaties | F2, F4; evaluatie T6; providerdeel F3 geparkeerd | Afgerond — 8 oktober 2026 |

## Aanbevolen bouwvolgorde

**Opstartgeheugenherstel — 8 oktober 2026, vóór F6 op gebruikersverzoek**
- RAM/OOM-melding tijdens het starten krijgt voorrang. De onbegrensde tegelhoogte-index is vervangen door een begrensd grid plus één exacte kandidaat voor brede contouren; hoogte-inferentie blijft behouden. Een gecontroleerde native-workerproef met een 1°-contour gaf 1.002.001 oude gridcellen/67.665.006 bytes tegenover 793.336 bytes voor de begrensde variant. Dit toont een concrete expansierisico, niet dat iedere gemelde OOM hiermee is bewezen.
- Schaduwmesh direct in Float32Array, met maximaal 12 MB backing buffer; werkelijke polygonen/coördinaten worden begrensd bij samengevoegde tegelfeatures. Gebouwqueries/view-memory maximaal 12.000 desktop/6.000 mobiel; nieuwe gebouwcachekeys en gepaarde cachelezingen vermijden het tegelijk klonen van alle oude regio's. Bron-/kaartbeperking blijft expliciet; een positieve zonstatus bij een beperkte gebouwsnapshot wordt onbekend.
- Normale schaduwuitkomsten, grote contourhoogte, polygonen-/coördinatenbudget en meshbuffergrens worden met regressies gecontroleerd. De oude >20.000-gebouwtest is bewust aangepast aan het nieuwe geheugenbudget: gedeeltelijke kleuren blijven behouden, zonder volledige dekking te claimen. F6 blijft de volgende featurefase.
- Controles geslaagd: 229 tests in 30 bestanden, Oxlint, productiebuild, diffcheck en native dag-/jaarworkerflow. De geheugenproef is synthetisch en geïsoleerd; browser-/GPU-geheugen en een exacte OOM op het apparaat van de gebruiker zijn daarmee niet volledig gediagnosticeerd.

**T1 → T2 → T3 → F1 → F2 → T4 → T5 → F4 → F5 → T6**

Hiermee komt eerst betrouwbaar laden, vervolgens een bruikbaar locatiemenu en daarna het complete zonrapport. T6 optimaliseert op basis van de werkelijk gebouwde flows.

Na die basis volgen **F6** en de geografische uitbreiding **T7 → T8**. Start geen betaalde provider, grotere datadownload of nieuwe hostingopzet zonder de keuze en operationele gevolgen eerst te bevestigen.

**F3 is geparkeerd.** Na de overige implementaties Google Places UI Kit evalueren voor zoeken én restaurantdetails; eventueel later ook de kaart. De bronafhankelijke onderdelen van F6 worden dan afzonderlijk afgestemd.

## Technische fases

### T1 — Volledigheid van gebouw- en boomdata

**Scope**
- Laadresultaten expliciet onderscheiden als volledig, gedeeltelijk, leeg of mislukt, met bronidentiteit.
- ArcGIS-transferlimieten controleren en begrensde, stabiel gesorteerde paging ondersteunen.
- Afgekapt OSM-boomresultaat herkennen en alleen te dichte gebieden verder splitsen.
- Afgekapt gebouwwerk eerst per batch en vervolgens zo nodig per cel splitsen, met maximale diepte en totaalbudget.
- Alleen complete gebieden als volledig gedekt registreren. Het renderbudget van bomen scheiden van datadekking.
- Bestaande data tijdens fouten behouden; gedeeltelijke dekking herkenbaar rapporteren.

**Oplevercriteria en bewijs**
- Tests met volle pagina's, transferlimieten, complete lege gebieden, gedeeltelijk resultaat, abort en fout tijdens een vervolgpagina.
- Een afgekapt gebied blokkeert niet onterecht alle vervolgaanvragen.
- Een te grote gebouwbatch wordt kleiner herprobeerd binnen een begrensd budget.
- Groningen centrum en een boomrijk gebied handmatig controleren; betere volledigheid niet beoordelen als gegarandeerde meetnauwkeurigheid.

**Commit:** `Fix capped building and tree coverage`

**Uitvoering en bewijs — 7 oktober 2026**
- Laadstatus, bronidentiteit, volledige/lege/gedeeltelijke gebouwgebieden en onderscheid tussen brondekking en boomrenderbudget toegevoegd.
- Gemeentelijke paging, OSM-sentinel, begrensde ruimtelijke splitsing en behoud van succesvolle deelresultaten geïmplementeerd. Alleen volledige gebieden tellen als gedekt en krijgen permanente opslag; complete leegte blijft maximaal één minuut in geheugen.
- Controles geslaagd: `npm run lint` (Oxlint), `npm test` (95 tests in 13 bestanden) en `npm run build`.
- Regressies gecontroleerd voor afkapping, korte/volle/herhaalde pagina's, vervolgqueryfouten, requestbudgetten, lege gebieden, annulering en deadline met al ontvangen data.
- Live gemeentelijke broncontrole: centrumgebied 345/345 bomen in één pagina; Stadspark-deelgebied 1.442/1.442 bomen in twee pagina's. Aantallen vergeleken met `returnCountOnly` voor hetzelfde gebied.
- Groot Stadspark-gebied: 4.000 ontvangen van 11.526 bronrecords na vier pagina's, correct als gedeeltelijk gemarkeerd. Dit is een gecontroleerde bronlimiet, geen claim dat alle bomen worden getekend.
- Grenzen van het bewijs: geen visuele browsercontrole of FPS-/laadtijdbenchmark uitgevoerd. De live controle draaide via de TypeScript-loaders onder Vite SSR, niet via een browser-CORS-test. De productiebuild geeft de bestaande waarschuwing over een grote kaartbundle.

### T2 — Requesthergebruik en netwerkplanning

**Scope**
- Aanvragen voor overlappende gebouwcellen blijven bruikbaar na een kaartbeweging.
- De levensduur van een bronrequest scheiden van de selectie van het actuele kaartbeeld.
- Eén requestbudget voor Overpass-gebruik door gebouwen, bomen en horeca.
- Begrensde backoff en endpoint-cooldowns bij relevante fouten, met respect voor `Retry-After` waar beschikbaar.
- Server-, client- en workerdeadlines op elkaar afstemmen; oude viewresultaten mogen geen actuele selectie overschrijven.

**Oplevercriteria en bewijs**
- Gecontroleerde scenario's voor celgrenspassage, snel heen-en-weer bewegen, 429/504 en abort.
- Overlappende aanvragen worden hergebruikt zonder onbeperkte concurrency of retries.
- Meet requestaantallen, annuleringen en tijd tot bruikbare data vóór en na de wijziging.

**Commit:** `Reuse map requests and coordinate Overpass loading`

**Uitvoering en bewijs — 7 oktober 2026**
- Eén Overpass-budget toegevoegd voor de daadwerkelijke gebouw-, boom- en horecaloaders, inclusief de gebouwworker via een grant/release-protocol. JSON blijft in de worker. Desktop heeft twee slots, mobiel één.
- Overlappende gebouwbatches worden per cel hergebruikt. View-abonnementen en broncontrollers zijn gescheiden; een nieuw kaartbeeld wordt vóór het annuleren van de oude view doorgegeven. Verre sprongen annuleren bronjobs die niet meer nuttig zijn; brondeadlines worden niet opnieuw gestart.
- HTTP-status en `Retry-After` behouden; backoff, jitter en cooldowns voor 429/503/504 toegevoegd. Een parallel succes kan een nieuwere cooldown niet wissen. Wachtende jobs, workerfouten en late grants worden opgeruimd.
- Deadlines afgestemd: 25 seconden actieve gebouwrequest, 30 seconden actieve OSM-boom-/horecarequest, 45 seconden totale bron-/laadoperatie en de bestaande 48 seconden hoofdthread-watchdog voor gebouwen.
- Controles geslaagd: `npm run lint` (Oxlint), `npm test` (118 tests in 15 bestanden) en `npm run build`.
- Gecontroleerde heen-en-weer-simulatie met 1.000 ms response-bodyvertraging: annuleren/herstarten gaf drie starts en bruikbare einddata op 1.600 ms; hergebruik gaf twee starts en einddata op 1.000 ms. De twee geannuleerde oude view-abonnees mogen geen nieuwe voortgang toepassen; de oorspronkelijke bron blijft bruikbaar voor de eindview.
- Grenzen van het bewijs: dit zijn deterministische tests met gesimuleerde bronvertraging, geen praktijkbenchmark of visuele browsercontrole. Geen live requests verstuurd om publieke Overpass-quota uit te putten. De bestaande bundlewaarschuwing blijft aanwezig.

### T3 — Locatiemodel en persoonlijke opslag

**Scope**
- Stabiele locatie-ID's met aparte bron-ID's; een locatie is niet verplicht een OSM-horecapunt.
- Restaurantgegevens, analysepunt(en), favorietstatus en eigen notities afzonderlijk modelleren.
- Adreszoekresultaten en eigen punten door dezelfde selectiestroom laten lopen.
- Versieerbare lokale opslag voor favorieten en eigen locaties, met migratiepad en foutafhandeling.
- Gevalideerd GeoJSON-import-/exportformaat voor persoonlijke gegevens.

**Oplevercriteria en bewijs**
- Opslaan, herladen, aanpassen en verwijderen behouden identiteit en gegevens.
- OSM-verversing overschrijft geen persoonlijke analysepositie of notitie.
- Import/export-roundtrip, duplicaten, ongeldige coördinaten, onbekende schemaversie en geblokkeerde opslag testen.
- Providerdata met beperkte exportrechten komt niet automatisch in persoonlijke exports.

**Commit:** `Add a shared place model and local collections`

**Uitvoering en bewijs — 7 oktober 2026**
- Eén locatiemodel en selectiestroom toegevoegd voor horeca, adressen en eigen punten. De bestaande kaartklik en adreszoeker zijn aangesloten; Photon-OSM-ID's en namespaces zorgen voor consistente bronidentiteit.
- Bron-/zaakgegevens gescheiden van persoonlijke naam, favorietstatus, notitie, type en analysepunten. Bronverversing behoudt persoonlijke data. Getters en selecties leveren kopieën in plaats van mutable interne records.
- Lokale collectie met schema versie 1 toegevoegd, inclusief save/update/remove, foutstatus, herladen en expliciete import/export. Maximaal 500 locaties en acht analysepunten per locatie. De centrale decoder vormt het toekomstige migratiepunt; er bestond geen eerdere persoonlijke-locatieopslag om te migreren.
- GeoJSON-roundtrips bewaren bronpositie en afzonderlijke eigen analysepunten. Import is vooraf volledig gevalideerd en slaat duplicaten over. Referentie-only providers krijgen geen opgeslagen/geëxporteerde zaakpayload, foto's of automatische bronpositie.
- Corruptie, onbekende versies, quota en stale-tab-conflicten overschrijven geen geldige records. De laatste geldige geheugenversie blijft exporteerbaar bij latere opslagproblemen.
- Controles geslaagd: `npm run lint` (Oxlint), `npm test` (138 tests in 17 bestanden) en `npm run build`.
- Grenzen van het bewijs: opslag is getest met een geïnjecteerde lokale opslagadapter en de selectie met echte parsers/adapters; geen visuele browsercontrole uitgevoerd. Import ondersteunt het eigen versie-1-formaat, niet willekeurige derdepartij-GPX/GeoJSON. De bestaande bundlewaarschuwing blijft aanwezig.
- Vervolg: F1 levert het ontdekmenu en detailpaneel; F2 levert de gebruikersbediening voor opslaan, eigen punten en import/export.

### T4 — Restaurantverrijking, openingstijden en afbeeldingen

**Scope**
- Meer bestaande OSM-velden verwerken, waaronder menulinks en media-/Wikidata-verwijzingen.
- Een bronadapter en veldherkomst gebruiken, zodat aanvullende providers later aansluitbaar zijn.
- Openingstijden interpreteren voor de gekozen datum/tijd: open, gesloten of onbekend. Onderscheid zaakuren van eventuele terras-/keukenuren.
- Afbeeldingen met URL, bronpagina, maker, licentie en attributie modelleren. Eerst gecontroleerde Commons- of toegestane ondernemersfoto's.
- Geen automatische rechten afleiden uit een OSM-`image`-link; geen website- of menuscraping.
- Fotoloads, cachebeleid en ontbrekende data afhandelen zonder de basiskaart afhankelijk te maken van een mediabron.

**Oplevercriteria en bewijs**
- Openingsschema's rond middernacht, gesloten dagen, ontbrekende uren en uitzonderingen testen. Niet ondersteunde regels leveren onbekend op.
- Metadata en beeldlicenties van een kleine Groningen-selectie controleren.
- Kapotte afbeeldingen en bronfouten blokkeren locatiegegevens niet.
- Voor een openingstijdenparser of extra dependency eerst de concrete keuze vastleggen.

**Commit:** `Enrich place details with hours and licensed media`

**Uitvoering en bewijs — 7 oktober 2026**
- Meer OSM-velden toegevoegd met per-veld tagherkomst, bronrecord/link en ophaalmoment. Menulinks, voorzieningen, afzonderlijke zaak/keuken/terrasuren en mediareferenties blijven brondata, buiten persoonlijke exports.
- Parserkeuze voor implementatie vastgelegd: opening_hours.js 3.15.0. De gebruiker vroeg of de volledige parser op GitHub Pages kan; dat is bevestigd en als productiebuild met geneste `/Terraszon/`-URL getest. De on-demand worker houdt parserwerk buiten de hoofdthread en wordt bij de gesloten kaartstart niet gedownload.
- Begrensde status-/wissel-/zevendagenresultaten toegevoegd. Ontbrekende context, onbekende/conditionele regels, warnings, tijdzonemismatch en genormaliseerde niet-bestaande kloktijden blijven onbekend. Zaak, terras en keuken blijven apart.
- Commons/Wikidata-metadataresolver plus expliciete pixel-loader toegevoegd. Maker/licentie/bron/attributie worden behouden; geen willekeurige categoriefoto, losse externe image-link als rechtenbewijs of scraping. Metadata- en pixelproblemen blokkeren de locatie niet.
- Live selectie gecontroleerd via OSM REST en Commons: Huis De Beurs node 918944223/Gouwenaar/CC0 (pandfoto 2016), De Drie Gezusters nodes 2752222651 en 1129293293/Baykedevries/CC BY-SA 3.0 nl (pandenfoto 2012). Onderschriften benoemen pand en jaar. Twee live resolveropvragen gaven geldige maker/licentie/bron terug.
- Het echte Huis De Beurs-rooster wordt zonder waarschuwing gelezen. Eén Drie Gezusters-rooster krijgt een waarschuwing voor overlappende nachtregels en het andere heeft open eindtijden: beide leveren bewust onbekend op, zonder de bron te repareren.
- Productie-browsercheck geslaagd onder `/Terraszon/`: nul parserrequests bij kaartstart, één native worker bij selectie, hergebruik bij tijdwijziging, open/gesloten en DST-invalid-time, één foto-metadataopvraag over meerdere tijdkeuzes, licenties inclusief GPL-tekst bereikbaar, geen ongehanteerde browserfouten.
- Eindcontroles geslaagd: `npm run lint` (Oxlint), `npm test` (179 tests in 24 bestanden), `npm run build` en `git diff --check`.
- Bewijsgrenzen: productieflow gebruikt synthetische restaurant-/mediametadata; de parser en productie-assets zijn echt. Live broncontrole verifieert koppeling en gepubliceerde metadata, niet actuele openingspraktijk of een exacte terraspositie. Een eerste publieke Overpass-opvraag werd geweigerd/gelimiteerd; daarna is niet door quota heen geroteerd en de kleine OSM REST-batch is gebruikt. De parserworker is circa 716 kB ongecomprimeerd en apart geladen; de bestaande hoofd-bundlewaarschuwing blijft.
- Bijgestelde vervolgstap op gebruikersverzoek: T5. F3 blijft geparkeerd tot de latere Google Places UI Kit-evaluatie.

### T5 — Zonrapport-engine per analysepunt

**Scope**
- Dag- en jaaranalyses in een worker, met hergebruik van voorbereide obstakels.
- Een obstakelgebied rond het analysepunt laden onafhankelijk van het zichtbare kaartbeeld; rekening houden met de bestaande maximale schaduwlengte.
- Uitkomsten: zon-/schaduwvensters, directe zonduur, aandeel daglicht, langste periode en dagdeelverdeling.
- Mogelijk gefilterd licht apart houden; ontbrekende of afgekapt geladen obstakels als beperking doorgeven.
- Eerst dagresultaten, vervolgens jaaranalyse op aanvraag. Representatieve maanddagen expliciet benoemen.
- Rapporten koppelen aan punt, datum/jaar, instellingen, obstakelrevision en modelversie; gewijzigde data invalideert resultaten.
- Analyse kunnen annuleren of in begrensde batches uitvoeren zonder de interactieve kaartclassificatie te blokkeren.

**Oplevercriteria en bewijs**
- Deterministische obstakelscenario's testen: geen obstakel, enkel gebouw, boomprofiel, nacht en onvolledige data.
- Geen dubbele telling; directe zonduur is nooit groter dan de daglichtperiode; langste periode past binnen de totale duur.
- Overgangstijden zijn benaderingen met een vastgelegde tijdstap/verfijning, zonder onterechte precisie.
- Een stabiele dataset geeft hetzelfde punt hetzelfde rapport na kaartbeweging.
- Maart en september mogen door seizoensbomen verschillen. Februari en schrikkeljaren blijven geldige invoer.

**Latere praktijkvalidatie**
- Enkele gecontroleerde Groningen-punten buiten vergelijken; positie-, hoogte-, boom- en parasolfouten afzonderlijk noteren. Op gebruikersverzoek blokkeert deze latere controle de technische oplevering van T5 niet.

**Commit:** `Calculate daily and seasonal sun reports in a worker`

**Uitvoering en bewijs — 7 oktober 2026**
- Puntgebonden bronlader toegevoegd met een vierkant gebied van ±532 meter: de bestaande 500 meter schaduwhorizon plus kroonmarge. De loader ontvangt geen kaartbeeld en gebruikt het bestaande gedeelde Overpass-budget. Gebouwhoogtes komen uit OSM of de bestaande 9 meter fallback, niet uit de zichtbare kaarttiles; geschatte hoogtes worden vermeld.
- Rapportobstakels zijn los van de 1.000-bomen-renderselectie. Maximaal 12.000 bomen en 12.000 gebouwen worden verwerkt, met expliciete onvolledigheid bij selectie-/bronlimieten. Bronnen houden hun bestaande begrensde laad-, paging- en splitsingsbudgetten. Succesvolle brondata blijven beschikbaar als de andere bron faalt.
- Dagrapport met afzonderlijke zon/schaduw/gefilterd/nacht/onbekend-vensters, duur, daglichtaandeel, langste zonperiode, resterende/volgende zon en lokale dagdelen (vóór 12:00, 12:00–17:00, daarna). Een grondpunt binnen een gebouw geldt als schaduw en krijgt een positie-waarschuwing; de interactieve restaurant-POI-conventie blijft afzonderlijk bestaan.
- Vastgelegd rekencontract: classificatie op het midden van 5-minutenintervallen, gevonden toestandswissels verfijnen tot circa 1 minuut en als minuutgrens rapporteren. Kortere perioden kunnen worden gemist. Daglicht is de zonmiddelpuntstand boven 0°; gepubliceerde SunCalc-opkomst/-ondergang gebruiken diens afzonderlijke standaardhorizon. Directe zon is geometrisch licht, geen weersverwachting.
- Ontbrekende/afgekapt geladen obstakels leveren geen zekere directe zon op. Bekende gebouw-/boomafscherming en nacht blijven afzonderlijke uitkomsten; bij onvolledigheid is het directe daglichtaandeel onbekend. Niet-gekarteerde objecten, hoogtefallbacks, geschatte boomvorm/bladstand en de 500 meter horizon blijven benoemde modelbeperkingen.
- Jaaranalyse uitsluitend op aanvraag: twaalf maanddagen op de 15e plus 21 maart, juni, september en december, expliciet geen maandgemiddelden. Maart en september worden zelfstandig met hun bladstand berekend. Voorbereide geometrie/ray-oorsprongen worden hergebruikt; elke 32 tijdstappen wordt de worker vrijgegeven voor annulering.
- Begrensde caches: twee obstakelsnapshots en voorbereidingen, 32 dagresultaten. Sleutels bevatten puntidentiteit/coördinaten, datum, instellingen inclusief browsertijdzone, obstakelrevision en modelversie. De jaarberekening hergebruikt deze dagcache. Snapshothergebruik maximaal vijf minuten bij volledige niet-lege data, één minuut bij lege data en drie seconden bij fouten/onvolledigheid; onderliggende broncaches houden hun eigen TTL. Invalidation wist rapportcaches; het is geen geforceerde omzeiling van broncaches.
- Lazy client/worker met voortgang, selectie-supersession, expliciete annulering en deadlines (47 seconden obstakeljob, 90 seconden dagclient, 180 seconden jaarclient). Late resultaten overschrijven geen nieuwe aanvraag. De build bevat een afzonderlijke, exporteerbare `sunReports`-entry; de rapportworker wordt niet bij kaartstart geladen.
- Eindcontroles geslaagd: `npm run lint` (Oxlint), `npm test` (203 tests in 26 bestanden), `npm run build` en `git diff --check`. Deterministische fixtures dekken gebouw-/boom-/nacht-/onvolledigheidsscenario's, duurinvarianten, overgangsverfijning, schrikkeldagen, seizoenen, revisions, bronfouten, deadlines en annulering.
- Native Chromium-productiecheck geslaagd onder `/Terraszon/`, tijdzone Europe/Amsterdam: nul rapportworkerrequests bij kaartstart, één hergebruikte worker, stabiele daguitkomst bij herhaling, 16 jaarresultaten, correcte 1.380/1.500 minuten rond zomer-/wintertijd, annulering en geslaagde vervolgaanvraag, geen ongehanteerde browserfouten. Deze check gebruikt synthetische volledig-lege bronresponses; client, worker, SunCalc en netwerkbroker zijn echt.
- **Latere praktijkvalidatie:** buitenwaarnemingen op gecontroleerde Groningen-punten, met tijdstip, exacte zitpositie en afzonderlijke beoordeling van hoogte-, boom- en parasolfouten. Niet uitgevoerd en niet vervangen door synthetische tests. De gebruiker bevestigde dat deze controle later volgt en de technische oplevering niet tegenhoudt; T5 blijft één fase.
- Bewijsgrenzen: browserlokale tijd, geen wereldwijde tijdzone-lookup, balkon-/reliëf-/parasolmodel of praktijknauwkeurigheidsclaim. Boven 85° breedte en een gebied over de datumgrens worden expliciet geweigerd. De bestaande hoofd-bundlewaarschuwing blijft aanwezig. De rapportinterface volgt F4/F5.

### T6 — Gemeten verwerking- en cacheoptimalisatie

**Scope**
- Koude en warme cache, mobiel/desktop, dichte bebouwing en boomrijke gebieden meten; afzonderlijk netwerk, hoofdthread, workers en rendering beoordelen.
- Op basis van die metingen compacte boomrecords, asynchrone boomcache en minder herhaalde gebouwsignature-/indexverwerking toepassen waar zinvol.
- Cacheversies, volledigheid, TTL-opruiming en opslagbudgetten beheren.
- Complete lege resultaten kort kunnen onthouden; fouten en afkapping nooit als complete leegte cachen.
- Identieke data en uitsluitend gewijzigde eigenschappen zo klein mogelijk naar kaartbronnen overdragen.

**Oplevercriteria en bewijs**
- Voor/na-resultaten vastleggen met apparaat, netwerkcondities en herhalingen.
- Geen prestatieclaim zonder meting; objectvolledigheid blijft onderdeel van de vergelijking.
- Cachemigratie, verlopen records, opslaglimieten en data-invalidation testen.

**Commit:** `Optimize measured map processing and cache lifecycles`

**Uitvoering en bewijs — 8 oktober 2026**
- Voor/na-metingen uitgevoerd met dezelfde synthetische datasets en bronlatentie: dichte bebouwing (3.000 gebouwen/600 bomen) en boomrijk (600 gebouwen/4.000 bomen), desktop en CPU4×-mobielsimulatie, ieder drie onafhankelijke runs vóór en na. Netwerk/bronbytes, hoofdthread, native workerfasen, cachewarmte, geometrie en software-GL-rendering zijn apart geregistreerd. Methode, herhalingen, hardware, cijfers én tegenvallers staan in [T6-results.md](./tests/performance/T6-results.md); optionele herhaalbare browserdrivers zijn meegeleverd zonder nieuwe projectdependency.
- Gemeten knelpunten aangepakt: grote synchrone GeoJSON-boomcache en ontbrekende worker-toegang tot localStorage, herhaalde identieke gebouwvoorbereiding, en volledige polygonen bij propertywijzigingen. Boomcentra/profielen worden compact opgeslagen met gedeelde kroonoffsets; alle 4.000 geometrieën/profielen zijn exact teruggelezen. Bron-/view-/rapportvolledigheid en objectaantallen blijven behouden.
- IndexedDB-schema 2 toegevoegd met kleine metadata, TTL/LRU-opruiming en gedeelde limieten van 64 gebieden/60.000 recordslots. v1-public-sourcecache wordt bij upgrade ongeldig gemaakt; oude v5-boomgeometrie wordt begrensd opgeruimd zonder persoonlijke opslag/voorkeuren te wissen. Complete boomdata maximaal 24 uur, volledige leegte één minuut; afkapping/fouten/partial worden niet permanent als volledige dekking opgeslagen. Record-/decodecache: acht gebieden/12.000 records. Cachefouten, abort en corrupte records blijven herstelbaar via bronladen.
- Grote gebouwreads blijven concurrent readonly; metadata-touch/cleanup volgt apart zodat geometrieklonen niet onnodig worden geserialiseerd. Verlopen/future-dated gebouwgeheugenrecords worden geweigerd. Identieke bounds zonder nieuwe data/tiles/reset vermijden de herhaalde indexpass; signatures nemen ook hoogteevidentie en onderdeelstatus mee. Pure propertywijzigingen gaan als MapLibre-updates, geometriewijzigingen behouden remove/add.
- Finale medianen, boomrijk: warme hoofdthread-bronlezing desktop 20,0→<0,1 ms, mobiel 67,5→0,7 ms; workerherstart desktop 726,2→229,0 ms, mobiel 803,1→227,6 ms. Bronrequests in de meetcyclus 15→7; payload voor 100 typewijzigingen 32.026→8.225 bytes (74,3% kleiner). Compacte serialisatie voor 4.000 bomen 6.323.226→2.187.976 UTF-16-bytes (65,4% kleiner), geen exacte diskruimteclaim.
- Geen algemene snelheidsclaim: sommige koude/CPU-paden werden trager (onder meer mobiel-dichte eerste worker 549→647 ms en property-diffconstructie), terwijl wirevolume/warmte/herstart verbeterden. Rendering is gemeten maar niet aangepast; SwiftShader-frame-intervallen leveren geen fysieke-device-FPS-claim. Een eerste asynchrone cachevariant bleek trager; de finale aanpak voegt begrensd decodehergebruik, compacte stringopslag en concurrent reads toe. Eén tussentijdse software-GL-meetrun bereikte de runner-timeout; de finale complete matrix is apart vastgelegd.
- Native browserchecks geslaagd voor schema-invalidatie, LRU, opslaglimieten, oversized/expired weigeren, expiry-opruiming, schrijfproblemen, behouden persoonlijke data, exact record-roundtrip en echte MapLibre-propertypatch met behouden geometrie. Productie-dag-/jaarflow onder `/Terraszon/` geslaagd met de nieuwe cache-/gebouwworkers: één gedeelde rapportworker, dezelfde 16 dagen per jaar, identieke dagdelen en geen extra jobs bij datumkeuze.
- Eindchecks geslaagd: `npm run lint` (Oxlint), `npm test` (226 tests in 29 bestanden), `npm run build` en `git diff --check`. Nieuwe regressies dekken cacheversie/corruptie/TTL, miss/fallback/abort, compactheid/gegevensbehoud, diff en data-/bounds-/resetinvalidatie; bestaande paging-/afkappingstests blijven gelden. Een bestaande kalenderafhankelijke openingstijdenfixture heeft een vaste testklok gekregen; productieparserwaarschuwingen zijn niet onderdrukt.
- Bewijsgrenzen: gecontroleerde Vite-dev-componentmetingen en een aparte native productiecheck, geen livebronbenchmark, veldzonvalidatie, fysieke mobielmeting of nieuwe performanceclaim voor openingstijden/media. De bestaande grote-bundlewaarschuwing blijft aanwezig. Volgende fase: F6, selecteren op zonneduur en deelbare locaties; bronafhankelijke F3-/providerkeuzes blijven geparkeerd.

### T7 — Statische Groningen-datapilot

**Scope**
- Gemeentelijke boomdownloads en regionale gebouwgegevens vooraf normaliseren naar kleine, versieerbare celbestanden.
- Bron-/actualiteitsmanifest, attributie, gecontroleerde publicatie en live fallback buiten de dekking.
- Eerst celbestanden vergelijken; PMTiles/FlatGeobuf pas kiezen als schaal en metingen dat rechtvaardigen.

**Oplevercriteria en bewijs**
- Vergelijk laadduur, bytes en volledigheid met dezelfde live brongebieden.
- Actualisering, hostingbudget en fallback moeten reproduceerbaar werken.
- Datapipeline, distributielicenties en onderhoud afspreken vóór landelijke uitbreiding.

**Commit:** `Serve a versioned Groningen map dataset`

**Uitvoering en bewijs — 8 oktober 2026**
- Gebruiker bevestigde twee centrumcellen op de bestaande GitHub Pages-hosting, voorlopig handmatige actualisering en live fallback. Gebouwen onder ODbL 1.0, gemeentelijke bomen onder CC BY 4.0 blijven aparte bestanden. Voor publicatie is de officiële, gelicentieerde WFS gebruikt; de bestaande ArcGIS/OSM-livefallback blijft beschikbaar. Bronlicenties gecontroleerd via OSM-copyright en de overheidsregistratie (gemeentelijke portal gaf 403).
- Begrensde exporter `npm run data:refresh`, vaste cellen/bounds, OSM-sentinel, WFS-OBJECT-sortering/paging en bronaantalcontrole. Alleen complete/valide snapshots; 3 MiB per asset en geometriebudget. Nieuwe bestanden eerst gevalideerd, manifest atomisch vervangen; fouten behouden de oude publicatie. Build/deploy haalt geen brondata op. Capture-optie maakt replay mogelijk zonder telkens Overpass opnieuw te belasten.
- Gepubliceerd: 10.079 unieke OSM-gebouwen en 4.152 bomen binnen de exacte WGS84-pilotgrens. WFS-bronrecords 2.041/2.255 zijn compleet ontvangen; punten uit de iets ruimere geprojecteerde query-envelope zijn vóór publicatie geclipt. Grensgebouwen blijven behouden/dedupliceren op OSM-ID. Vier celbestanden samen 4.037.316 bytes ongecomprimeerd. Revision `rmuzh9pma-e4a8032b2232`; manifest met bron/licentie, capturedAt/expiresAt, bounds, counts, bytes en SHA-256.
- Static-first koppeling in gebouw-, bomenview- en punt-/rapportloaders. Complete gebouwcellen vermijden live queries; bomen combineren complete cellen met alleen ontbrekende live strips en verfijnen dense statische ouders. Geen gebruik van corrupte/verlopen assets als complete dekking. Datasetstamps beïnvloeden rapportrevision/expiry; snapshotdatum is apart zichtbaar. Manifest wordt maximaal iedere minuut gerevalideerd; maximaal 30 dagen geldigheid, daarna live fallback.
- RAM-bewust: stream-/bytegrenzen, manifest 32 KB/1,5 s, assets 3 MiB/3,5 s, caller-abort, LRU van twee bestanden/6 MiB/12.000 records. Bestaande opstart-/bron-/view-/meshbudgetten blijven behouden. Geen PMTiles/FlatGeobuf, backend, nieuwe projectdependency of landelijke download.
- Gecontroleerde voor/na-vergelijking met dezelfde echte vastgelegde bronrecords: desktop/mobielsimulatie, drie runs per toestand, 120 ms per request en echte gzip. Alle canonieke gebouwen-/bomeninhoudshashes gelijk. Medianen 1.619→899 ms desktop en 2.415→1.278 ms mobiel; requests 7→5, gzipbytes 1.517.284→753.450. Methode, spreiding en grenzen staan in [T7-results.md](./tests/performance/T7-results.md), optionele captured replaydriver meegeleverd.
- Native productiecheck onder `/Terraszon/` met de echte gepubliceerde assets: 10.079 gebouwen in de native worker, juiste datasetrevision in dagrapport, geen Overpass-query voor de volledig gedekte pilotgebouwcellen. Ontbrekende pilot (404) valt live terug zonder onterechte revision. Buiten-/buffergebieden blijven live; de gecontroleerde volledige flow had 6 live gebouwrequests met pilot tegenover 8 zonder. Alleen horeca/lege buitenfallback zijn fixtures; workers/UI/pilotdata echt, geen ongehanteerde browserfouten.
- Eindchecks geslaagd: `npm run lint` (Oxlint), `npm test` (244 tests in 34 bestanden), `npm run build` en `git diff --check`. Tests dekken publicatiechecksums/counts/licenties, formaat-/checksum-/pad-/budgetfouten, partial/outside, revision/expiry, timeout/abort en ontbrekende hoogteklasse. `null`-hoogteklasse wordt genormaliseerd naar undefined; schattingen blijven schattingen. Expiry-test van de immutable publicatie gebruikt het publicatiemoment zodat latere unrelated builds niet door veroudering falen.
- Bewijsgrenzen: source-capture/replaycomponentmeting plus native productie-preview, geen live end-to-end Pages-/fysieke-telefoonbenchmark, veldzonvalidatie of OOM-garantie. Diagnostische mainheap met echte data is niet vergelijkbaar met een lege fallbackfixture; worker-/GPUgeheugen is niet volledig gemeten. T8 bron-/hoogte-/onderhoudskeuzes blijven afzonderlijk af te stemmen. Push/deployment op expliciet gebruikersverzoek volgt na deze commit.

### T8 — Nederland: databronnen en hoogteverrijking

**Scope**
- BAG-functies gericht aan OSM-types koppelen zonder beide classificaties gelijk te stellen.
- Geschikte Nederlandse hoogteproducten vooraf koppelen, met herkomst en kwaliteitsinformatie.
- Relatieve gebouwhoogtes gebruiken, geen absolute NAP-elevatie als extrusiehoogte.
- Gemeentelijke boomadapters en landelijke fallback stapsgewijs toevoegen.

**Oplevercriteria en bewijs**
- Koppelingen en hoogtes controleren in Groningen en enkele verschillende Nederlandse gebieden.
- Dekking, foutieve koppelingen, bronactualiteit en fallback expliciet rapporteren.
- Zo nodig vooraf splitsen in T8a hoogtes en T8b regionale bronnen, ieder met eigen commit.

**Commit:** `Expand Dutch building and tree data coverage`

## Featurefases

### F1 — Ontdekmenu en gedeelde locatieselectie

**Scope**
- Desktopzijpaneel en mobiel onderpaneel binnen de bestaande Terraszon-stijl.
- Ontdeklijst voor het bekeken gebied, met naam, type, afstand en bestaande zon-/terrasevidentie.
- Restaurantnaam zoeken in beschikbare locaties naast adres-/plaatszoeken; geen landelijke horeca-zoekdekking suggereren zonder bron daarvoor.
- Selectie vanuit lijst, kaart en adreszoekresultaat openen in één detailpaneel.
- Kaart en paneel houden hetzelfde geselecteerde analysepunt aan.

**Oplevercriteria**
- Geen overlappende mobiele bediening; kaart blijft bruikbaar.
- Selectie, sluiten, focus-terugkeer en toetsenbordbediening werken.
- Laden, fout, lege lijst en een adres zonder horecagegevens hebben passende weergaven.

**Commit:** `Add a responsive place discovery panel`

**Uitvoering en bewijs — 7 oktober 2026**
- De gebruiker bevestigde **menu altijd gesloten bij openen**, op desktop en mobiel. Ontdek, een kaartmarker of een adreskeuze opent het paneel.
- Desktopzijpaneel, mobiele sheet, landschapsindeling en compact gemaakte mobiele tijdbediening toegevoegd binnen de bestaande stijl. Geselecteerde analysepositie heeft één kaartmarkering en wordt buiten bedieningspanelen gecentreerd.
- Lijst voor het huidige kaartgebied, lokale/accentongevoelige zoekfunctie, hemelsbrede afstand en gedeeld Alleen-zon-/horecalaaggedrag geïmplementeerd. Eerst 80 rijen; gebruiker kan meer tonen.
- Bestaande detailinformatie, bronlinks en kaart-/route-/website-/belacties behouden. Adresselecties, lege gebieden, lage zoom, uitgezette horeca, bronfouten en onbekende zonstatus hebben passende weergaven.
- Controles geslaagd: `npm run lint` (Oxlint), `npm test` (147 tests in 18 bestanden) en `npm run build`.
- Native Chromium/MapLibre-browserchecks geslaagd op 1366×900, 390×844, 320×740, 844×390 en een gesimuleerd 390×400-toetsenbordviewport: standaard gesloten, lokale query, kaartklik, adres, geselecteerd punt, filters, focus/Escape/terug, fouten/leegte, zoomherstel, 80→120 rijen, live zoekmelding, GPS-afstand zonder hercentreren, tijdslider en geen bedieningsoverlap.
- Visuele review vond drie herstelpunten: toetsenbordhoogte, toegankelijke zoekmeldingen en Nederlandse broncategorieën. De reviewer beoordeelde alle drie als opgelost; de `ship`-verdict heeft betrekking op deze gescoorde fixes. Mechanische UI-detector gaf geen bevindingen.
- Bewijsgrenzen: browserdata zijn herkenbare synthetische Test-locaties met gesimuleerde schaduwstatussen; de basiskaart en MapLibre-renderer zijn echt. Er is geen praktijknauwkeurigheids- of FPS-benchmark gedaan. De bestaande waarschuwing over de grote kaartbundle blijft aanwezig.
- Product- en ontwerpcontext zijn vastgelegd voor vervolgfases. Volgende fase: F2, de gebruikersbediening voor Mijn plekken en eigen locaties.

### F2 — Mijn plekken en eigen locaties

**Scope**
- Opslaan/verwijderen vanuit lijst of details en een onderdeel Mijn plekken.
- Plek toevoegen door adreszoeken of een kaartpin plaatsen; pin kunnen verplaatsen.
- Eigen naam, type en optionele notitie; bewerken en verwijderen.
- Bestaand horecapunt opslaan of een persoonlijk terras-/analysepunt eraan koppelen.
- Import/export van persoonlijke plekken; zichtbaar uitleggen dat opslag lokaal is.

**Oplevercriteria**
- Volledige flow: toevoegen → opslaan → herladen → bewerken → export/import → verwijderen.
- Een eigen plek blijft herkenbaar en wordt niet als publieke of geverifieerde horecalocatie gepresenteerd.
- Opslag- en importfouten geven bruikbare feedback zonder bestaande plekken te wissen.

**Commit:** `Add saved places and custom map locations`

**Uitvoering en bewijs — 7 oktober 2026**
- Mijn plekken toegevoegd, met opslaan vanuit lijst/details, zoeken in alle persoonlijke namen/notities, bewerken en verwijderen met ongedaan maken. Het paneel blijft standaard gesloten en de opslag blijft lokaal zonder account.
- Formulier voor naam, type en notitie plus positie via Photon-adres, echte kaartklik, draggable pin en coördinaten. Kaartverversingen behouden de invoer. Escape/annuleren schrijft niets; bewaren meldt alleen succes na een geslaagde lokale write.
- Horecabronpin en persoonlijk zitpunt blijven gescheiden; extra analysepunten en stabiele ID's blijven behouden. Eigen/adres-/verplaatste punten krijgen herkenbare persoonlijke kaartmarkers, geen verzonnen openbare horecagegevens.
- Downloadbare GeoJSON-export, gevalideerde import, duplicaatrapportage en duidelijke import-/opslagfeedback aangesloten op het versie-1-model. Wijzigingen uit een ander tabblad worden tijdens een concept niet stil ingelezen of overschreven.
- Controles geslaagd: `npm run lint` (Oxlint), `npm test` (153 tests in 19 bestanden) en `npm run build`.
- Native Chromium/MapLibre-flow geslaagd: bronplek bewaren, persoonlijk bronpunt bewerken, eigen plek via adres/kaartklik/drag toevoegen, bewaren, herladen, bestaande eigen plek opnieuw bewerken, export, delete/undo, geldige herstelimport, duplicaten/ongeldige JSON, Escape/annuleren en quota-fout met behouden invoer en geslaagde retry.
- Layoutchecks op 1366×900, 390×844, 320×740, 844×390 en gesimuleerd 390×400-toetsenbordviewport: geen overlap/veldoverflow, volledig eerste opgeslagen rij direct na save, focus terug op de opgeslagen rij en leesbare ingedrukte Bewaren-knop.
- Vijf visuele reviewpunten opgelost: mobiele lijsthoogte, complete editorinstructie, opgeslagen-rijfocus, primaire active-kleur en herstelgerichte importfout. De reviewer gaf `ship` voor deze vijf gescoorde fixes. Detector gaf alleen palet-/radiusadviezen; nieuwe F2-waarden zijn gedocumenteerd, bestaande kaartkleur-drift is niet als zijtaak aangepast.
- Bewijsgrenzen: herkenbare synthetische testdata en gesimuleerde schaduwstatus; echte MapLibre/OpenFreeMap-weergave. Geen gemeten zonnauwkeurigheid, FPS-benchmark of volledige assistieve-technologieaudit. De bestaande kaartbundlewaarschuwing blijft aanwezig.
- Volgende bouwfase volgens de roadmap: T4, restaurantverrijking, openingstijden en afbeeldingen, gevolgd door F3.

### F3 — Rijke locatiedetails, foto's en basisfilters

**Scope**
- Foto met attributie, overzichtelijke gegevens en leesbare weekopeningstijden.
- Acties voor opslaan, website, bellen, route en menulink waar beschikbaar.
- Filters voor horecatype, zonstatus, bevestigde terrassen, opening op gekozen tijdstip, keuken en eigen/opgeslagen plekken.
- Sorteren op naam en hemelsbrede afstand; geen looptijd claimen zonder routeberekening.
- Kaart en lijst gebruiken dezelfde filters; onbekende gegevens blijven herkenbaar.

**Oplevercriteria**
- Afbeeldingen worden alleen geladen waar nodig; geen verkeerde generieke zaakfoto's.
- Nu open en open op gekozen moment zijn duidelijk onderscheiden.
- Filtercombinaties, reset, nul resultaten en onbekende openingstijden werken.
- Toon geen restauranturen als garantie dat een terras open is.

**Commit:** `Show richer place details and discovery filters`

### F4 — Dagzonrapport voor iedere locatie

**Scope**
- Bekijk zonrapport voor horeca, adres en eigen kaartpunt.
- Dagkaart met zonduur, aandeel daglicht, langste periode en resterende/volgende zonperiode.
- Interactieve dagtijdlijn gekoppeld aan de kaarttijd.
- Opkomst, ondergang, daglengte en uitklapbare zonhoogte/-richting.
- Analysepunt kunnen aanpassen; duidelijk maken dat een adrespin niet automatisch de terras-/zitpositie is.
- Laden, annuleren, gedeeltelijke data en berekenfout zichtbaar afhandelen.

**Oplevercriteria**
- Dezelfde geselecteerde plek gebruikt dezelfde rapportgegevens in alle weergaven.
- Dagwijziging of nieuw punt kan geen oud rapport onder een nieuwe titel laten staan.
- Zon, schaduw en mogelijk gefilterd licht zijn ook zonder kleur te begrijpen.
- Rapport voor een punt op grondniveau wordt niet gepresenteerd als balkonhoogte-analyse.

**Commit:** `Add daily sun reports for selected locations`

**Uitvoering en bewijs — 7 oktober 2026**
- On-demand dagrapport toegevoegd aan het bestaande detailpaneel voor horeca, adressen en eigen/persoonlijke plekken. Het paneel blijft standaard gesloten. Geopend rapport toont circa zonduur, aandeel daglicht, langste periode, actuele en resterende/volgende zon, opkomst/ondergang/daglichtduur en uitklapbare lichtperioden, zonnestand en model-/bronbeperkingen.
- Native rapporttijdlijn en kaartklok volgen elkaar in beide richtingen, met minuutbediening en tekstuele toestanden naast kleur. De vensterlijst kiest de kaarttijd. De rapporttijdlijn volgt epoch-tijd en 23-/25-uursdagen; UTC-offsets maken de herhaalde kloktijd zichtbaar. Sampling blijft de 5-minuten-/circa 1-minuutbenadering van T5, zonder fijnere nauwkeurigheidsclaim.
- Tijdelijke zitpositie via kaartklik/draggable pin of coördinaten, met expliciete toepassen/annuleren en Escape. Bronpin en persoonlijke opslag blijven apart. Bewerken begint bij het gekozen zitpunt zodat expliciet Bewaren het als persoonlijk punt kan vastleggen; extra bestaande analysepunten worden behouden. Nieuwe selectie herstelt opgeslagen/defaultpositie.
- Datum, toegepast punt en bomeninstelling wissen oude uitkomsten voordat nieuw werk start. Camera en tijdwijzigingen starten geen dagberekening. Controller-generaties en abort weren late oude replies. Laden/annuleren, fout/retry, gedeeltelijke gegevens en herberekenen zijn aangesloten; live aankondigingen en focusherstel blijven begrensd. Pagehide ruimt de worker op en bfcache-terugkeer hervat een open rapport.
- Eindchecks geslaagd: `npm run lint` (Oxlint), `npm test` (210 tests in 27 bestanden), `npm run build` en `git diff --check`. Nieuwe regressies controleren aanvraagmoment, bron-/tijd-/puntinvalidatie, abort/late voortgang, retry, presentatietekst en tijdelijke puntisolatie.
- Native Chromium-browserflows geslaagd voor horeca/adres/eigen plek, gekoppelde sliders/toetsenbord/vensterselectie, hergebruik na kaartbeweging, coördinaten en kaartklik, Escape, bewaren met behouden bronpositie, onvolledige data, fout/herstel, annulering, poolnacht, late datumreplies en het dubbele wintertijduur. Synthetische Test-locaties en gecontroleerde rapportworkerresponses; echte MapLibre, opslag, selectie en klokgedrag.
- Gezamenlijke desktop-/mobielcontrole en bevestiging op 1366×900, 390×844, 320×740, 844×390 en gesimuleerd 390×400-toetsenbordviewport: paneel/kaartklok bereikbaar, geen pagina-/veld-overflow of bedieningsoverlap. Rapportinhoud scrollt binnen het bestaande paneel.
- Afzonderlijke productieflow onder `/Terraszon/` geslaagd met de echte native rapportworker, SunCalc en gedeelde netwerkbroker: geen rapportworker bij kaartstart, één hergebruikte worker na de rapportactie, twee daguitkomsten, geen extra aanvraag bij tijdkeuze, selectie van de laatste minuut 23:59 en correcte 1.500-minutentijdlijn met tweede 02:30. Bronresponses zijn synthetische volledige leegte; dit is integratiebewijs, geen praktijkzonmeting. Een eerste fixture miste POST-querydecodering en is gecorrigeerd; geen productiecodefix daarvoor nodig.
- Onafhankelijke visuele finish-review gaf `ship` voor de beoordeelde F4-uitbreiding, zonder materiële fixes. De mechanische detector gaf één radiusadvies; de legendaswatch gebruikt nu de bestaande 3px-schaal. De persistente live-aankondiging is gededupliceerd en de eindflow bevestigd. Documentatiecontrole bevestigde behoud van de bestaande stijl; DESIGN.md en zijn sidecar zijn behouden.
- Bewijsgrenzen: geen buitenvalidatie, FPS-benchmark of volledige assistieve-technologieaudit. Tijd volgt de browser; geen wereldwijde tijdzonelookup. Geen balkon-/weer-/parasolgarantie. De bestaande grote-bundlewaarschuwing blijft aanwezig. Volgende fase: F5, jaaroverzicht en dagdeelgrafieken.

### F5 — Jaaroverzicht en dagdeelgrafieken

**Scope**
- Maandgrafiek met berekende directe zonuren en selectie naar dagrapport.
- Zomer-, winter-, lente- en herfstvergelijking; de werkelijk gebruikte datum tonen.
- Ochtend vóór 12:00, middag van 12:00 tot 17:00, avond daarna, in lokale tijd.
- De maandgrafiek en seizoenssamenvattingen gebruiken dezelfde rapportuitkomsten.
- Jaaranalyse pas op aanvraag; dagrapport blijft bruikbaar tijdens het rekenen.

**Oplevercriteria**
- Toon representatieve dagen niet als exacte maandgemiddelden.
- Seizoensverdeling en dagdeeltotalen sluiten aan op de berekende dagduur.
- Bijna geen zon, veel zon, schrikkeljaar, annulering en onvolledige data hebben leesbare uitkomsten.
- Grafieken hebben tekstuele waarden en toetsenbordbediening.

**Commit:** `Add annual sun charts and seasonal comparisons`

**Uitvoering en bewijs — 7 oktober 2026**
- Jaaroverzicht op aanvraag toegevoegd onder het dagrapport, met twaalf maanddagen op de 15e en afzonderlijk 21 maart, juni, september en december. Methode en werkelijk gebruikte datums blijven expliciet zichtbaar; geen maandgemiddelden of claim dat de 21e altijd de astronomische seizoensgrens is.
- Horizontale maand-/seizoensgrafieken met gezamenlijke, op hele uren afgeronde schaal (minimaal één uur), leesbare duurwaarden en native datumknoppen. Directe zon, mogelijk gefilterd licht en onbekende tijd blijven afzonderlijk; schaduw/nacht staan niet in de balksom. Nul zon, gedeeltelijke data en fouten hebben eigen uitleg.
- Uitklapbare dagdeelgrafiek aangesloten op de bestaande rapporttotalen: ochtend vóór 12:00, middag 12:00–17:00, avond daarna, in browsertijd. Iedere jaarrij opent exact het bijbehorende dagrecord en dezelfde dagdeelwaarden, zonder nieuwe workerjob; kaartdatum en toetsenbordfocus volgen de keuze.
- Dag en jaar delen één lazy worker en obstakel-/dagcache. Het bestaande dagrapport blijft bruikbaar tijdens jaarwerk. Nieuwe dagberekening onderbreekt lopend jaarwerk; generatie-/abortguards weren late oude uitkomsten. Jaar/punt/bomenwijzigingen wissen jaarresultaten en rekenen alleen op expliciete aanvraag. Handmatig jaar blijft behouden bij kaart-/tijdupdates; verborgen resultaten worden alleen vóór expiry hergebruikt. Revisionverschillen worden gesynchroniseerd of ongeldig gemaakt.
- Bediening hersteld voor input-naar-actiecontinuïteit: jaarinvoer wordt vóór blur verwerkt, zodat typen en één klik op Berekenen werkt; ongeldig jaar start geen aanvraag. Coördinatenpreview verwerkt input vóór de toepasklik. De geopende rapportcontainer gebruikt overflow-clip zodat native scroll/focus de vaste paneelkop niet kan wegscrollen; maandnamen hebben voldoende kolombreedte.
- De lokale klokhelper behoudt ook gekozen jaren onder 100, in plaats van de impliciete JavaScript-1900-offset. Een regressie controleert jaar 4 inclusief 29 februari en 23:59, plus jaar 99.
- Eindchecks geslaagd: `npm run lint` (Oxlint), `npm test` (219 tests in 28 bestanden), `npm run build` en `git diff --check`. Nieuwe tests dekken on-demand jaarlifecycle, cache-expiry, handmatig jaar, punt-/instellingeninvalidatie, abort/late replies, herstel, overnemen/afwijzen van voorbereide dagen, schaal-/onzekerheidstekst en dagdeelinvarianten in een echt berekend schrikkeljaar.
- Chromium-browserflows geslaagd met herkenbare synthetische Test-locatie en gecontroleerde workerreports: jaar pas op aanvraag, bruikbaar dagrapport/tijdlijn tijdens jaarwerk, maand-/seizoenskeuze met identieke dagdelen zonder extra job, jaar typen/daarna klikken, ongeldig jaar, annulering, datumwissel tijdens jaarwerk, late replies, fout/herstel, onvolledigheid/revisions, geen zon en puntwissel.
- Desktop-/mobielcontrole op 1366×900, 390×844, 320×740 en 844×390: grafieken binnen het scrollbare paneel, geen pagina-/grafiek-overflow of overlap met kaartklok, vaste paneelkop zichtbaar. Korte schermen vragen scrollen vóór de datarijen; context, methode en schaal blijven leesbaar.
- Native productieflow onder `/Terraszon/` geslaagd: één echte gedeelde rapportworker, één dagjob plus jaarjobs voor 2024 en 2025 (ieder 16 dagen), alle dagdeeltotalen sluiten aan op de dagduur, geen extra jobs bij maand-/seizoensdagselectie, jaar typen en direct Berekenen werkt. Bronresponses zijn synthetische volledige leegte; renderer, SunCalc, worker en netwerkbroker zijn echt.
- Mechanische detector: geen bevindingen. Onafhankelijke finish-review vond één materieel herstelpunt bij jaarinvoer/blur; de verdict-pass scoorde dit opgelost en gaf `ship` voor die fix. Documentatiecontrole bevestigde behoud van de bestaande visuele wereld; DESIGN.md en sidecar zijn behouden.
- Bewijsgrenzen: geen praktijkzonvalidatie, benchmark of volledige assistieve-technologieaudit. Model-/weer-/bronbeperkingen van T5/F4 blijven van toepassing. De bestaande grote-bundlewaarschuwing blijft aanwezig. Volgende fase volgens de aangepaste volgorde: T6, gemeten verwerking- en cacheoptimalisatie.

### F6 — Selecteren op zonneduur en deelbare locaties

**Scope**
- Filter op gewenste aankomsttijd en minimale resterende zonduur.
- Begrensde analyse van kandidaatlocaties; sorteren op zonneduur wanneer resultaat beschikbaar is.
- Een locatie/analyseselectie delen via URL met punt, datum en tijd; geen automatische export van privénotities of actuele gebruikerspositie.
- Een gedeeld eigen punt tijdelijk openen; alleen lokaal bewaren na expliciete opslaanactie.

**Oplevercriteria**
- Onberekende plekken worden niet als nul zon behandeld.
- Begrensde groepsanalyse houdt kaart en tijdslider responsief.
- Gedeelde links herstellen de juiste selectie en gaan goed om met ongeldige parameters.

**Commit:** `Add sun-duration discovery and shareable locations`

**Uitvoering en bewijs — 8 oktober 2026**
- Zonneduurselectie aangesloten op geladen horeca en Mijn plekken, met aankomsttijd en minimum 15/30/60/90/120 minuten resterende aaneengesloten directe zon. Alleen-zon-kaartstatus is geen voorfilter; een persoonlijk analysepunt krijgt voorrang. Geschikte berekende plekken worden aflopend gesorteerd. Gefilterd licht telt niet mee; onbekend/onberekend wordt apart getoond en nooit als nul zon behandeld.
- Expliciete analyse: zes kandidaten sequentieel per stap, maximaal 24 per zoekcontext en 20 seconden per punt. Eén tijdelijke groepsworker, beëindigd na de stap of bij annulering/context-/selectiewissel; geen worker per kandidaat. Datum, aankomst, kandidaten of bomeninstelling invalidereert oude uitkomsten. Een resultaat gebruikt precies dezelfde voorbereide dagdata en aankomstklok in details, zonder extra dagjob als de context overeenkomt. Pagehide annuleert werk en laat bij terugkeer een herstartbare toestand achter.
- Versie-1-deellinks met allowlist van punt, epoch, datum/minuten, bronzone en bomeninstelling. Geen persoonlijke naam/notitie/favorietstatus, bronidentiteit of automatische browserpositie; bestaande URL-query wordt verwijderd. Klembordfallback toont een geselecteerd readonly-linkveld. Ontvangst opent tijdelijk een eigen punt, zonder autosave; bewaren is expliciet. Bronzone/epoch bewaart dubbele wintertijd en hetzelfde moment bij andere browserzones; de lokale ontvangstdatum kan daardoor verschillen. Geen geografische tijdzone-lookup of meegedeelde rapportuitkomst.
- Ongeldige versies, parameters/duplicaten, getallen, bereik, zone en datum/tijd-inconsistenties worden geweigerd met een herstelmelding; locatiekeuze maakt die melding weer vrij. Een persistent paneelbericht onderscheidt tijdelijke en opgeslagen gedeelde punten en bron-/ontvangerklok.
- Eindchecks geslaagd: `npm run lint` (Oxlint), `npm test` (236 tests in 32 bestanden), `npm run build` en `git diff --check`. Regres­sies dekken budget/workerlevensduur, filtering/sortering/onzekerheid, context/abort/late replies, genegeerde abort/deadline, linkroundtrip/privacy/invaliditeit en dubbele wintertijd.
- Browserflows geslaagd met synthetische Test-locaties/rapporten en echte MapLibre/opslag/klokken: 6 aanvragen met één opgeruimde groepsworker, juiste sortering/unknown, aankomst naar kaart en voorbereid rapport zonder extra job, private naam/notitie niet in link, clipboardfallback, tijdelijke ontvangst zonder opslag, expliciet bewaren, UTC-conversie met hetzelfde epoch, annuleren en ongeldig-linkherstel. Desktop 1366×900, mobiel 390×844, smal 320×740 en landschap 844×390: geen pagina-/veld-overflow; resultaten en formulier blijven scrollbaar in het vaste paneel.
- Native productiecheck onder `/Terraszon/` geslaagd met de echte groeps-/dagworker: één gemaakt én beëindigd, zes sequentiële dagjobs, nul extra jobs bij resultaatkeuze, aankomst 12:00 gekoppeld aan de kaart. Bronresponses zijn synthetische volledige leegte; UI, rekenworker en hostingpad zijn echt.
- Mechanische detector: geen bevindingen. Onafhankelijke visuele review gaf `ship` zonder materiële F6-fixes; documentatiecontrole bevestigde behoud van de bestaande stijl. DESIGN.md en sidecar zijn behouden. De afzonderlijke RAM-/OOM-hotfix `cf7066e` is geen bewijs dat iedere browser-/GPU-OOM uitgesloten is.
- Bewijsgrenzen: geen live zonnauwkeurigheidsmeting, fysieke-devicebenchmark of volledige assistieve-technologieaudit. F3-/providerdetails blijven geparkeerd; er is geen nieuwe bron/provider/dependency toegevoegd. De bestaande grote-bundlewaarschuwing blijft. Geografische uitbreiding T7→T8 volgt pas na afstemming van datapilot, actualisering en hosting/licenties.

## Beslismomenten en latere uitbreidingen

- **Voor T4:** openingstijdenparser, beeldselectie en attributie kiezen. De huidige bronnen garanderen geen complete uren of foto's in Groningen.
- **Na F3:** dezelfde gecontroleerde Groningen-zaken vergelijken bij gratis bronnen, Geoapify en eventueel Foursquare. Alleen een betaalde koppeling bouwen als extra dekking de kosten en opslagvoorwaarden rechtvaardigt.
- **Voor T5:** samplingnauwkeurigheid, begrensd obstakelgebied en omgang met onvolledigheid vastleggen. De interactieve renderlimieten zijn niet automatisch geschikt voor een betrouwbaar rapport.
- **Na T6:** meten of lokale preprocessing de beste volgende investering is.
- **Voor T7/T8:** actualiseringsfrequentie, hosting, bronlicenties en datapipeline bevestigen.
- Internationale tijdzones, balkonhoogte, weercontext, PWA/offline, publieke bijdragen en accounts zijn afzonderlijke toekomstige fases; ze worden niet ongemerkt onderdeel van deze bouwfases.

## Bronkeuze

- OSM en gecontroleerde Wikimedia Commons-/ondernemersfoto's: eerste route.
- Foursquare Open Source Places: mogelijke aanvulling voor zaken en categorieën, niet voor foto's of openingstijden.
- Geoapify: mogelijke bronadapter voor zoek-/detailgemak; eerst extra waarde en voorwaarden toetsen.
- Foursquare Places API: mogelijke betaalde verrijking; API-opslagregels verschillen van de open dataset.
- Google Places: geen standaard vrije databron voor het eigen MapLibre-detailpaneel; kaart-/opslagvoorwaarden en EEA-regels beperken dit gebruik. Places UI Kit is een afzonderlijke integratiekeuze.

Referenties: [OSM](https://www.openstreetmap.org/copyright), [Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), [Geoapify Details](https://apidocs.geoapify.com/docs/place-details/), [FSQ OS-schema](https://docs.foursquare.com/data-products/docs/places-os-data-schema), [Foursquare API-opslagregels](https://docs.foursquare.com/fsq-developers-places/reference/usage-guidelines), [Google EEA-regels](https://developers.google.com/maps/comms/eea/places), [Groningen bomen](https://data.groningen.nl/dataset/bomen/04da3775-07f0-4388-bc12-7cd7536b04cd), [3DBAG](https://docs.3dbag.nl/en/schema/attributes/).
