import type { TreeFeature } from './types';

export type TreeProfileId = 'round' | 'broad' | 'oval' | 'column' | 'weeping' | 'conifer' | 'open';
export type LeafCycle = 'deciduous' | 'evergreen' | 'unknown';
export type CrownLobe = { center: [number, number, number]; radius: [number, number, number] };
export type TreeProfile = {
  id: TreeProfileId;
  label: string;
  width: number;
  density: number;
  crownBase: number;
  lobes: CrownLobe[];
};

// Coarse, illustrative crown envelopes, not surveyed shapes or measured LAI.
// All coordinates use crown radius in x/y and total tree height in z.
export const TREE_PROFILES: Record<TreeProfileId, TreeProfile> = {
  round: { id: 'round', label: 'Ronde kroon', width: 1, density: 0.78, crownBase: 0.4,
    lobes: [
      { center: [0, 0, 0.7], radius: [1, 0.9, 0.3] },
      { center: [-0.35, 0.15, 0.6], radius: [0.62, 0.65, 0.2] },
    ] },
  broad: { id: 'broad', label: 'Brede kroon', width: 1.15, density: 0.86, crownBase: 0.4,
    lobes: [
      { center: [0, 0, 0.66], radius: [1, 0.8, 0.25] },
      { center: [-0.32, 0.14, 0.75], radius: [0.66, 0.65, 0.25] },
      { center: [0.38, -0.18, 0.72], radius: [0.6, 0.58, 0.23] },
    ] },
  oval: { id: 'oval', label: 'Ovale kroon', width: 0.85, density: 0.8, crownBase: 0.35,
    lobes: [{ center: [0, 0, 0.675], radius: [1, 0.8, 0.325] }] },
  column: { id: 'column', label: 'Zuilvormige kroon', width: 0.42, density: 0.84, crownBase: 0.25,
    lobes: [
      { center: [0, 0, 0.56], radius: [1, 0.85, 0.31] },
      { center: [0, 0, 0.83], radius: [0.7, 0.6, 0.17] },
    ] },
  weeping: { id: 'weeping', label: 'Treurkroon', width: 1.1, density: 0.7, crownBase: 0.18,
    lobes: [
      { center: [0, 0, 0.78], radius: [0.85, 0.8, 0.22] },
      { center: [-0.45, 0.1, 0.55], radius: [0.55, 0.58, 0.37] },
      { center: [0.45, -0.1, 0.55], radius: [0.55, 0.58, 0.37] },
    ] },
  conifer: { id: 'conifer', label: 'Kegelvormige kroon', width: 0.7, density: 0.9, crownBase: 0.2,
    lobes: [] },
  open: { id: 'open', label: 'Open kroon', width: 1, density: 0.5, crownBase: 0.52,
    lobes: [
      { center: [-0.46, 0.14, 0.73], radius: [0.54, 0.56, 0.21] },
      { center: [0.42, -0.28, 0.78], radius: [0.55, 0.5, 0.2] },
      { center: [0.04, 0.42, 0.88], radius: [0.55, 0.5, 0.12] },
    ] },
};

export function treeIdentity(species = '', scientificName = ''): { profile: TreeProfileId; leafCycle: LeafCycle; phenologyShift: number } {
  const name = `${scientificName} ${species}`.toLowerCase();
  const genus = scientificName.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const conifer = /\b(picea|abies|thuja|taxus|cupressus|chamaecyparis|cedrus|juniperus|pseudotsuga|tsuga|sequoia|sequoiadendron|cryptomeria|sciadopitys|larix|metasequoia|taxodium)\b/.test(name);
  let profile: TreeProfileId = 'round';
  if (/fastigiat|italica|columnaris|pyramidalis|zuil/.test(name)) profile = 'column';
  // Betula pendula is an ordinary birch, not automatically a weeping cultivar.
  else if (/treur|sepulcralis|babylonica|['’][^'’]*(pendula|tristis|youngii)/.test(name)) profile = 'weeping';
  else if (conifer) profile = 'conifer';
  else if (/\b(pinus|robinia|gleditsia)\b/.test(name)) profile = 'open';
  else if (/\b(quercus|platanus|aesculus|juglans)\b|eik|plataan|kastanje/.test(name)) profile = 'broad';
  else if (/\b(tilia|betula|carpinus|fagus|alnus|fraxinus|ulmus|populus)\b|linde|berk|beuk|populier|gewone es|els/.test(name)) profile = 'oval';

  let leafCycle: LeafCycle = scientificName || species ? 'deciduous' : 'unknown';
  if ((conifer && !/\b(larix|metasequoia|taxodium)\b/.test(name)) || /\bpinus\b/.test(name)
    || /quercus (ilex|suber|coccifera)|magnolia grandiflora|prunus (laurocerasus|lusitanica)|\b(arbutus|laurus|photinia)\b/.test(name)
    || (/\bilex\b/.test(name) && !/verticillata/.test(name))) leafCycle = 'evergreen';
  const phenologyShift = ['quercus', 'robinia', 'gleditsia'].includes(genus) ? 12
    : ['aesculus', 'salix', 'betula'].includes(genus) ? -7 : 0;
  return { profile, leafCycle, phenologyShift };
}

export function stableTreeFraction(id: string): number {
  let hash = 2_166_136_261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return (hash >>> 0) / 0xffffffff;
}

// Fixed non-leap reference year keeps date-only phenology independent of time
// zones and year length. It estimates a typical season, not observed bud burst.
export function treeSeasonDay(date: string): number {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return 181;
  const month = Number(match[1]), day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return 181;
  return (Date.UTC(2001, month - 1, day) - Date.UTC(2001, 0, 1)) / 86_400_000;
}

function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function leafAmount(cycle: LeafCycle, day: number, shift = 0): number {
  if (cycle === 'evergreen') return 1;
  const seasonalDay = ((day - shift) % 365 + 365) % 365;
  const amount = smoothstep(98, 135, seasonalDay) * (1 - smoothstep(275, 320, seasonalDay));
  // Without a species/cycle, do not assume a completely bare winter crown.
  return cycle === 'unknown' ? 0.25 + 0.75 * amount : amount;
}

// The renderer and CPU classifier use the same smooth seasonal curve.
export const LEAF_AMOUNT_GLSL = `
float leafAmount(float cycle, float day, float shift) {
  if (cycle < 0.5) return 1.0;
  float d = mod(day - shift + 730.0, 365.0);
  float amount = smoothstep(98.0, 135.0, d) * (1.0 - smoothstep(275.0, 320.0, d));
  return cycle > 1.5 ? 0.25 + 0.75 * amount : amount;
}`;

export function describeTree(tree: TreeFeature) {
  const ring = tree.geometry.coordinates[0];
  const longitude = (ring[0][0] + ring[6][0]) / 2;
  const latitude = (ring[0][1] + ring[6][1]) / 2;
  const identity = treeIdentity(tree.properties.species, tree.properties.scientificName);
  return {
    longitude, latitude, height: tree.properties.height,
    radius: tree.properties.crownRadius ?? Math.abs(ring[0][0] - longitude) * 111_320 * Math.cos(latitude * Math.PI / 180),
    rotation: tree.properties.rotation ?? stableTreeFraction(tree.properties.id) * Math.PI * 2,
    profile: TREE_PROFILES[tree.properties.profile ?? identity.profile],
    leafCycle: tree.properties.leafCycle ?? identity.leafCycle,
    phenologyShift: (tree.properties.phenologyShift ?? identity.phenologyShift) - (latitude < 0 ? 182 : 0),
  };
}
