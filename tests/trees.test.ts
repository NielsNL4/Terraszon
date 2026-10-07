import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTrees, parseMunicipalTrees, parseTrees, treeMarkers } from '../src/trees';
import { TREE_INSTANCE_STRIDE, TREE_VERTEX_STRIDE, treeInstances, treeMesh } from '../src/tree-model';
import { leafAmount, TREE_PROFILES, treeIdentity, treeSeasonDay } from '../src/tree-profiles';
import { shadowVector } from '../src/shadows';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const groningenBounds = { south: 53.217, west: 6.566, north: 53.223, east: 6.572 };
const osmBounds = { south: 52.99, west: 5.99, north: 53.01, east: 6.01 };
const municipalRecords = (count: number, start = 0) => Array.from({ length: count }, (_, i) => ({
  attributes: { OBJECTID: start + i, BOOMHOOGTE: '15 tot 18 m.', BOOMSOORT: 'Hollandse linde', LATIJNSE_NAAM: 'Tilia x europaea' },
  geometry: { x: 6.569484, y: 53.220222 },
}));
const osmRecords = (count: number) => Array.from({ length: count }, (_, id) => ({
  type: 'node', id, lat: 53, lon: 6, tags: { natural: 'tree' },
}));
function treeSource(fetchMock: ReturnType<typeof vi.fn>) {
  const setItem = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem });
  return setItem;
}

