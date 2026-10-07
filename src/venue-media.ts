import { aborted, requestJSON } from './requests';
import { CURATED_VENUE_MEDIA } from './media-curation';
import type { Place } from './places';

export type LicensedVenueImage = {
  provider: 'commons';
  title: string;
  url: string;
  sourceUrl: string;
  creator: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  shareAlike: boolean;
  width: number;
  height: number;
  caption: string;
  subject: 'reviewed-exterior' | 'osm-linked-file' | 'wikidata-linked-image';
  reviewedAt?: string;
  retrievedAt: number;
  changes: 'Wikimedia-thumbnail; niet door Terraszon bewerkt';
};
export type VenueMediaResult = { state: 'ready'; image: LicensedVenueImage }
  | { state: 'unavailable'; reason: 'missing' | 'category-only' | 'unverified-rights' | 'missing-file' }
  | { state: 'error'; reason: 'source'; message: string };
type Candidate = { file?: string; wikidata?: string; caption: string; subject: LicensedVenueImage['subject']; reviewedAt?: string };

export function commonsFile(value?: string): string | undefined {
  if (!value) return undefined;
  let title = value.trim();
  if (/^https?:\/\//i.test(title)) {
    try {
      const url = new URL(title);
      if (url.hostname !== 'commons.wikimedia.org') return undefined;
      title = decodeURIComponent(url.pathname.replace(/^\/wiki\/Special:FilePath\//, 'File:').replace(/^\/wiki\//, ''));
    } catch { return undefined; }
  }
  if (!/^File:/i.test(title) || title.length > 300 || /[|\r\n]/.test(title)) return undefined;
  const filename = title.slice(5).replaceAll('_', ' ').trim();
  return filename ? `File:${filename}` : undefined;
}

export function mediaCandidate(place: Place): Candidate | null {
  const curated = Object.hasOwn(CURATED_VENUE_MEDIA, place.id) ? CURATED_VENUE_MEDIA[place.id] : undefined;
  if (curated) return { file: curated.file, caption: curated.caption, subject: 'reviewed-exterior', reviewedAt: curated.reviewedAt };
  const file = commonsFile(place.venue?.wikimediaCommons) ?? commonsFile(place.venue?.imageReference);
  if (file) return { file, caption: 'Afbeelding gekoppeld aan deze OSM-locatie; kan het pand tonen.', subject: 'osm-linked-file' };
  const wikidata = place.venue?.wikidata;
  if (wikidata && /^Q[1-9]\d*$/.test(wikidata)) return { wikidata, caption: 'Afbeelding van het gekoppelde Wikidata-object; kan het pand tonen.', subject: 'wikidata-linked-image' };
  return null;
}

export function mediaText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©' };
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|copy);/gi, (_match, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? '';
      const number = entity.toLowerCase().startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
    }).replace(/\s+/g, ' ').trim().slice(0, 1_000);
}

function imageUrl(value: unknown, hosts: string[]): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !hosts.includes(url.hostname) || url.username || url.password) return undefined;
    url.protocol = 'https:';
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
    return url.href;
  } catch { return undefined; }
}

