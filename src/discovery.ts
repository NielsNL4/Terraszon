import type { DataBounds } from './data-coverage';
import { terracePlace, type Place, type PlaceCoordinates, type PlaceSelection } from './places';
import type { TerraceEvidence, TerraceFeature, TerraceStatus } from './types';

export type DiscoveryRow = { place: Place; feature: TerraceFeature; distance: number; status: TerraceStatus | null };
export type DiscoveryContext = {
  terraces: TerraceFeature[];
  bounds: DataBounds | null;
  origin: PlaceCoordinates;
  originLabel: 'je locatie' | 'het kaartcentrum';
  state: 'loading' | 'ready' | 'error' | 'zoom';
  onlySunny: boolean;
  terracesVisible: boolean;
  statusPending: boolean;
  statusUnavailable: boolean;
  timeLabel: string;
};

export function distanceMeters(a: PlaceCoordinates, b: PlaceCoordinates): number {
  const radians = Math.PI / 180;
  const latitude = (b[1] - a[1]) * radians, longitude = (b[0] - a[0]) * radians;
  const haversine = Math.sin(latitude / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(longitude / 2) ** 2;
  return 6_371_008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

export function formatDistance(meters: number): string {
  return meters < 1_000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1_000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km`;
}

export function inDiscoveryBounds(coordinates: PlaceCoordinates, bounds: DataBounds): boolean {
  if (coordinates[1] < bounds.south || coordinates[1] > bounds.north) return false;
  if (bounds.east - bounds.west >= 360) return true;
  const normalize = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;
  const west = normalize(bounds.west), east = normalize(bounds.east), longitude = normalize(coordinates[0]);
  return west <= east ? longitude >= west && longitude <= east : longitude >= west || longitude <= east;
}

const amenityNames: Record<string, string> = {
  restaurant: 'Restaurant', cafe: 'Café', bar: 'Bar', pub: 'Pub', biergarten: 'Biertuin',
  fast_food: 'Snackbar / snelle hap', food_court: 'Foodcourt', ice_cream: 'IJssalon', 'outdoor seating': 'Terras',
};
export const amenityLabel = (amenity?: string) => amenity && Object.hasOwn(amenityNames, amenity) ? amenityNames[amenity] : 'Horecalocatie';
export const evidenceLabel = (evidence: TerraceEvidence) => evidence === 'confirmed' ? 'Terras bevestigd'
  : evidence === 'mapped' ? 'Terras ingetekend' : 'Terras niet bevestigd';
export const statusLabel = (status: TerraceStatus | null) => status === 'sun' ? 'In de zon' : status === 'shade' ? 'Gebouwschaduw'
  : status === 'filtered' ? 'Mogelijk gefilterd licht' : status === 'night' ? 'Geen direct daglicht' : 'Zonstatus berekenen…';
export function sourceFact(field: 'terrace' | 'wheelchair' | 'covered' | 'seasonal', value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const labels: Record<typeof field, Record<string, string>> = {
    terrace: { yes: 'Ja', no: 'Nee', terrace: 'Terras', patio: 'Patio', balcony: 'Balkon', garden: 'Tuin', rooftop: 'Dakterras', unknown: 'Onbekend' },
    wheelchair: { yes: 'Rolstoeltoegankelijk', no: 'Niet rolstoeltoegankelijk', limited: 'Beperkt toegankelijk', unknown: 'Onbekend' },
    covered: { yes: 'Overdekt', no: 'Niet overdekt', partial: 'Gedeeltelijk overdekt', partially: 'Gedeeltelijk overdekt', unknown: 'Onbekend' },
    seasonal: { yes: 'Seizoensgebonden', no: 'Niet seizoensgebonden', summer: 'Zomer', winter: 'Winter', spring: 'Lente', autumn: 'Herfst',
      dry_season: 'Droog seizoen', wet_season: 'Nat seizoen', unknown: 'Onbekend' },
  };
  return value.split(';').map(part => {
    const key = part.trim().toLocaleLowerCase('nl-NL');
    return Object.hasOwn(labels[field], key) ? labels[field][key] : `Bronwaarde: ${part.trim()}`;
  }).join(', ');
}
const searchable = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('nl-NL');

export function discoveryRows(context: DiscoveryContext, query = ''): DiscoveryRow[] {
  if (!context.bounds || !context.terracesVisible || context.state === 'zoom') return [];
  const tokens = searchable(query.trim()).split(/\s+/).filter(Boolean);
  return context.terraces.flatMap(feature => {
    const place = terracePlace(feature);
    if (!inDiscoveryBounds(place.coordinates, context.bounds!)) return [];
    if (context.onlySunny && !['sun', 'filtered'].includes(feature.properties.status)) return [];
    const text = searchable(`${place.name} ${place.address ?? ''} ${amenityLabel(place.venue?.amenity)}`);
    if (!tokens.every(token => text.includes(token))) return [];
    return [{ place, feature, distance: distanceMeters(context.origin, place.coordinates),
      status: context.statusPending || context.statusUnavailable ? null : feature.properties.status }];
  }).sort((a, b) => a.distance - b.distance || a.place.name.localeCompare(b.place.name, 'nl-NL') || a.place.id.localeCompare(b.place.id));
}

export function selectedTerrace(selection: PlaceSelection, context: DiscoveryContext): TerraceFeature | undefined {
  return context.terraces.find(feature => terracePlace(feature).id === selection.place.id);
}

export function selectionStatus(selection: PlaceSelection, context: DiscoveryContext): TerraceStatus | null {
  const feature = selectedTerrace(selection, context);
  if (!feature || context.statusPending || context.statusUnavailable || context.state === 'zoom') return null;
  // The current terrace classifier describes the source pin, not a personally
  // moved terrace point. The latter gets its own analysis in the sun-report phase.
  if (distanceMeters(selection.analysisPoint.coordinates, feature.geometry.coordinates as PlaceCoordinates) > 0.5) return null;
  return feature.properties.status;
}
