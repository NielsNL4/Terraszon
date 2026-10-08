# T6 — verwerking en cachelevensduur

Gemeten op 8 oktober 2026. Baseline: `3d8df41`; nameting: de T6-wijzigingen bij dit document. Dit is een gecontroleerde component-/integratiemeting, geen live Groningen- of fysieke-telefoonbenchmark.

## Opzet en herhalen

- Linux x64, Intel Core i7-7700 @ 3,60 GHz, 8 logische cores, 63 GiB RAM; Node 22.22.1, Chromium 153.0.8010.12.
- Desktop 1366×900, CPU1×; mobiel 390×844, touch en Chrome CPU4×-emulatie. Het is dezelfde host, geen twee fysieke apparaten.
- Dichte bebouwing: 3.000 gebouwen en 600 bomen. Boomrijk: 600 gebouwen en 4.000 bomen. Iedere reeks heeft drie onafhankelijke browsercontexten per toestand, dus twaalf runs vóór en twaalf na.
- Bronresponses zijn vaste synthetische Groningen-vormige records met 120 ms wachttijd per request. Gemeentelijke bomen zijn gepagineerd per 1.000. Geen publieke bronquota zijn gebruikt.
- De meetcyclus leest de boombron koud/warm, start een native rapportworker na die bronwarmte, herhaalt dezelfde dag, herstart de worker met warme permanente opslag, bereidt gebouwgeometrie koud/identiek voor en wijzigt 100 gebouwtypes. Daarna tekent echte MapLibre/WebGL dezelfde obstakels met een lokale lege basisstijl en SwiftShader; 30 frame-intervallen worden bemonsterd.
- `fetchTrees`-tijden zijn bronadaptertijden, geen totale kaartstartup. De bestaande ruimtelijke viewcache was al aanwezig. Warm bronhergebruik wordt nu ook door een begrensde record-/decodecache geleverd. Workerherstart is een andere toestand dan dezelfde reeds voorbereide worker.

De browserdriver is optioneel en geen projectdependency. Gebruik een bestaande Playwright-installatie en Chromium:

```sh
PLAYWRIGHT_MODULE=/pad/naar/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/pad/naar/chromium \
node tests/performance/t6-benchmark.mjs after /tmp/t6-after.json
```

Gebruik dezelfde runner en fixtures tegen een aparte checkout van `3d8df41` met `T6_ROOT=/pad/naar/baseline` voor de voormeting. Output bevat per run alle timings, requestaantallen, bytes, recordaantallen, dekking en rapporttotalen. Het bestand wordt tussentijds opgeslagen. De driver stelt geen snelheidsgrens als CI-test; onderliggende gedragsregressies staan in Vitest.

## Medianen van drie runs

Tijden in milliseconden. `Voor → na`; `<0,1` is onder de bruikbare meetresolutie, niet nul werk. Geometrie-warmte is per run het gemiddelde van tien identieke voorbereidingen.

| Toestand | Desktop dicht | Desktop boomrijk | Mobiel dicht | Mobiel boomrijk |
| --- | ---: | ---: | ---: | ---: |
| Boombron koud | 148,7 → 152,8 | 599,9 → 579,4 | 196,3 → 222,1 | 815,6 → 723,6 |
| Boombron warm | 3,7 → 0,1 | 20,0 → <0,1 | 12,9 → 0,1 | 67,5 → 0,7 |
| Nieuwe worker na bronwarmte | 471,2 → 457,6 | 786,8 → 349,8 | 549,1 → 647,0 | 882,2 → 474,5 |
| Dezelfde worker/dag warm | 0,6 → 0,5 | 0,6 → 0,4 | 1,7 → 2,0 | 1,8 → 2,0 |
| Herstart worker / warme opslag | 341,8 → 262,3 | 726,2 → 229,0 | 436,4 → 268,9 | 803,1 → 227,6 |
| Worker-obstakelfase | 247,2 → 235,4 | 613,7 → 184,7 | 252,3 → 286,9 | 622,9 → 235,1 |
| Worker-rekenfase | 113,6 → 117,4 | 65,3 → 68,6 | 136,8 → 135,0 | 71,4 → 68,6 |
| Gebouwvoorbereiding koud | 9,8 → 9,2 | 2,7 → 2,9 | 33,0 → 34,8 | 11,6 → 12,6 |
| Identieke gebouwvoorbereiding | 3,26 → 0,01 | 0,97 → <0,1 | 13,10 → <0,1 | 3,60 → 0,01 |
| CPU voor 100 typewijzigingen | 4,6 → 7,4 | 0,7 → 2,3 | 16,2 → 32,5 | 5,4 → 8,7 |
| Bronrequests in hele meetcyclus | 6 → 4 | 15 → 7 | 6 → 4 | 15 → 7 |
| Bronresponsebytes in cyclus | 2.808.768 → 2.606.470 | 2.536.506 → 1.178.474 | 2.808.768 → 2.606.470 | 2.536.506 → 1.178.474 |

### Afzonderlijke herhalingen: workerherstart

| Toestand | Voor (ms) | Na (ms) |
| --- | --- | --- |
| Desktop dicht | 342 / 361 / 326 | 266 / 262 / 232 |
| Desktop boomrijk | 718 / 726 / 747 | 229 / 213 / 243 |
| Mobiel dicht | 436 / 333 / 440 | 269 / 295 / 264 |
| Mobiel boomrijk | 803 / 747 / 812 | 220 / 228 / 295 |

