import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateDayReport, calculateYearReport, prepareReportClassifier, reportDayStart, sunAvailability } from '../src/sun-report-engine';
import { reportObstacleBounds, obstacleRevision, createReportObstacleLoader } from '../src/report-obstacles';
import { createSunReportService } from '../src/sun-report-service';
import { parseBuildings } from '../src/building-types';
import { parseTrees } from '../src/trees';
import { createTreeViewLoader } from '../src/tree-loader';
import type { BuildingData } from '../src/building-loader';
import type { ReportObstacles, ReportTarget, ReportSettings, ReportState, SunReportResponse } from '../src/sun-report-protocol';

const target: ReportTarget = { id: 'custom:test:seat', coordinates: [6, 53] };
const settings: ReportSettings = { includeTrees: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
const signal = () => new AbortController().signal;
const noYield = async () => {};
const snapshot = (changes: Partial<ReportObstacles> = {}): ReportObstacles => ({ revision: 'fixture', buildings: [], trees: [],
  coverage: { bounds: reportObstacleBounds(target.coordinates), buildings: 'empty', trees: 'empty', treeSources: ['osm'],
    estimatedHeights: 0, buildingsLimited: false, treesLimited: false, loadedAt: Date.now(), expiresAt: Date.now() + 60_000 }, ...changes });
const buildings = parseBuildings({ elements: [{ type: 'way', id: 1, tags: { building: 'yes', height: '10' },
  geometry: [{ lon: 6, lat: 53 }, { lon: 6.00005, lat: 53 }, { lon: 6.00005, lat: 53.00002 }, { lon: 6, lat: 53.00002 }, { lon: 6, lat: 53 }] }] });
const buildingData: BuildingData = { buildings, capped: false, failedAreas: 0, loadedAreas: 1, totalAreas: 1,
  completeAreas: 1, emptyAreas: 0, partialAreas: 0, status: 'complete', source: 'osm' };
const treeData = { trees: [], capped: false, renderLimited: false, failedAreas: 0, status: 'empty' as const, sources: ['osm' as const] };
afterEach(() => vi.useRealTimers());

describe('puntgebonden zonrapport', () => {
  it('verdeelt een echte schrikkeldag zonder dubbeltelling en houdt zon binnen daglicht', async () => {
    const report = await calculateDayReport(target, snapshot(), settings, '2024-02-29', signal(), undefined, noYield);
    expect(report.complete).toBe(true);
    expect(Object.values(report.totals).reduce((a, b) => a + b)).toBe((report.end - report.start) / 60_000);
    expect(report.totals.sun).toBe(report.daylightMinutes);
    expect(report.totals.sun).toBeGreaterThan(500);
    expect(report.totals.sun).toBeLessThan(700);
    expect(report.directShareOfDaylight).toBe(100);
    expect(report.longestSun!.to - report.longestSun!.from).toBe(report.totals.sun * 60_000);
    for (const state of ['sun', 'shade', 'filtered', 'night', 'unknown'] as const) {
      expect(Object.values(report.parts).reduce((sum, part) => sum + part[state], 0)).toBe(report.totals[state]);
    }
    expect(report.windows[0].from).toBe(report.start);
    expect(report.windows.at(-1)!.to).toBe(report.end);
    report.windows.slice(1).forEach((window, i) => expect(window.from).toBe(report.windows[i].to));
    expect(report.accuracy).toMatchObject({ sampleMinutes: 5, transitionSeconds: 60 });
    expect(report.sunrise).not.toBeNull(); expect(report.sunset).not.toBeNull();
  });
  it('weigert genormaliseerde ongeldige datums en andere tijdzones', async () => {
    expect(() => reportDayStart('2023-02-29')).toThrow();
    expect(() => reportDayStart('2026-04-31')).toThrow();
    expect(() => reportDayStart('2026-00-15')).toThrow();
    await expect(calculateDayReport(target, snapshot(), { ...settings, timeZone: 'invalid' }, '2026-07-15', signal())).rejects.toThrow('tijdzone');
  });
  it('verfijnt bekende overgangen tot een minuut en levert resterende/volgende zon', async () => {
    const start = reportDayStart('2026-07-15').getTime();
    const state = (at: number): ReportState => { const m = (at - start) / 60_000; return m < 360 ? 'night' : m < 721 ? 'sun' : m < 780 ? 'shade' : m < 1080 ? 'sun' : 'night'; };
    const report = await calculateDayReport(target, snapshot(), settings, '2026-07-15', signal(), { state, complete: true, warnings: [] }, noYield);
    expect(report.windows.map(window => (window.from - start) / 60_000)).toEqual([0, 360, 721, 780, 1080]);
    expect(report.totals).toEqual({ sun: 661, shade: 59, filtered: 0, night: 720, unknown: 0 });
    expect(sunAvailability(report, start + 600 * 60_000).remainingDirectMinutes).toBe(121);
    expect(sunAvailability(report, start + 750 * 60_000).nextSun!.from).toBe(start + 780 * 60_000);
  });
  it('rekent gebouwschaduw en footprintbeleid op grondniveau zonder de POI-conventie te gebruiken', () => {
    const obstacles = snapshot({ buildings });
    const behind: ReportTarget = { ...target, coordinates: [6.000025, 53.00007] };
    const classifier = prepareReportClassifier(behind, obstacles, settings, () => ({ altitude: 45, azimuth: 180 }));
    expect(classifier.state(0, '2026-07-15')).toBe('shade');
    const inside = prepareReportClassifier({ ...target, coordinates: [6.000025, 53.00001] }, obstacles, settings, () => ({ altitude: 90, azimuth: 180 }));
    expect(inside.state(0, '2026-07-15')).toBe('shade');
    expect(inside.warnings).toContain('ground-point-inside-building');
  });
  it('houdt gefilterd boomlicht apart en berekent maart en september met hun eigen bladstand', async () => {
    const trees = parseTrees({ elements: [{ type: 'node', id: 1, lat: 53, lon: 6,
      tags: { natural: 'tree', species: 'Tilia x europaea', height: '15', diameter_crown: '8' } }] });
    trees[0].properties.rotation = 0;
    const underEdge: ReportTarget = { ...target, coordinates: [6 + 2 / (111_320 * Math.cos(53 * Math.PI / 180)), 53] };
    const obstacles = snapshot({ trees });
    const classifier = prepareReportClassifier(underEdge, obstacles, settings, () => ({ altitude: 90, azimuth: 180 }));
    expect(classifier.state(0, '2026-03-21')).toBe('sun');
    expect(classifier.state(0, '2026-09-21')).toBe('filtered');
    const report = await calculateDayReport(underEdge, obstacles, settings, '2026-09-21', signal(), classifier, noYield);
    expect(report.totals.filtered).toBe(1440); expect(report.totals.sun).toBe(0);
    expect(prepareReportClassifier(underEdge, obstacles, { ...settings, includeTrees: false }, () => ({ altitude: 90, azimuth: 180 })).state(0, '2026-09-21')).toBe('sun');
  });
  it('maakt ontbrekende obstakels onbekend, maar behoudt bewezen schaduw en nacht', async () => {
    const obstacles = snapshot(); obstacles.coverage.buildings = 'partial';
    const classifier = prepareReportClassifier(target, obstacles, settings, () => ({ altitude: 45, azimuth: 180 }));
    expect(classifier.state(0, '2026-07-15')).toBe('unknown');
    const report = await calculateDayReport(target, obstacles, settings, '2026-07-15', signal(), classifier, noYield);
    expect(report.complete).toBe(false); expect(report.directShareOfDaylight).toBeNull(); expect(report.totals.unknown).toBe(1440);
    const behind: ReportTarget = { ...target, coordinates: [6.000025, 53.00007] };
    expect(prepareReportClassifier(behind, { ...obstacles, buildings }, settings, () => ({ altitude: 45, azimuth: 180 })).state(0, '2026-07-15')).toBe('shade');
    expect(prepareReportClassifier(target, obstacles, settings, () => ({ altitude: -1, azimuth: 180 })).state(0, '2026-07-15')).toBe('night');
    obstacles.coverage.buildings = 'empty'; obstacles.coverage.treesLimited = true;
    expect(prepareReportClassifier(target, obstacles, settings).complete).toBe(false);
  });
  it('houdt poolnacht geldig zonder ongeldige opkomst-/ondergangwaarden', async () => {
    const arctic: ReportTarget = { ...target, coordinates: [20, 80] };
    const report = await calculateDayReport(arctic, snapshot(), settings, '2026-12-21', signal(), undefined, noYield);
    expect(report.totals.night).toBe(1440); expect(report.directShareOfDaylight).toBe(0);
    expect(report.sunrise).toBeNull(); expect(report.sunset).toBeNull(); expect(report.longestSun).toBeNull();
  });
  it('breekt tijdens begrensde rekenbatches af', async () => {
    const controller = new AbortController(); let yields = 0;
    await expect(calculateDayReport(target, snapshot(), settings, '2026-07-15', controller.signal, undefined,
      async () => { yields++; controller.abort(); })).rejects.toMatchObject({ name: 'AbortError' });
    expect(yields).toBe(1);
  });
  it('gebruikt twaalf representatieve dagen plus vier aparte seizoensdagen, geen maandgemiddelden', async () => {
    const obstacles = snapshot(), classifier = prepareReportClassifier(target, obstacles, settings);
    const dates: string[] = [], progress = vi.fn();
    const report = await calculateYearReport(target, obstacles, settings, 2024, signal(), date => {
      dates.push(date); return calculateDayReport(target, obstacles, settings, date, signal(), classifier, noYield);
    }, progress);
    expect(report.method).toBe('representative-days-not-monthly-averages'); expect(report.months).toHaveLength(12);
    expect(dates).toContain('2024-02-15'); expect(report.seasons.spring.date).toBe('2024-03-21');
    expect(report.seasons.autumn.date).toBe('2024-09-21'); expect(progress).toHaveBeenLastCalledWith(16, 16);
    expect(report.seasons.summer.totals.sun).toBeGreaterThan(report.seasons.winter.totals.sun);
  });
});

describe('obstakelgebied en revision', () => {
  it('omsluit de 500m schaduwhorizon inclusief kroonmarge en valideert grenzen', () => {
    const bounds = reportObstacleBounds(target.coordinates);
    expect((bounds.north - 53) * 111_320).toBeCloseTo(532);
    expect((bounds.east - 6) * 111_320 * Math.cos(53 * Math.PI / 180)).toBeCloseTo(532);
    expect(() => reportObstacleBounds([180, 53])).toThrow('datumgrens'); expect(() => reportObstacleBounds([6, 86])).toThrow('85');
  });
  it('laadt zonder kaartargument, hergebruikt data en houdt gebouw-/boomlimieten expliciet', async () => {
    const loadBuildings = vi.fn().mockResolvedValue(buildingData), loadTrees = vi.fn().mockResolvedValue(treeData);
    const loader = createReportObstacleLoader({ buildings: loadBuildings, trees: loadTrees });
    const first = await loader.load(target, true, signal());
    expect(first.coverage).toMatchObject({ buildings: 'complete', trees: 'empty', buildingsLimited: false, treesLimited: false });
    expect(loadBuildings.mock.calls[0][0]).toEqual(reportObstacleBounds(target.coordinates));
    expect(await loader.load(target, true, signal())).toBe(first); expect(loadBuildings).toHaveBeenCalledOnce();
    loadBuildings.mockResolvedValue({ ...buildingData, capped: true }); loadTrees.mockResolvedValue({ ...treeData, renderLimited: true });
    loader.invalidate();
    expect((await loader.load(target, true, signal())).coverage).toMatchObject({ buildings: 'partial', trees: 'partial', buildingsLimited: true, treesLimited: true });
  });
  it('bewaart succesvolle brondata bij falende andere bron en houdt fouten kort in cache', async () => {
    vi.useFakeTimers();
    const loadBuildings = vi.fn().mockResolvedValue(buildingData), loadTrees = vi.fn().mockRejectedValue(new Error('offline'));
    const loader = createReportObstacleLoader({ buildings: loadBuildings, trees: loadTrees });
    const partial = await loader.load(target, true, signal());
    expect(partial.buildings).toHaveLength(1); expect(partial.coverage.trees).toBe('failed');
    expect(partial.coverage.expiresAt - partial.coverage.loadedAt).toBe(3000);
    await vi.advanceTimersByTimeAsync(3001); loadTrees.mockResolvedValue(treeData);
    expect((await loader.load(target, true, signal())).coverage.trees).toBe('empty'); expect(loadTrees).toHaveBeenCalledTimes(2);
  });
  it('begrensde deadline stopt ook een niet-reagerende bron', async () => {
    vi.useFakeTimers();
    const loader = createReportObstacleLoader({ buildings: () => new Promise(() => {}), trees: async () => treeData });
    const result = loader.load(target, true, signal());
    const assertion = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(47_000); await assertion;
  });
  it('hergebruikt een lopende bron bij dezelfde puntselectie en annuleert bij een ander punt', async () => {
    let finish!: (value: BuildingData) => void;
    const loadBuildings = vi.fn().mockImplementationOnce(() => new Promise<BuildingData>(resolve => { finish = resolve; })).mockResolvedValue(buildingData);
    const loader = createReportObstacleLoader({ buildings: loadBuildings, trees: async () => treeData });
    const controller = new AbortController(), first = loader.load(target, true, controller.signal);
    const assertion = expect(first).rejects.toMatchObject({ name: 'AbortError' }); controller.abort();
    const second = loader.load(target, true, signal()); finish(buildingData); await assertion; await second;
    expect(loadBuildings).toHaveBeenCalledOnce();
    await loader.load({ ...target, coordinates: [6.6, 53.2] }, true, signal()); expect(loadBuildings).toHaveBeenCalledTimes(2);
    loader.invalidate();
  });
  it('scheidt rapportselectie van het 1000-bomen-renderbudget', async () => {
    const trees = parseTrees({ elements: Array.from({ length: 1001 }, (_, id) => ({ type: 'node', id, lat: 53, lon: 6, tags: { natural: 'tree' } })) });
    const fetch = async () => ({ trees, status: 'complete' as const, source: 'osm' as const, capped: false, failed: false, requests: 1 });
    const bounds = reportObstacleBounds(target.coordinates);
    expect(await createTreeViewLoader(fetch)(bounds, signal())).toMatchObject({ renderLimited: true });
    const reportData = await createTreeViewLoader(fetch, { selectionLimit: 12_000 })(bounds, signal());
    expect(reportData.renderLimited).toBe(false); expect(reportData.trees).toHaveLength(1001);
  });
  it('annuleert een nog lopende bron bij een verre puntwissel en negeert het late resultaat', async () => {
    let finish!: (data: BuildingData) => void, oldSignal!: AbortSignal;
    const loadBuildings = vi.fn().mockImplementationOnce((_bounds, signal: AbortSignal) => {
      oldSignal = signal; return new Promise<BuildingData>(resolve => { finish = resolve; });
    }).mockResolvedValue(buildingData);
    const loader = createReportObstacleLoader({ buildings: loadBuildings, trees: async () => treeData });
    const first = loader.load(target, true, signal()), assertion = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const changed = { ...target, coordinates: [6.6, 53.2] as [number, number] };
    const next = await loader.load(changed, true, signal()); await assertion;
    expect(oldSignal.aborted).toBe(true); finish(buildingData);
    expect(next.coverage.bounds).toEqual(reportObstacleBounds(changed.coordinates));
    expect(await loader.load(changed, true, signal())).toBe(next);
    expect(loadBuildings).toHaveBeenCalledTimes(2); loader.invalidate();
  });
  it('verandert revision bij geometrie, hoogte of dekking maar niet bij recordvolgorde/ophaalmoment', () => {
    const data = snapshot({ buildings });
    const revision = obstacleRevision(data);
    const changed = structuredClone(data); changed.buildings[0].properties.height = 11;
    expect(obstacleRevision(changed)).not.toBe(revision);
    const moved = structuredClone(data);
    if (moved.buildings[0].geometry.type === 'Polygon') moved.buildings[0].geometry.coordinates[0][0][0] += 0.00001;
    expect(obstacleRevision(moved)).not.toBe(revision);
    expect(obstacleRevision({ ...data, coverage: { ...data.coverage, buildings: 'partial' } })).not.toBe(revision);
    expect(obstacleRevision({ ...data, coverage: { ...data.coverage, loadedAt: 0, expiresAt: 1 } })).toBe(revision);
    const second = structuredClone(buildings[0]); second.properties.id = 'second';
    const ordered = { ...data, buildings: [buildings[0], second] };
    expect(obstacleRevision({ ...ordered, buildings: [...ordered.buildings].reverse() })).toBe(obstacleRevision(ordered));
  });
});

describe('rapportservice', () => {
  it('houdt dezelfde data kaartonafhankelijk en invalideert bij gewijzigde revision of instellingen', async () => {
    let data = snapshot();
    const replies: SunReportResponse[] = [];
    const loader = { load: vi.fn(async () => data), retain: vi.fn(), invalidate: vi.fn() };
    const service = createSunReportService(reply => replies.push(reply), loader);
    const run = async (id: number, overrides: Partial<ReportSettings> = {}) => {
      service.handle({ type: 'day', id, target, date: '2026-07-15', settings: { ...settings, ...overrides } });
      await vi.waitFor(() => expect(replies.some(reply => reply.type === 'day' && reply.id === id)).toBe(true));
      return replies.find(reply => reply.type === 'day' && reply.id === id)! as Extract<SunReportResponse, { type: 'day' }>;
    };
    const first = await run(1), repeated = await run(2);
    expect(repeated.report).toEqual(first.report);
    data = snapshot(); data.coverage.buildings = 'partial'; data.revision = 'changed';
    expect((await run(3)).report.totals.unknown).toBeGreaterThan(0);
    expect((await run(4, { includeTrees: false })).report.settings.includeTrees).toBe(false);
    service.handle({ type: 'invalidate' }); expect(loader.invalidate).toHaveBeenCalledOnce();
  });
  it('negeert late oude puntresultaten en annuleert expliciete taken', async () => {
    let finish!: (data: ReportObstacles) => void;
    const replies: SunReportResponse[] = [];
    const loader = { load: vi.fn().mockImplementationOnce(() => new Promise<ReportObstacles>(resolve => { finish = resolve; })).mockResolvedValue(snapshot()), retain: vi.fn(), invalidate: vi.fn() };
    const service = createSunReportService(reply => replies.push(reply), loader);
    service.handle({ type: 'day', id: 1, target, date: '2026-07-15', settings });
    service.handle({ type: 'day', id: 2, target: { ...target, id: 'new' }, date: '2026-07-15', settings }); finish(snapshot());
    await vi.waitFor(() => expect(replies.some(reply => reply.type === 'day' && reply.id === 2)).toBe(true));
    expect(replies.some(reply => reply.type === 'day' && reply.id === 1)).toBe(false);
    service.handle({ type: 'year', id: 3, target, year: 2026, settings }); service.handle({ type: 'cancel', id: 3 });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(replies.some(reply => reply.type === 'year' && reply.id === 3)).toBe(false); expect(loader.retain).toHaveBeenCalledWith(null);
  });
});