describe('OSM-bomen', () => {
  it('maakt een kroon op schaal en gebruikt veilige maten bij ontbrekende of ongeldige tags', () => {
    const trees = parseTrees({ elements: [
      { type: 'node', id: 1, lat: 53, lon: 6, tags: { natural: 'tree', height: '14 m', diameter_crown: '8' } },
      { type: 'node', id: 2, lat: 53, lon: 6.001, tags: { natural: 'tree', height: '999' } },
      { type: 'node', id: 3, lat: 999, lon: 6, tags: { natural: 'tree' } },
    ] });
    expect(trees).toHaveLength(2);
    expect(trees[0].properties.height).toBe(14);
    expect(trees[1].properties.height).toBeGreaterThanOrEqual(8);
    expect(trees[1].properties.height).toBeLessThanOrEqual(12);
    expect(trees[0].geometry.coordinates[0]).toHaveLength(13);
    expect(trees[0].geometry.coordinates[0][0][0] - 6).toBeCloseTo(4 / (111_320 * Math.cos(53 * Math.PI / 180)));
  });

  it('vraagt begrensd bomen op en bewaart het resultaat per kaartbeeld', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [
        { type: 'node', id: 1, lat: 53, lon: 6, tags: { natural: 'tree' } },
      ] }),
    });
    const setItem = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    const bounds = { south: 52.99, west: 5.99, north: 53.01, east: 6.01 };
    const result = await fetchTrees(bounds, new AbortController().signal);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.body.get('data')).toContain('node["natural"="tree"](52.990000,5.990000,53.010000,6.010000);out body 1001;');
    expect(result.trees).toHaveLength(1);
    expect(result).toMatchObject({ source: 'osm', status: 'complete', capped: false, requests: 1 });
    expect(setItem).toHaveBeenCalledOnce();
  });

  it('gebruikt in Groningen de gemeentelijke bomen en toont hun midden als punt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: municipalRecords(1, 72), exceededTransferLimit: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    const result = await fetchTrees(
      { south: 53.217, west: 6.566, north: 53.223, east: 6.572 },
      new AbortController().signal,
    );
    const trees = result.trees;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0].hostname).toBe('services2.arcgis.com');
    expect(fetchMock.mock.calls[0][0].searchParams.get('outFields')).toContain('LATIJNSE_NAAM');
    expect(trees[0].properties.id).toBe('groningen/72');
    expect(trees[0].properties.height).toBeGreaterThan(15);
    expect(trees[0].properties.height).toBeLessThan(18);
    expect(trees[0].properties).toMatchObject({ species: 'Hollandse linde', scientificName: 'Tilia x europaea',
      profile: 'oval', leafCycle: 'deciduous', heightClass: '15 tot 18 m.' });
    const markers = treeMarkers(trees);
    expect(markers.features[0].geometry).toEqual({
      type: 'Point', coordinates: [6.569484, 53.220222],
    });
  });

  it('gebruikt alle echte hoogteklassen met vaste variatie en dezelfde hoogte voor de schaduw', () => {
    const heights = ['tot 6 m.', '6 tot 9 m.', '9 tot 12 m.', '12 tot 15 m.',
      '15 tot 18 m.', '18 tot 24 m.', '24 m. en hoger'];
    const trees = parseMunicipalTrees({ features: heights.map((BOOMHOOGTE, index) => ({
      id: index + 1, geometry: { type: 'Point', coordinates: [6.57, 53.22] },
      properties: { OBJECTID: index + 1, BOOMHOOGTE },
    })) });
    expect(trees.map((tree) => tree.properties.height)).toEqual(
      trees.map((tree) => tree.properties.height).sort((a, b) => a - b),
    );
    expect(trees[0].properties.height).toBeLessThan(6);
    expect(trees[6].properties.height).toBeGreaterThan(24);
    expect(parseMunicipalTrees({ features: [{
      id: 1, geometry: { type: 'Point', coordinates: [6.57, 53.22] },
      properties: { OBJECTID: 1, BOOMHOOGTE: heights[0] },
    }] })[0].properties.height).toBe(trees[0].properties.height);
    expect(shadowVector(trees[6].properties.height, 45, 180)!.length)
      .toBeGreaterThan(shadowVector(trees[0].properties.height, 45, 180)!.length);
    const neighbors = parseMunicipalTrees({ features: [2, 3].map((id) => ({
      id, geometry: { type: 'Point', coordinates: [6.57, 53.22] },
      properties: { OBJECTID: id, BOOMHOOGTE: '9 tot 12 m.' },
    })) });
    expect(neighbors[0].properties.height).not.toBe(neighbors[1].properties.height);
  });

  it('hergebruikt één mesh per profiel en slechts 32 bytes plaatsingsgegevens per boom', () => {
    const trees = parseMunicipalTrees({ features: Array.from({ length: 1_000 }, (_, id) => ({
      id, geometry: { type: 'Point', coordinates: [6.57 + id * 0.000001, 53.22] },
      properties: { OBJECTID: id, BOOMHOOGTE: '15 tot 18 m.', LATIJNSE_NAAM: 'Tilia x europaea' },
    })) });
    const data = treeInstances(trees);
    expect(data.groups.size).toBe(1);
    expect(data.groups.get('oval')!.byteLength).toBe(1_000 * TREE_INSTANCE_STRIDE * 4);
    expect(treeMesh('oval')).toBe(treeMesh('oval'));
    const first = data.groups.get('oval')!;
    const mercatorScale = 1 / (40_075_016.68557849 * Math.cos(53.22 * Math.PI / 180));
    expect(first[3] / mercatorScale).toBeCloseTo(trees[0].properties.height, 4);
    expect(first[2] / mercatorScale).toBeCloseTo(trees[0].properties.crownRadius!, 4);
    for (const id of Object.keys(TREE_PROFILES) as Array<keyof typeof TREE_PROFILES>) {
      const mesh = treeMesh(id);
      const zs = [...mesh.vertices].filter((_, index) => index % TREE_VERTEX_STRIDE === 2);
      expect(Math.max(...zs)).toBeCloseTo(1);
      expect(Math.min(...zs)).toBe(0);
      expect([...mesh.vertices].every(Number.isFinite)).toBe(true);
      expect(mesh.woodIndexCount).toBeGreaterThan(0);
      expect(mesh.indices.length).toBeGreaterThan(mesh.woodIndexCount);
    }
  });

  it('herkent cultivars en bladverliezende naaldbomen zonder alle berken als treurboom te behandelen', () => {
    expect(treeIdentity('Zomereik', 'Quercus robur')).toMatchObject({ profile: 'broad', leafCycle: 'deciduous' });
    expect(treeIdentity('Ruwe berk', 'Betula pendula').profile).toBe('oval');
    expect(treeIdentity('Treurberk', "Betula pendula 'Youngii'").profile).toBe('weeping');
    expect(treeIdentity('', "Populus nigra 'Italica'").profile).toBe('column');
    expect(treeIdentity('', 'Larix decidua')).toMatchObject({ profile: 'conifer', leafCycle: 'deciduous' });
    expect(treeIdentity('', 'Metasequoia glyptostroboides').leafCycle).toBe('deciduous');
    expect(treeIdentity('', 'Picea abies').leafCycle).toBe('evergreen');
    expect(treeIdentity('', 'Quercus ilex').leafCycle).toBe('evergreen');
    expect(treeIdentity().leafCycle).toBe('unknown');
  });

  it('verandert blad geleidelijk met de gekozen datum en behoudt wintergroene bladeren', () => {
    const winter = treeSeasonDay('2026-01-15'), summer = treeSeasonDay('2026-07-15');
    expect(leafAmount('deciduous', winter)).toBe(0);
    expect(leafAmount('deciduous', summer)).toBe(1);
    expect(leafAmount('evergreen', winter)).toBe(1);
    const spring = leafAmount('deciduous', treeSeasonDay('2026-04-25'));
    expect(spring).toBeGreaterThan(0);
    expect(spring).toBeLessThan(1);
    expect(leafAmount('deciduous', treeSeasonDay('2026-04-25'), 12)).toBeLessThan(spring);
    expect(leafAmount('deciduous', treeSeasonDay('2026-01-15'), -182)).toBe(1);
    expect(leafAmount('unknown', winter)).toBeGreaterThan(0);
    expect(treeSeasonDay('2024-07-15')).toBe(summer);
  });

  it('bewaart een leeg antwoord niet voor 24 uur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ elements: [] }),
    }));
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    expect(await fetchTrees(
      { south: 52.99, west: 5.99, north: 53.01, east: 6.01 },
      new AbortController().signal,
    )).toMatchObject({ trees: [], status: 'empty', source: 'osm' });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('valt terug op OSM wanneer de gemeentelijke bron niet beschikbaar is', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('Bomenkaart niet bereikbaar'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ elements: [
          { type: 'node', id: 9, lat: 53.22, lon: 6.57, tags: { natural: 'tree' } },
        ] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    const result = await fetchTrees(
      { south: 53.217, west: 6.566, north: 53.223, east: 6.572 },
      new AbortController().signal,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.trees[0].properties.id).toBe('tree/9');
    expect(result.source).toBe('osm');
  });

  it('pagineert een volle gemeentelijke pagina zonder metadata en sorteert stabiel op OBJECTID', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: municipalRecords(1_000) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: municipalRecords(2, 1_000), exceededTransferLimit: false }) });
    const setItem = treeSource(fetchMock);
    const result = await fetchTrees(groningenBounds, new AbortController().signal);
    expect(result).toMatchObject({ status: 'complete', source: 'groningen', requests: 2, capped: false });
    expect(result.trees).toHaveLength(1_002);
    expect(fetchMock.mock.calls.map(([url]) => url.searchParams.get('resultOffset'))).toEqual(['0', '1000']);
    expect(fetchMock.mock.calls.every(([url]) => url.searchParams.get('orderByFields') === 'OBJECTID ASC')).toBe(true);
    expect(setItem).toHaveBeenCalledOnce();
  });

  it('volgt de transferlimiet ook bij een korte pagina en herkent een expliciet volledig antwoord', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: municipalRecords(2), exceededTransferLimit: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: municipalRecords(1_000, 2), exceededTransferLimit: false }) });
    treeSource(fetchMock);
    expect((await fetchTrees(groningenBounds, new AbortController().signal)).status).toBe('complete');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0].searchParams.get('resultOffset')).toBe('2');
  });

  it('begrenst paging en cachet een afgekapt gemeentelijk gebied niet', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: URL) => ({ ok: true,
      json: async () => ({ features: municipalRecords(1_000, Number(url.searchParams.get('resultOffset'))), exceededTransferLimit: true }) }));
    const setItem = treeSource(fetchMock);
    const result = await fetchTrees(groningenBounds, new AbortController().signal, 2);
    expect(result).toMatchObject({ status: 'partial', source: 'groningen', capped: true, failed: false, requests: 2 });
    expect(result.trees).toHaveLength(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('behoudt de eerste gemeentelijke pagina wanneer de volgende pagina mislukt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: municipalRecords(2), exceededTransferLimit: true }) })
      .mockRejectedValueOnce(new Error('Vervolgpagina niet bereikbaar'));
    const setItem = treeSource(fetchMock);
    const result = await fetchTrees(groningenBounds, new AbortController().signal);
    expect(result).toMatchObject({ status: 'partial', source: 'groningen', failed: true, requests: 2 });
    expect(result.trees).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2); // no replacement with an OSM snapshot
    expect(setItem).not.toHaveBeenCalled();
  });

  it('stopt een herhaalde gemeentelijke pagina zonder volledige dekking te claimen', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true,
      json: async () => ({ features: municipalRecords(1_000), exceededTransferLimit: true }) });
    const setItem = treeSource(fetchMock);
    const result = await fetchTrees(groningenBounds, new AbortController().signal);
    expect(result).toMatchObject({ status: 'partial', capped: true, requests: 2 });
    expect(result.trees).toHaveLength(1_000);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('detecteert OSM-afkapping met een sentinel zonder die boom als volledig gebied te cachen', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: osmRecords(1_001) }) });
    const setItem = treeSource(fetchMock);
    const result = await fetchTrees(osmBounds, new AbortController().signal);
    expect(result).toMatchObject({ status: 'partial', source: 'osm', capped: true, failed: false });
    expect(result.trees).toHaveLength(1_000);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('onderscheidt bronfouten van een aantoonbaar leeg gebied', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [], remark: 'Query timed out' }) });
    const setItem = treeSource(fetchMock);
    expect(await fetchTrees(osmBounds, new AbortController().signal)).toMatchObject({ status: 'failed', failed: true, trees: [] });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('breekt paging af ook als de volgende fetch annuleren negeert', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: municipalRecords(2), exceededTransferLimit: true }) })
      .mockImplementationOnce(() => new Promise(() => {}));
    const setItem = treeSource(fetchMock);
    const controller = new AbortController();
    const pending = fetchTrees(groningenBounds, controller.signal);
    const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    controller.abort();
    await check;
    expect(setItem).not.toHaveBeenCalled();
  });
});
