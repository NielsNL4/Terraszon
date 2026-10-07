# Terraszon — technische en featurefases

Dit plan is opgesteld op 7 oktober 2026. T1 is uitgevoerd en gecontroleerd; de overige fases staan nog open. Implementatie en commits volgen per bouwfase.

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
| T2 | Requesthergebruik en netwerkplanning | T1 | Open |
| T3 | Locatiemodel en persoonlijke opslag | — | Open |
| T4 | Restaurantverrijking, openingstijden en afbeeldingen | T3 | Open |
| T5 | Zonrapport-engine per analysepunt | T1, T3 | Open |
| T6 | Gemeten verwerking- en cacheoptimalisatie | T2, T4, T5 | Open |
| T7 | Statische Groningen-datapilot | T1, T2; vergelijking met T6 | Open, later |
| T8 | Nederlandse databronnen en hoogteverrijking | Evaluatie T7 | Open, later |
| F1 | Ontdekmenu en gedeelde locatieselectie | T3 | Open |
| F2 | Mijn plekken, toevoegen en import/export | T3, F1 | Open |
| F3 | Rijke locatiedetails, foto's en basisfilters | T4, F1 | Open |
| F4 | Dagzonrapport voor iedere locatie | T5, F1 | Open |
| F5 | Jaaroverzicht en dagdeelgrafieken | F4 | Open |
| F6 | Selecteren op zonneduur en deelbare locaties | F2, F3, F4; evaluatie T6 | Open, later |

## Aanbevolen bouwvolgorde

**T1 → T2 → T3 → F1 → F2 → T4 → F3 → T5 → F4 → F5 → T6**

Hiermee komt eerst betrouwbaar laden, vervolgens een bruikbaar locatiemenu en daarna het complete zonrapport. T6 optimaliseert op basis van de werkelijk gebouwde flows.

Na die basis volgen **F6** en de geografische uitbreiding **T7 → T8**. Start geen betaalde provider, grotere datadownload of nieuwe hostingopzet zonder de keuze en operationele gevolgen eerst te bevestigen.

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
- Enkele gecontroleerde Groningen-punten buiten vergelijken; positie-, hoogte-, boom- en parasolfouten afzonderlijk noteren.

**Commit:** `Calculate daily and seasonal sun reports in a worker`

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
