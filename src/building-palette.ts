// Snapshot of the documented building=* values on the OpenStreetMap wiki.
// https://wiki.openstreetmap.org/wiki/Category:Tag_descriptions_for_key_"building"
// The tag is open-ended: unlisted and unknown values use the fallback color.
const documentedValues = `
abandoned agricultural allotment_house annexe apartments bakehouse barn barracks bath beach_hut bell_tower
boathouse brewery bridge bungalow bunker bus_station cabin carport castle cathedral cellar central_office
chalet changing_rooms chapel chicken_coop church cinema civic clinic clock_tower collapsed college commercial
concession_stand condominium conservatory constructie construction container convent cowshed damaged data_center
data_centre demolished demountable detached digester disused dog_house dormitory dovecote entrance factory farm
farm_auxiliary fire_lookout fire_station fixme font fort friary funeral_hall garage garages garbage_shed gatehouse
gauge_house gazebo ger glasshouse goat_shed government government_office granary grandstand greenhouse ground_station
guardhouse guest_house gurdwara hall_of_residence hangar hospital hostel hotel house houseboat hut industrial
kindergarten kingdom_hall kiosk lean_to library lighthouse livestock mall manufacture marketplace marquee maybe
military miniature mink_shed mobile_home monastery mortuary mosque motel museum no office other outbuilding pagoda
palace parking pavilion planned police porch poultry_house presbytery prison proposed pub public quonset_hut railway
religious residential retail riding_hall roof roundhouse ruins sanitary sauna school semi semidetached_house service
shed sheepfold shepherd_shelter ship shophouse shower show_house shrine silo slurry_tank smithy sports_centre
sports_hall stable stadium static_caravan static_tent stilt_house storage_tank sty supermarket swimming_pool
synagogue hayrack tech_cab temple tent terrace terraced_house toilets tourism tower townhall train_station
transformer_tower transportation tree_house triumphal_arch true trullo unclassified undefined unidentified university
unknown venta villa warehouse water_tower wayside_shrine windmill wine_cellar workshop Y yes
`;

export const BUILDING_TYPES = documentedValues.trim().split(/\s+/);
export const PALETTE_STORAGE_KEY = 'terraszon:building-palette:v1';
export const UNKNOWN_BUILDING_COLOR = '#ebe2d5';

export const GROUPS = [
  { id: 'houses', label: 'Huizen', color: '#cf937e', types: 'house detached semidetached_house semi terrace terraced_house bungalow villa chalet farm cabin houseboat mobile_home static_caravan stilt_house annexe' },
  { id: 'apartments', label: 'Appartementen & verblijf', color: '#b88382', types: 'apartments condominium residential dormitory hall_of_residence barracks hotel motel hostel guest_house ger tree_house' },
  { id: 'commerce', label: 'Werk & winkels', color: '#777b7b', types: 'commercial office retail supermarket kiosk mall shophouse pub marketplace concession_stand central_office government_office data_center data_centre brewery factory industrial manufacture workshop warehouse' },
  { id: 'civic', label: 'Publiek & onderwijs', color: '#abac95', types: 'civic public government townhall school college university kindergarten hospital clinic fire_station police prison library museum cinema bath toilets sanitary shower funeral_hall' },
  { id: 'religion', label: 'Religie', color: '#a49aab', types: 'religious cathedral chapel church kingdom_hall monastery mosque presbytery shrine synagogue temple convent friary gurdwara pagoda wayside_shrine' },
  { id: 'agriculture', label: 'Landbouw & groen', color: '#ab946e', types: 'agricultural barn farm_auxiliary cowshed greenhouse glasshouse chicken_coop goat_shed granary livestock mink_shed poultry_house sheepfold shepherd_shelter stable sty hayrack dovecote' },
  { id: 'sport', label: 'Sport & recreatie', color: '#8a9e9a', types: 'sports_centre sports_hall stadium swimming_pool grandstand riding_hall pavilion sauna tourism' },
  { id: 'storage', label: 'Opslag & bijgebouwen', color: '#a7a18f', types: 'garage garages shed outbuilding carport boathouse cellar container garbage_shed storage_tank slurry_tank hangar porch roof gazebo lean_to wine_cellar' },
  { id: 'transport', label: 'Vervoer & techniek', color: '#929da4', types: 'bus_station train_station railway transportation bridge gatehouse lighthouse water_tower windmill transformer_tower ground_station tech_cab service tower' },
  { id: 'heritage', label: 'Erfgoed & bijzonder', color: '#b09882', types: 'castle fort palace bunker military clock_tower bell_tower triumphal_arch roundhouse hut quonset_hut beach_hut' },
] as const;

