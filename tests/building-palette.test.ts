import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILDING_TYPES, defaultColor, defaultPalette, followCategory, groupFor, loadPalette, PALETTE_STORAGE_KEY, parsePalette, savePalette, setCategoryColor, setTypeColor, UNKNOWN_BUILDING_COLOR } from '../src/building-palette';

afterEach(() => vi.unstubAllGlobals());

describe('gebouwkleuren', () => {
  it('bevat de gedocumenteerde types zonder dubbelen en houdt onbekend neutraal', () => {
    expect(BUILDING_TYPES).toHaveLength(200);
    expect(new Set(BUILDING_TYPES).size).toBe(BUILDING_TYPES.length);
    expect(groupFor('apartments')).toBe('apartments');
    expect(groupFor('house')).toBe('houses');
    expect(groupFor('industrial')).toBe('commerce');
    expect(defaultColor('yes')).toBe(UNKNOWN_BUILDING_COLOR);
    expect(defaultColor('nieuw_bouwtype')).toBe(UNKNOWN_BUILDING_COLOR);
  });

  it('leest alleen geldige kleurwijzigingen uit gedeelde JSON', () => {
    const palette = parsePalette({ version: 1, colors: { house: '#AbC123', office: 'red', yes: '#123456' } });
    expect(palette.colors.house).toBe('#abc123');
    expect(palette.colors.office).toBe(defaultPalette().colors.office);
    expect(palette.colors.yes).toBe('#123456');
    expect(parsePalette({ version: 9, colors: {} })).toEqual(defaultPalette());
  });

  it('bewaart de aanpasbare kleuren lokaal in dezelfde structuur als de JSON-export', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const palette = defaultPalette();
    setTypeColor(palette, 'apartments', '#334455');
    expect(savePalette(palette)).toBe(true);
    expect(loadPalette().colors.apartments).toBe('#334455');
    expect(JSON.parse(storage.get(PALETTE_STORAGE_KEY)!)).toEqual(palette);
  });

  it('wijzigt alleen categorievolgers, ook na herhaald wijzigen en herladen', () => {
    let palette = defaultPalette();
    setTypeColor(palette, 'house', '#112233');
    setTypeColor(palette, 'villa', defaultColor('villa')); // even a deliberate default is protected
    setCategoryColor(palette, 'houses', '#112233');
    expect(palette.colors.detached).toBe('#112233');
    expect(palette.colors.villa).toBe(defaultColor('villa'));
    palette = parsePalette(JSON.parse(JSON.stringify(palette)));
    setCategoryColor(palette, 'houses', '#aabbcc');
    expect(palette.colors.house).toBe('#112233');
    expect(palette.colors.villa).toBe(defaultColor('villa'));
    expect(palette.colors.detached).toBe('#aabbcc');
    expect(palette.colors.church).toBe(defaultColor('church'));
    followCategory(palette, 'house');
    expect(palette.colors.house).toBe('#aabbcc');
    setCategoryColor(palette, 'houses', '#445566');
    expect(palette.colors.house).toBe('#445566');
    expect(palette.customTypes).not.toContain('house');
  });

  it('migreert bestaande persoonlijke kleuren en houdt standaardkleuren als categorievolgers', () => {
    const old = { version: 1, colors: { ...defaultPalette().colors, house: '#123456' } };
    const palette = parsePalette(old);
    expect(palette.version).toBe(2);
    expect(palette.customTypes).toEqual(['house']);
    setCategoryColor(palette, 'houses', '#abcdef');
    expect(palette.colors.house).toBe('#123456');
    expect(palette.colors.detached).toBe('#abcdef');
    expect(parsePalette(palette)).toEqual(palette);
  });

  it('past onbekend via het palet aan en bewaart een eigen yes-kleur bij een categoriewijziging', () => {
    const palette = defaultPalette();
    setTypeColor(palette, 'yes', '#123456');
    setCategoryColor(palette, 'other', '#abcdef');
    expect(palette.colors.yes).toBe('#123456');
    expect(palette.colors.unknown).toBe('#abcdef');
  });

  it('valideert categorieën, individuele keuzes en beschadigde opgeslagen instellingen', () => {
    const palette = defaultPalette();
    setCategoryColor(palette, 'missing', '#abcdef');
    setCategoryColor(palette, 'houses', 'red');
    setTypeColor(palette, 'missing', '#abcdef');
    setTypeColor(palette, 'house', 'red');
    expect(palette).toEqual(defaultPalette());
    const parsed = parsePalette({ version: 2, groupColors: { houses: '#AbCdEf', civic: 'red' },
      customTypes: ['house', 'house', 'missing', 'church'], colors: { house: '#123456', church: 'red' } });
    expect(parsed.colors.detached).toBe('#abcdef');
    expect(parsed.colors.house).toBe('#123456');
    expect(parsed.customTypes).toEqual(['house']);
    expect(parsed.groupColors.civic).toBeUndefined();
  });

  it('meldt een opslagfout zonder te doen alsof de kaart is bijgewerkt', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('Quota exceeded'); } });
    expect(savePalette(defaultPalette())).toBe(false);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