De afgeronde losse waarden dienen als spreidingsindicatie; de runner bewaart volledige precisie voor nieuwe runs.

## Wat aantoonbaar verandert

- Een herstartte worker kan dezelfde permanente boomcache lezen als de hoofdthread. Voorheen zat deze alleen in `localStorage`, dat in workers ontbreekt. In het boomrijke scenario daalt de mediane workerherstart van 726 naar 229 ms (desktop) en 803 naar 228 ms (mobielsimulatie).
- Warme bronlezingen hergebruiken begrensde, voorbereide records. De volledige 13-punts-kronen worden niet meer synchroon als grote GeoJSON-string gelezen/geschreven. Alleen compacte punt-/profielrecords worden klein geserialiseerd voor asynchrone IndexedDB-opslag.
- Voor 4.000 bomen: volledig geserialiseerd bronobject **6.323.226 UTF-16-bytes**, compact object **2.187.976**, circa **65,4% minder**. Dit is een serialisatieproxy, niet gemeten fysieke IndexedDB-diskruimte. Alle 4.000 kroonpolygonen en profieleigenschappen zijn exact teruggelezen en vergeleken.
- De serialized property-diff voor 100 gebouwtypes daalt **32.026 → 8.225 bytes**, circa **74,3% minder**. MapLibre krijgt property-updates, geen remove/add met dezelfde polygonen. Een native MapLibre-test controleert type/hoogtewijziging met behouden geometrie.
- Gelijke bounds zonder nieuwe data/tiles/reset vermijden herhaalde signatures/indexvoorbereiding. Bounds, geometrie, hoogteevidentie, brondata en contextreset blijven invalidatiepunten.
- Objectaantallen, dekking/limietstatus en rapporttotalen zijn tussen vóór/na gecontroleerd; er is geen dataverlies ingezet om sneller te lijken.

## Grenzen en tegenvallers

Niet ieder pad is sneller. Koude dense cache-initialisatie en het construeren van property-diffs kunnen meer CPU kosten; het wire-/clonevolume is wel kleiner. In de mobiel-dichte run werd de eerste worker na bronwarmte 549 → 647 ms. Deze kosten staan hierboven en worden niet verborgen achter één algemeen snelheidspercentage. De dagrekenkern zelf is niet geoptimaliseerd.

De rendering is afzonderlijk gemeten, maar niet veranderd. Software-GL is gevoelig voor scheduling en levert geen geloofwaardige fysieke-device-FPS-claim:

| Renderdiagnostiek (ms) | Desktop dicht | Desktop boomrijk | Mobiel dicht | Mobiel boomrijk |
| --- | ---: | ---: | ---: | ---: |
| Map-/broninitialisatie | 1.290 → 1.319 | 1.125 → 1.274 | 1.941 → 1.981 | 1.708 → 1.513 |
| Gemiddeld frame-interval | 103,4 → 93,1 | 106,9 → 119,5 | 205,7 → 170,7 | 152,3 → 148,3 |

Long-taskdiagnostiek is ondersteunend: callbacks worden asynchroon afgeleverd, niet elke fase wordt exact afgebakend. Er is geen claim dat alle cold-load long tasks zijn verdwenen. Dit zijn Vite-dev-modulemetingen met echte workers, geen productie-deploymentbenchmark; een aparte productieflow onder `/Terraszon/` bevestigt werking van de assets en dag-/jaarflow. Openingstijden/media zijn niet als nieuwe performanceclaim gemeten.

## Cachecontract en verificatie

- IndexedDB `terraszon-data-v1`, schema **2**, met aparte kleine metadata: maximaal **64 gebieden en 60.000 recordslots** totaal, expiry en LRU. Leegte neemt één slot in. Geen claim van een exacte MB-limiet.
- v1-public-sourcegegevens worden bij upgrade ongeldig gemaakt. Oude `terraszon:v5:trees:*`-geometrie wordt begrensd opgeruimd; persoonlijke plekken en kleurvoorkeuren blijven behouden.
- Complete boomrecords maximaal 24 uur; aantoonbare boomleegte één minuut. Fouten, afkapping en gedeeltelijke gebieden worden niet permanent als volledig gecachet. Gebouwleegte blijft kort in de bestaande memorycache.
- Boomrecord-/decodecache maximaal acht gebieden en 12.000 records; bestaande view-/rapportbudgetten blijven gelden. Readonly geometryreads lopen parallel; metadata-touch/cleanup volgt apart. Quota, geblokkeerde opslag en corrupte data laten bronladen beschikbaar.
- Native browserverificatie: v1→v2-invalidatie, LRU, opslaglimieten, oversized weigeren, expiry én opruiming, exacte 4.000-record-roundtrip, behouden persoonlijke data en echte MapLibre-propertypatch.
- Unitregressies: versie/corruptie/TTL, cachefouten en abort, paging/afkapping, bron-/recordvolledigheid, gebouwdiff en data-/bounds-/resetinvalidatie. De bestaande openingstijdenfixture heeft een vaste testklok gekregen: upstream-waarschuwingen over een expliciete inmiddels verlopen datum maakten die test kalenderafhankelijk; productwaarschuwingen zijn behouden.