function recognizedLicense(value: unknown) {
  const url = imageUrl(value, ['creativecommons.org', 'www.creativecommons.org']);
  if (!url) return null;
  const path = new URL(url).pathname;
  const cc = /^\/licenses\/(by|by-sa)\/([1-4]\.0|2\.5)\/(?:([a-z]{2})\/)?(?:deed\.[a-z]+|legalcode)?\/?$/i.exec(path);
  if (cc) return { license: `CC ${cc[1].toUpperCase()} ${cc[2]}${cc[3] ? ` ${cc[3]}` : ''}`, licenseUrl: url, shareAlike: cc[1] === 'by-sa', publicDomain: false };
  if (/^\/publicdomain\/zero\/1\.0\//.test(path)) return { license: 'CC0 1.0', licenseUrl: url, shareAlike: false, publicDomain: true };
  if (/^\/publicdomain\/mark\/1\.0\//.test(path)) return { license: 'Public domain', licenseUrl: url, shareAlike: false, publicDomain: true };
  return null;
}

export function parseCommonsImage(payload: unknown, candidate: Candidate, retrievedAt = Date.now()): LicensedVenueImage | null {
  const data = payload as { query?: { pages?: Array<{ title?: string; missing?: boolean; imageinfo?: Array<Record<string, unknown>> }> } };
  const page = data?.query?.pages?.[0], info = page?.imageinfo?.[0];
  if (!page || page.missing || !info || !['image/jpeg', 'image/png', 'image/webp'].includes(String(info.mime))) return null;
  const metadata = info.extmetadata as Record<string, { value?: unknown }> | undefined;
  const license = recognizedLicense(metadata?.LicenseUrl?.value);
  const creator = mediaText(metadata?.Artist?.value) || (license?.publicDomain ? 'Auteur niet vermeld' : '');
  const url = imageUrl(info.thumburl, ['upload.wikimedia.org', 'thumb.wikimedia.org']);
  const sourceUrl = imageUrl(info.descriptionurl, ['commons.wikimedia.org']);
  const width = Number(info.thumbwidth), height = Number(info.thumbheight);
  if (!license || !creator || !url || !sourceUrl || !Number.isFinite(width) || !Number.isFinite(height)
    || width <= 0 || height <= 0 || width > 4_096 || height > 4_096) return null;
  return { provider: 'commons', title: mediaText(page.title), url, sourceUrl, creator,
    license: license.license, licenseUrl: license.licenseUrl, attribution: `${creator} · ${license.license}`,
    shareAlike: license.shareAlike, width, height, caption: candidate.caption, subject: candidate.subject,
    reviewedAt: candidate.reviewedAt, retrievedAt, changes: 'Wikimedia-thumbnail; niet door Terraszon bewerkt' };
}

export function createVenueMediaLoader() {
  const cache = new Map<string, { at: number; result: VenueMediaResult }>();
  return async (place: Place, signal: AbortSignal): Promise<VenueMediaResult> => {
    if (signal.aborted) throw aborted(signal);
    const candidate = mediaCandidate(place);
    if (!candidate) return { state: 'unavailable', reason: place.venue?.wikimediaCommons?.startsWith('Category:') ? 'category-only' : 'missing' };
    const key = JSON.stringify(candidate), cached = cache.get(key);
    if (cached && Date.now() - cached.at < (cached.result.state === 'ready' ? 24 * 60 * 60 * 1_000 : 60_000)) return structuredClone(cached.result);
    try {
      let file = candidate.file;
      if (!file) {
        const url = new URL('https://www.wikidata.org/w/api.php');
        for (const [key, value] of Object.entries({ action: 'wbgetentities', format: 'json', ids: candidate.wikidata!, props: 'claims', origin: '*' })) url.searchParams.set(key, value);
        const result = await requestJSON<{ entities?: Record<string, { claims?: { P18?: Array<{ rank?: string; mainsnak?: { datavalue?: { value?: unknown } } }> } }> }>(url, signal, 10_000);
        const image = result.entities?.[candidate.wikidata!]?.claims?.P18?.find(claim => claim.rank !== 'deprecated')?.mainsnak?.datavalue?.value;
        file = typeof image === 'string' ? commonsFile(`File:${image}`) : undefined;
      }
      if (!file) return { state: 'unavailable', reason: 'missing-file' };
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      for (const [key, value] of Object.entries({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', titles: file,
        iiprop: 'url|size|mime|extmetadata', iiurlwidth: '640', iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|Credit|AttributionRequired', origin: '*' })) url.searchParams.set(key, value);
      const payload = await requestJSON<unknown>(url, signal, 10_000);
      if (signal.aborted) throw aborted(signal);
      const image = parseCommonsImage(payload, candidate);
      const result: VenueMediaResult = image ? { state: 'ready', image } : { state: 'unavailable', reason: 'unverified-rights' };
      cache.set(key, { at: Date.now(), result });
      while (cache.size > 32) cache.delete(cache.keys().next().value!);
      return structuredClone(result);
    } catch (error) {
      if (signal.aborted) throw aborted(signal);
      return { state: 'error', reason: 'source', message: error instanceof Error ? error.message : 'Mediabron niet beschikbaar' };
    }
  };
}
