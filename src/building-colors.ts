import './building-colors.css';
import {
  BUILDING_TYPES,
  GROUPS,
  categoryColor,
  defaultPalette,
  followCategory,
  groupFor,
  loadPalette,
  PALETTE_STORAGE_KEY,
  savePalette,
  setCategoryColor,
  setTypeColor,
} from './building-palette';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App-element ontbreekt');

app.innerHTML = `
  <div class="palette-page">
    <header class="palette-header">
      <a class="palette-brand" href="./"><span class="sun-mark" aria-hidden="true"></span>Terraszon</a>
      <a class="back-link" href="./">← Terug naar de kaart</a>
    </header>
    <main>
      <div class="palette-intro">
        <div><h1>Geef de stad kleur.</h1><p>Elk gebouwtype zijn eigen tint. Kies, vergelijk en zie je keuzes terug op de kaart.</p></div>
        <span class="palette-total">${BUILDING_TYPES.length} OSM-types</span>
      </div>
      <div class="palette-workspace">
        <aside class="palette-inspector" aria-label="Kleurvoorvertoning">
          <div class="palette-scene" id="preview-scene"><div class="preview-shadow"></div><div class="preview-building"><div class="preview-roof"></div><div class="preview-side"></div><div class="preview-front"><span></span><span></span><span></span><span></span></div></div></div>
          <h2 id="preview-name">house</h2>
          <p id="preview-group">Huizen</p>
          <p class="preview-hex" id="preview-hex">#cf937e</p>
          <p class="preview-note">De kaart gebruikt deze kleuren waar het gebouwtype bekend is. Zonder type geldt de kleur van <code>building=yes</code>.</p>
          <button id="copy-palette" type="button" class="primary-action">Kopieer kleuren als JSON</button>
          <button id="reset-palette" type="button" class="quiet-action">Herstel alle standaardkleuren</button>
          <p id="palette-status" class="palette-status" role="status" aria-live="polite" data-state="saved">Autosave aan · wijzigingen worden automatisch in deze browser opgeslagen.</p>
        </aside>
        <section class="palette-catalog" aria-label="Gebouwtypes en kleuren">
          <div class="catalog-toolbar">
            <label for="type-search">Zoek gebouwtype<input id="type-search" type="search" placeholder="Bijvoorbeeld house, church of kantoor" autocomplete="off" /></label>
            <label for="group-filter">Categorie<select id="group-filter"><option value="all">Alle categorieën</option>${GROUPS.map((group) => `<option value="${group.id}">${group.label}</option>`).join('')}<option value="other">Overig & onbekend</option></select></label>
          </div>
          <p class="category-help">Kies een kleur per categorie of pas een type apart aan. Types met een <strong>eigen kleur</strong> behouden die bij categoriewijzigingen.</p>
          <p id="result-count" class="result-count"></p>
          <div id="type-list"></div>
        </section>
      </div>
    </main>
  </div>
`;

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Element ontbreekt: ${selector}`);
  return result;
}

const list = element<HTMLElement>('#type-list');
const search = element<HTMLInputElement>('#type-search');
const filter = element<HTMLSelectElement>('#group-filter');
const status = element<HTMLElement>('#palette-status');
const previewName = element<HTMLElement>('#preview-name');
const previewGroup = element<HTMLElement>('#preview-group');
const previewHex = element<HTMLElement>('#preview-hex');
const scene = element<HTMLElement>('#preview-scene');
const groupNames = new Map<string, string>(GROUPS.map((group) => [group.id, group.label]));
let palette = loadPalette();
let selected = 'house';
let saveTimer = 0;
let dirty = false;

function selectType(type: string): void {
  selected = type;
  previewName.textContent = type;
  previewGroup.textContent = groupNames.get(groupFor(type)) ?? 'Overig & onbekend';
  previewHex.textContent = palette.colors[type];
  scene.style.setProperty('--preview-color', palette.colors[type]);
  for (const row of list.querySelectorAll<HTMLElement>('.type-row')) {
    row.classList.toggle('selected', row.dataset.type === type);
  }
}

function persist(): void {
  window.clearTimeout(saveTimer);
  const saved = savePalette(palette);
  dirty = !saved;
  status.dataset.state = saved ? 'saved' : 'error';
  status.textContent = saved
    ? 'Opgeslagen in deze browser. Je kleuren staan klaar op de kaart.'
    : 'Opslaan lukt niet. Kopieer de JSON om je kleuren te bewaren.';
}

function scheduleSave(): void {
  dirty = true;
  status.dataset.state = 'saving';
  status.textContent = 'Opslaan…';
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persist, 180);
}

function refreshColors(): void {
  for (const row of list.querySelectorAll<HTMLElement>('.type-row')) {
    const type = row.dataset.type!;
    const custom = palette.customTypes.includes(type);
    row.style.setProperty('--row-color', palette.colors[type]);
    row.querySelector<HTMLInputElement>('.color-picker')!.value = palette.colors[type];
    row.querySelector<HTMLInputElement>('.hex-input')!.value = palette.colors[type];
    row.querySelector<HTMLElement>('.type-ownership')!.textContent = custom ? 'Eigen kleur' : 'Volgt categorie';
    row.classList.toggle('custom-color', custom);
    const reset = row.querySelector<HTMLButtonElement>('.row-reset')!;
    reset.disabled = !custom;
    reset.setAttribute('aria-label', `${type}: volg de categoriekleur`);
  }
  for (const section of list.querySelectorAll<HTMLElement>('.type-group-controls')) {
    const group = section.dataset.group!;
    section.querySelector<HTMLInputElement>('.color-picker')!.value = categoryColor(palette, group);
    section.querySelector<HTMLInputElement>('.hex-input')!.value = categoryColor(palette, group);
    const types = BUILDING_TYPES.filter((type) => groupFor(type) === group);
    const custom = types.filter((type) => palette.customTypes.includes(type)).length;
    section.querySelector<HTMLElement>('.category-scope')!.textContent =
      `${types.length - custom} types volgen categorie · ${custom} met eigen kleur`;
  }
  selectType(selected);
}

function changeColor(type: string, color: string): void {
  setTypeColor(palette, type, color);
  selected = type;
  refreshColors();
  scheduleSave();
}

function changeCategory(group: string, color: string): void {
  setCategoryColor(palette, group, color);
  refreshColors();
  scheduleSave();
}

function listenToHex(hex: HTMLInputElement, current: () => string, change: (color: string) => void): void {
  hex.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) {
      hex.removeAttribute('aria-invalid');
      change(hex.value);
    }
  });
  hex.addEventListener('change', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) {
      hex.removeAttribute('aria-invalid');
      persist();
    } else {
      hex.value = current();
      hex.setAttribute('aria-invalid', 'true');
      if (dirty) persist();
      status.dataset.state = 'error';
      status.textContent = 'Ongeldige kleur. Gebruik een hexkleur zoals #cf937e.';
    }
  });
}

function renderList(): void {
  list.replaceChildren();
  const query = search.value.trim().toLowerCase();
  const category = filter.value;
  const matching = BUILDING_TYPES.filter((type) =>
    (category === 'all' || groupFor(type) === category)
    && (type.includes(query) || (groupNames.get(groupFor(type)) ?? 'overig').toLowerCase().includes(query)));
  element<HTMLElement>('#result-count').textContent = `${matching.length} van ${BUILDING_TYPES.length} types`;
  if (!matching.length) {
    const empty = document.createElement('p');
    empty.className = 'catalog-empty';
    empty.textContent = 'Geen types gevonden. Probeer een andere zoekterm of categorie.';
    list.append(empty);
    return;
  }
  const sections = [...GROUPS.map((group) => ({ id: group.id, label: group.label })),
    { id: 'other', label: 'Overig & onbekend' }];
  for (const section of sections) {
    const types = matching.filter((type) => groupFor(type) === section.id);
    if (!types.length) continue;
    const heading = document.createElement('h2');
    heading.className = 'type-group-heading';
    heading.textContent = `${section.label} · ${types.length}`;
    list.append(heading);
    const controls = document.createElement('div');
    controls.className = 'type-group-controls';
    controls.dataset.group = section.id;
    const categoryLabel = document.createElement('label');
    categoryLabel.className = 'category-color-label';
    categoryLabel.textContent = 'Categoriekleur';
    const categoryPicker = document.createElement('input');
    categoryPicker.type = 'color';
    categoryPicker.className = 'color-picker';
    categoryPicker.setAttribute('aria-label', `Categoriekleur voor ${section.label}`);
    categoryPicker.addEventListener('input', () => changeCategory(section.id, categoryPicker.value));
    categoryPicker.addEventListener('change', persist);
    categoryLabel.append(categoryPicker);
    const categoryHex = document.createElement('input');
    categoryHex.type = 'text';
    categoryHex.className = 'hex-input';
    categoryHex.maxLength = 7;
    categoryHex.setAttribute('aria-label', `Hexkleur voor categorie ${section.label}`);
    listenToHex(categoryHex, () => categoryColor(palette, section.id), (color) => changeCategory(section.id, color));
    const scope = document.createElement('p');
    scope.className = 'category-scope';
    controls.append(categoryLabel, categoryHex, scope);
    list.append(controls);
    for (const type of types) {
      const row = document.createElement('div');
      row.className = 'type-row';
      row.dataset.type = type;
      row.style.setProperty('--row-color', palette.colors[type]);
      const swatch = document.createElement('span');
      swatch.className = 'type-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const name = document.createElement('div');
      name.className = 'type-name';
      const label = document.createElement('strong');
      label.textContent = type.replaceAll('_', ' ');
      const code = document.createElement('small');
      code.textContent = `building=${type}`;
      const ownership = document.createElement('small');
      ownership.className = 'type-ownership';
      name.append(label, code, ownership);
      const picker = document.createElement('input');
      picker.className = 'color-picker';
      picker.type = 'color';
      picker.value = palette.colors[type];
      picker.setAttribute('aria-label', `Kleur voor ${type}`);
      picker.addEventListener('input', () => changeColor(type, picker.value));
      picker.addEventListener('change', persist);
      const hex = document.createElement('input');
      hex.className = 'hex-input';
      hex.type = 'text';
      hex.maxLength = 7;
      hex.value = palette.colors[type];
      hex.setAttribute('aria-label', `Hexkleur voor ${type}`);
      listenToHex(hex, () => palette.colors[type], (color) => changeColor(type, color));
      const reset = document.createElement('button');
      reset.className = 'row-reset';
      reset.type = 'button';
      reset.textContent = 'Volg categorie';
      reset.addEventListener('click', () => {
        followCategory(palette, type);
        refreshColors();
        persist();
      });
      row.addEventListener('focusin', () => selectType(type));
      row.addEventListener('pointerenter', () => selectType(type));
      row.append(swatch, name, picker, hex, reset);
      list.append(row);
    }
  }
  refreshColors();
}

search.addEventListener('input', renderList);
filter.addEventListener('change', renderList);
element<HTMLButtonElement>('#reset-palette').addEventListener('click', () => {
  palette = defaultPalette();
  renderList();
  persist();
});
element<HTMLButtonElement>('#copy-palette').addEventListener('click', async () => {
  persist();
  try {
    await navigator.clipboard.writeText(JSON.stringify(palette, null, 2));
    status.textContent = 'JSON gekopieerd. Plak het in dit gesprek zodat ik je kleuren kan lezen.';
  } catch {
    status.textContent = 'Kopiëren lukt niet. Geef deze pagina klembordtoegang via HTTPS of localhost.';
  }
});

for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href="./"]')) {
  link.addEventListener('click', () => { if (dirty) persist(); });
}
window.addEventListener('pagehide', () => { if (dirty) persist(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && dirty) persist();
});
window.addEventListener('storage', (event) => {
  if (!dirty && (event.key === PALETTE_STORAGE_KEY || event.key === null)) {
    palette = loadPalette();
    renderList();
    status.dataset.state = 'saved';
    status.textContent = 'Opgeslagen kleuren uit je andere tabblad geladen.';
  }
});

renderList();