// Keep the storage key so existing personal palettes migrate automatically.
export type Palette = {
  version: 2;
  colors: Record<string, string>;
  groupColors: Record<string, string>;
  customTypes: string[];
};
const groupByType = new Map(GROUPS.flatMap((group) => group.types.split(' ').map((type) => [type, group.id] as const)));

export function groupFor(type: string): string {
  return groupByType.get(type) ?? 'other';
}

function tint(color: string, type: string): string {
  let hash = 0;
  for (const character of type) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  const offset = (Math.abs(hash) % 5 - 2) * 3;
  return `#${[1, 3, 5].map((index) => Math.max(0, Math.min(255, parseInt(color.slice(index, index + 2), 16) + offset))
    .toString(16).padStart(2, '0')).join('')}`;
}

export function defaultColor(type: string): string {
  if (!BUILDING_TYPES.includes(type)) return UNKNOWN_BUILDING_COLOR;
  if (['yes', 'true', 'unknown', 'undefined', 'unidentified', 'unclassified', 'other', 'maybe', 'fixme', 'Y'].includes(type)) {
    return UNKNOWN_BUILDING_COLOR;
  }
  const group = GROUPS.find((entry) => entry.id === groupFor(type));
  return tint(group?.color ?? UNKNOWN_BUILDING_COLOR, type);
}

export function defaultPalette(): Palette {
  return {
    version: 2, colors: Object.fromEntries(BUILDING_TYPES.map((type) => [type, defaultColor(type)])),
    groupColors: {}, customTypes: [],
  };
}

export function categoryColor(palette: Palette, group: string): string {
  return palette.groupColors[group] ?? GROUPS.find((entry) => entry.id === group)?.color ?? UNKNOWN_BUILDING_COLOR;
}

function validColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}

export function setTypeColor(palette: Palette, type: string, color: string): void {
  if (!BUILDING_TYPES.includes(type) || !validColor(color)) return;
  palette.colors[type] = color.toLowerCase();
  if (!palette.customTypes.includes(type)) palette.customTypes.push(type);
}

export function followCategory(palette: Palette, type: string): void {
  if (!BUILDING_TYPES.includes(type)) return;
  palette.customTypes = palette.customTypes.filter((entry) => entry !== type);
  palette.colors[type] = palette.groupColors[groupFor(type)] ?? defaultColor(type);
}

export function setCategoryColor(palette: Palette, group: string, color: string): number {
  if ((group !== 'other' && !GROUPS.some((entry) => entry.id === group)) || !validColor(color)) return 0;
  palette.groupColors[group] = color.toLowerCase();
  let affected = 0;
  for (const type of BUILDING_TYPES) {
    if (groupFor(type) !== group || palette.customTypes.includes(type)) continue;
    palette.colors[type] = color.toLowerCase();
    affected++;
  }
  return affected;
}

export function parsePalette(value: unknown): Palette {
  const palette = defaultPalette();
  if (!value || typeof value !== 'object' || !('version' in value) || (value.version !== 1 && value.version !== 2)
    || !('colors' in value) || !value.colors || typeof value.colors !== 'object') return palette;
  if (value.version === 2 && 'groupColors' in value && value.groupColors && typeof value.groupColors === 'object') {
    for (const group of [...GROUPS.map((entry) => entry.id), 'other']) {
      const color = (value.groupColors as Record<string, unknown>)[group];
      if (validColor(color)) setCategoryColor(palette, group, color);
    }
  }
  const customTypes = value.version === 2 && 'customTypes' in value && Array.isArray(value.customTypes)
    ? value.customTypes : [];
  for (const type of BUILDING_TYPES) {
    const color = (value.colors as Record<string, unknown>)[type];
    if (!validColor(color)) continue;
    // Old palettes have no explicit override metadata. Preserve every color
    // that differs from the original defaults as an individual choice.
    if (value.version === 1 ? color.toLowerCase() !== defaultColor(type) : customTypes.includes(type)) {
      setTypeColor(palette, type, color);
    }
  }
  return palette;
}

export function loadPalette(): Palette {
  try {
    const saved = localStorage.getItem(PALETTE_STORAGE_KEY);
    return saved ? parsePalette(JSON.parse(saved)) : defaultPalette();
  } catch {
    return defaultPalette();
  }
}

export function savePalette(palette: Palette): boolean {
  try { localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palette)); } catch { return false; }
  window.dispatchEvent(new Event('terraszon:palette-change'));
  return true;
}
