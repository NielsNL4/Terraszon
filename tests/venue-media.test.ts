import { afterEach, describe, expect, it, vi } from 'vitest';
import { commonsFile, createVenueMediaLoader, mediaCandidate, mediaText, parseCommonsImage } from '../src/venue-media';
import type { Place } from '../src/places';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const place = (commons?: string, imageReference?: string): Place => ({ id: 'osm:node/42', kind: 'venue', name: 'Testcafé', coordinates: [6.568, 53.219], sources: [],
  venue: { amenity: 'cafe', evidence: 'confirmed', wikimediaCommons: commons, imageReference } });
const candidate = () => mediaCandidate(place('File:Testcafe.jpg'))!;
const payload = (license = 'https://creativecommons.org/licenses/by-sa/4.0/', author = '<a href="https://example.test">Fotograaf &amp; co</a>') => ({ query: { pages: [{ title: 'File:Testcafe.jpg',
  imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Testcafe.jpg/640px-Testcafe.jpg',
    thumbwidth: 640, thumbheight: 480, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Testcafe.jpg',
    extmetadata: { Artist: { value: author }, LicenseUrl: { value: license } } }] }] } });

describe('gelicentieerde locatieafbeeldingen', () => {
  it('bewaart maker, licentie, bron, dimensies en hergebruiktekst bij een foto', () => {
    expect(parseCommonsImage(payload(), candidate(), 123)).toMatchObject({ creator: 'Fotograaf & co', license: 'CC BY-SA 4.0',
      shareAlike: true, width: 640, height: 480, sourceUrl: 'https://commons.wikimedia.org/wiki/File:Testcafe.jpg', retrievedAt: 123 });
  });
  it('behoudt landspecifieke CC-licenties en herkent CC0 zonder een fotograaf te verzinnen', () => {
    expect(parseCommonsImage(payload('https://creativecommons.org/licenses/by-sa/3.0/nl/deed.en'), candidate())?.license).toBe('CC BY-SA 3.0 nl');
    expect(parseCommonsImage(payload('http://creativecommons.org/publicdomain/zero/1.0/deed.en', ''), candidate()))
      .toMatchObject({ creator: 'Auteur niet vermeld', license: 'CC0 1.0', shareAlike: false });
  });
  it('neemt een losse OSM-image-link niet aan als hergebruikrecht of als een Commons-bestand', () => {
    expect(mediaCandidate(place(undefined, 'https://example.test/photo.jpg'))).toBeNull();
    expect(commonsFile('File:')).toBeUndefined();
    expect(commonsFile('https://wrong.test/wiki/File:Test.jpg')).toBeUndefined();
    expect(commonsFile('https://commons.wikimedia.org/wiki/Special:FilePath/Test.jpg')).toBe('File:Test.jpg');
  });
  it('weigert onduidelijke/GFDL/NC-rechten en ontbrekende attributie bij CC-BY', () => {
    expect(parseCommonsImage(payload('https://creativecommons.org/licenses/by-nc/4.0/'), candidate())).toBeNull();
    expect(parseCommonsImage(payload('https://example.test/GFDL'), candidate())).toBeNull();
    expect(parseCommonsImage(payload(undefined, ''), candidate())).toBeNull();
  });
  it('stript metadata-HTML en voert die niet als markup uit', () => {
    expect(mediaText('<script>alert(1)</script><b>Auteur</b> &lt;naam&gt;')).toBe('Auteur <naam>');
  });
  it('kiest geen willekeurige foto uit een categorie', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(await createVenueMediaLoader()(place('Category:Cafes'), new AbortController().signal)).toEqual({ state: 'unavailable', reason: 'category-only' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('vraagt alleen metadata op, cachet begrensd en behoudt de gekozen locatie bij bronfouten', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => payload() }); vi.stubGlobal('fetch', fetch);
    const loader = createVenueMediaLoader(), venue = place('File:Testcafe.jpg');
    expect((await loader(venue, new AbortController().signal)).state).toBe('ready');
    const url = fetch.mock.calls[0][0];
    expect(url.searchParams.get('origin')).toBe('*'); expect(url.searchParams.get('iiurlwidth')).toBe('640');
    await loader(venue, new AbortController().signal); expect(fetch).toHaveBeenCalledOnce();
    expect(venue.name).toBe('Testcafé');
  });
  it('behandelt netwerkfouten en afgebroken responses afzonderlijk zonder foutresultaten 24 uur te cachen', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('Offline')); vi.stubGlobal('fetch', fetch);
    const loader = createVenueMediaLoader(), venue = place('File:Testcafe.jpg');
    expect((await loader(venue, new AbortController().signal)).state).toBe('error');
    expect((await loader(venue, new AbortController().signal)).state).toBe('error'); expect(fetch).toHaveBeenCalledTimes(2);
    const controller = new AbortController(); controller.abort();
    await expect(loader(venue, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('gebruikt de gecontroleerde Groningse koppeling voor de juiste OSM-identiteit', () => {
    expect(mediaCandidate({ ...place(), id: 'osm:node/918944223' })).toMatchObject({ subject: 'reviewed-exterior',
      file: 'File:20160404 Huis de Beurs Groningen Folkingestraat34.jpg', reviewedAt: '2026-10-07' });
    expect(mediaCandidate({ ...place(), id: 'osm:node/2752222651' })?.caption).toContain('2012');
  });
});
