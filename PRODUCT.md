# Terraszon

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mensen die een zonnige terras- of buitenplek willen vinden en een geschikt bezoekmoment willen kiezen. Groningen en Nederland hebben prioriteit.

## Product Purpose

Terraszon combineert een interactieve kaart met de zonnestand en geschatte gebouw- en boomafscherming. Het doel is bruikbaar locatieadvies: een plek vinden, de positie begrijpen en op een gekozen moment beoordelen.

## Operating Context

De kaart is het primaire werkvlak, op desktop en mobiel. Gebruikers zoeken een adres of plek, bekijken horeca in het kaartgebied en kiezen datum en tijd. Het ontdekmenu start op beide schermtypen gesloten; Ontdek en een locatieselectie openen het.

## Capabilities and Constraints

- Statische, Nederlandstalige browserapp; berekeningen draaien lokaal.
- Datum/tijd, locatiezoeken, browserlocatie, horeca en indicatieve gebouw-/boomschaduw zijn aanwezig.
- Persoonlijke locaties blijven lokaal zonder account. Mijn plekken biedt opslaan, eigen punten, naam/type/notitie, bewerken/verwijderen en handmatige GeoJSON-import/export.
- Gratis databronnen eerst. T4 biedt herleidbare restaurantvelden, afzonderlijke uren en gelicentieerde Wikimedia-metadata; F3 verzorgt de rijkere weergave. Beelddekking moet per locatie worden gecontroleerd.
- Het geplande zonrapport bevat dagelijkse zonduur en een maand-/seizoensvergelijking, naar de aangeleverde Coffee in the Sun-referentie.
- Zon volgens de geometrie is geen weersvoorspelling. Boomafscherming is een schatting; onbekende data moet herkenbaar blijven.
- Restaurantpins zijn niet automatisch exacte terrasposities. Analysepunten en bronposities zijn afzonderlijk gemodelleerd.
- Bouwvolgorde, scope, controles en één commit per fase staan in ROADMAP.md.

## Brand Commitments

De naam Terraszon en Nederlandse bediening blijven behouden. Ontdekken en persoonlijke locatiebediening breiden de bestaande kaartinterface uit binnen de aanwezige stijl.

## Evidence on Hand

README.md, ROADMAP.md, de bestaande interface in src/main.ts en src/styles.css, en geautomatiseerde regressietests. Horecagegevens komen uit OpenStreetMap; afbeeldingen en actuele openingstijden zijn niet voor iedere zaak beschikbaar.

## Product Principles

- Een geselecteerde locatie en analysepositie zijn consistent tussen zoeken, lijst en kaart.
- Bruikbare data blijft zichtbaar tijdens laden; onzekerheid en bronfouten blijven eerlijk benoemd.
- Persoonlijke gegevens en brongegevens worden afzonderlijk beheerd.
- De kaart en de tijdkeuze blijven bereikbaar tijdens het ontdekken van plekken.
