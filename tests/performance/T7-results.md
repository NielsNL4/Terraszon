# T7 — Groningen static-first pilot

## Dataset en onderhoud

- Gebied: 53,21–53,23° N / 6,56–6,58° E, twee cellen `centrum-zuid` en `centrum-noord`, circa 3 km².
- Publicatierevision: `rmuzh9pma-e4a8032b2232`.
- 10.079 unieke OSM-gebouwen; celbestanden delen grensgebouwen en dedupliceren op OSM-ID bij gebruik.
- 4.152 unieke gemeentelijke bomen binnen de werkelijke WGS84-celgrenzen. WFS retourneerde 2.041 en 2.255 bronrecords; alle pagina's kwamen overeen met `numberMatched`. De geprojecteerde WFS-envelope selecteerde ook bomen buiten de exacte WGS84-cel. Na expliciete begrenzing blijven 1.988 en 2.164 over, zonder binnengebied-bomen weg te laten.
- Vier payloadbestanden, samen 4.037.316 bytes ongecomprimeerd; ieder kleiner dan de grens van 3 MiB. Manifest bevat SHA-256, bytes, counts, bounds, bron, licentie, `capturedAt` en `expiresAt`.
- Gebouwen: © OpenStreetMap contributors, ODbL 1.0. Bomen: Gemeente Groningen, CC BY 4.0, officiële WFS; gescheiden bestanden en bronattributie. Licentie gecontroleerd via [OSM](https://www.openstreetmap.org/copyright) en [data.overheid.nl](https://data.overheid.nl/dataset/groningen-bomen-gemeente-groningen). De gemeentelijke portal/API gaf 403; de publieke overheidsregistratie vermeldt de WFS-distributie en CC BY 4.0.
- Handmatige refresh: `npm run data:refresh`. Maximaal 12.001 OSM-queryrecords met sentinel, maximaal vier gemeentelijke pagina's per cel, 45 s brondeadlines; geen automatische endpointrotatie of quota-omzeiling. Build/deploy downloadt niet opnieuw.
- Alleen complete, valide en begrensde snapshots worden gepubliceerd. Nieuwe revisiebestanden worden eerst gevalideerd, het manifest atomisch vervangen en alleen de bekende vorige revision wordt daarna verwijderd. Bij download-/paging-/validatiefouten blijft de vorige publicatie staan.
- Snapshotgeldigheid maximaal 30 dagen. Daarna, buiten de dekking, bij ontbrekend/corrupt bestand of mislukte manifestcontrole wordt de bestaande live route gebruikt. Het is een distributieproef, geen update van hoogte-/zonnauwkeurigheid.

## Vergelijking

Voor herhalen: leg de capture vast tijdens de refresh met `PILOT_CAPTURE_FILE=/tmp/pilot-capture.json npm run data:refresh`. Gebruik een bestaande Playwright-installatie (zoals de T6-runner) en `node tests/performance/t7-benchmark.mjs /tmp/pilot-capture.json /tmp/t7-results.json`, met eventueel `PLAYWRIGHT_MODULE` en `CHROMIUM_EXECUTABLE`. De capture en gepubliceerde revision moeten bij elkaar horen; inhoudshashverschillen stoppen de vergelijking.

Dezelfde vastgelegde OSM/WFS-bronresponses zijn afgespeeld naast de gepubliceerde bestanden. Browser, parser, gzip en timing zijn echt; netwerkvertraging is gecontroleerd op 120 ms per request. Geen extra Overpass-downloads voor iedere herhaling.

- Linux x64, Intel i7-7700, Chromium 153.0.8010.12; desktop 1366×900 CPU1× en mobiel 390×844 CPU4×-emulatie.
- Drie nieuwe browsercontexten per toestand en device: twaalf runs.
- Vite-dev-modules; inclusief bronparsing bij replay en inclusief manifest/checksum/validatie/decoding bij static.
- De live replay bestaat uit één gebouwrespons en zes WFS-pagina's. Static heeft één manifest en vier cellen. Gemeenschappelijke module-imports en de inhoudshashvergelijking vallen buiten de gemeten laadfase.
- Canonieke inhoudshashes van **alle** genormaliseerde gebouwen en bomen zijn gelijk tussen beide toestanden. Het verschil is niet verkregen door objecten te laten verdwijnen.

| Toestand | Bronreplay | Static |
| --- | ---: | ---: |
| Requests | 7 | 5 |
| Gzip-responsebytes | 1.517.284 | 753.450 |
| Gedecodeerde bytes incl. manifest | 9.434.491 | 4.038.878 |
| Desktop mediane laadfase | 1.619 ms | 899 ms |
| Mobielsimulatie mediane laadfase | 2.415 ms | 1.278 ms |

| Device/toestand | Herhalingen (afgerond, ms) |
| --- | --- |
| Desktop replay | 1.567 / 1.641 / 1.619 |
| Desktop static | 935 / 896 / 899 |
| Mobiel replay | 2.356 / 2.415 / 2.522 |
| Mobiel static | 1.278 / 1.270 / 1.319 |

Gzipbytes zijn circa 50,3% lager; de mediane gecontroleerde laadfase is circa 44,4% lager op desktop en 47,1% lager in mobielsimulatie. Dat zijn geen algemene Pages-/live-provider-/fysieke-telefoonpercentages. De echte gebouwcapture duurde ongeveer 7,3 s; dat is bron-/exporttijd op de ontwikkelhost en niet hetzelfde experiment als de browserreplay.

## Native productiecheck

Onder `/Terraszon/` zijn echte productie-assets, echte MapLibre en native gebouw-/rapportworkers gebruikt met de echte gepubliceerde celbestanden. Alleen horeca en live-fallback buiten de pilot zijn synthetisch/volledig leeg gemaakt.

- Met pilot: 10.079 gebouwen bereiken de gebouw-worker; dagrapport bevat de juiste datasetrevision. Volledig gedekte pilotgebouwcellen doen geen Overpass-query.
- Zonder pilot (404): gebouwdata gaat via de bestaande live route; geen statische datasetrevision wordt ten onrechte toegepast.
- Buiten-/buffergebieden blijven live nodig: in deze volledige viewport-/rapportflow waren er zes live gebouwrequests met pilot tegenover acht zonder pilot. Dit is geen belofte van nul live requests in het centrum.
- Alle statische URLs gebruiken de geneste `/Terraszon/data/groningen/`-basis; geen ongehanteerde browserfouten.
- Diagnostische hoofdthreadheap gaf in een proef circa 93 MB met echte data versus 75 MB met de lege fallbackfixture, en in een herhaling circa 139/138 MB. GC-/meetmoment en verschillende objectaantallen maken dit geen betrouwbare voor/na-RAM-vergelijking; GPU-/worker-/fysieke-devicegeheugen is er niet volledig mee bepaald.

## RAM, integriteit en regressies

- Maximaal twee gevalideerde celbestanden, 6 MiB encoded payload en 12.000 decoded records in de pilot-LRU; streamgrens 3 MiB per file, 32 KB manifest en maximaal 125.000 gebouwcoördinaten per cel. Tijdelijke checksum/JSON-allocaties blijven begrensd maar kosten wel geheugen.
- Manifestdeadline 1,5 s, filedeadline 3,5 s; caller-abort blijft werkzaam bij genegeerde fetch-abort. Checksums en aantallen worden pas als dekking toegepast na succesvolle validatie.
- Nieuwe manifestrevision/expiry invalideert bron-/rapportgebruik; reportrevision bevat datasetstamps. Bomen vullen ontbrekende strips live aan en benoemen de werkelijk gebruikte bronnen. Meer dan 4.000 statische ouderrecords worden eerst begrensd/verfijnd vóór live budget op buitenstrips wordt besteed.
- Snapshotdatum blijft anders dan rapportophaal-/cachetijd; de bron-/modeldisclosure noemt pilotrevision en ophaal-/vervaldatum.
- Tests dekken normale assets, exacte publicatiechecksums/counts, invaliditeit, partiële dekking, buitengebied zonder manifestrequest, revision, expiry, timeout en abort. Ontbrekende gemeentelijke hoogteklasse `null` wordt genormaliseerd naar `undefined`; het schaduw-/hoogtemodel wordt niet vervangen.

## Beperkingen

Geen backend, betaald providercontract, PMTiles/FlatGeobuf of automatische nationale download toegevoegd. Geen weer-/veldvalidatie, fysieke-mobiel-FPS-claim of garantie van OOM-eliminatie. De eerdere opstartbudgets blijven behouden; static betekent minder bronwerk, niet onbeperkt meer objecten in RAM. Voor T8 moeten landelijke bron/hoogtekeuze en onderhoud afzonderlijk worden vastgelegd.
