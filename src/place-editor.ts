import { searchPlaces, type SearchResult } from './search';
import { placeCoordinates, type PlaceCoordinates } from './places';
import type { PlaceDraft } from './personal-places';

export function createPlaceEditor(host: HTMLElement, initial: PlaceDraft, options: {
  onCoordinates: (coordinates: PlaceCoordinates) => void;
  onFocusMap: () => void;
  onSave: (draft: PlaceDraft) => void;
  onCancel: () => void;
}) {
  host.innerHTML = `
    <form class="place-editor">
      <label>Naam<input name="name" id="personal-name" required maxlength="200" autocomplete="off" placeholder="Bijvoorbeeld mijn tuin" /></label>
      <label>Type<select name="type" id="personal-type"><option value="other">Overige plek</option><option value="terrace">Terras</option><option value="garden">Tuin</option><option value="park">Park</option></select></label>
      <label>Notitie <span class="place-field-optional">(optioneel)</span><textarea name="note" id="personal-note" maxlength="2000" rows="2" placeholder="Bijvoorbeeld het bankje achterin"></textarea></label>
      <label>Adres zoeken <span class="place-field-optional">(optioneel)</span><input id="personal-address" type="search" autocomplete="off" placeholder="Adres, straat of plaats" /></label>
      <div class="place-editor-suggestions"></div>
      <fieldset><legend>Positie</legend><div class="place-coordinate-fields">
        <label>Breedtegraad<input id="personal-latitude" name="latitude" inputmode="decimal" required /></label>
        <label>Lengtegraad<input id="personal-longitude" name="longitude" inputmode="decimal" required /></label>
      </div><button class="place-action" type="button" data-focus-map>Punt kiezen op kaart</button></fieldset>
      <p class="place-editor-status" role="status" aria-live="polite"></p>
      <div class="place-editor-actions"><button class="place-action place-action-primary" type="submit">Bewaren</button><button class="place-action" type="button" data-cancel>Annuleren</button></div>
    </form>`;
  const form = host.querySelector<HTMLFormElement>('form')!;
  const name = form.querySelector<HTMLInputElement>('#personal-name')!;
  const type = form.querySelector<HTMLSelectElement>('#personal-type')!;
  const note = form.querySelector<HTMLTextAreaElement>('#personal-note')!;
  const address = form.querySelector<HTMLInputElement>('#personal-address')!;
  const latitude = form.querySelector<HTMLInputElement>('#personal-latitude')!;
  const longitude = form.querySelector<HTMLInputElement>('#personal-longitude')!;
  const status = form.querySelector<HTMLElement>('.place-editor-status')!;
  const suggestions = form.querySelector<HTMLElement>('.place-editor-suggestions')!;
  let timer: ReturnType<typeof setTimeout> | undefined, request: AbortController | null = null, generation = 0, disposed = false;
  name.value = initial.name; type.value = initial.type ?? 'other'; note.value = initial.note;
  const setCoordinates = (coordinates: PlaceCoordinates, announce = true) => {
    const valid = placeCoordinates(coordinates);
    latitude.value = String(valid[1]); longitude.value = String(valid[0]);
    options.onCoordinates(valid);
    if (announce) { status.textContent = 'Positie bijgewerkt. Je wijzigingen zijn nog niet opgeslagen.'; status.classList.remove('error'); }
  };
  const coordinates = () => {
    if (!latitude.value.trim() || !longitude.value.trim()) throw new Error('Vul beide coördinaten in of kies een punt op de kaart.');
    return placeCoordinates([Number(longitude.value.replace(',', '.')), Number(latitude.value.replace(',', '.'))]);
  };
  const showError = (error: unknown) => {
    status.textContent = error instanceof Error ? error.message : 'Opslaan lukt niet. Je invoer blijft behouden.';
    status.classList.add('error');
  };
  const acceptAddress = (result: SearchResult) => {
    generation++; request?.abort(); clearTimeout(timer); suggestions.replaceChildren();
    address.value = [result.label, result.detail].filter(Boolean).join(', ');
    if (!name.value.trim()) name.value = result.label;
    setCoordinates(result.coordinates);
    options.onFocusMap();
  };
  latitude.value = String(initial.coordinates[1]); longitude.value = String(initial.coordinates[0]);
  for (const field of [latitude, longitude]) field.addEventListener('change', () => { try { setCoordinates(coordinates()); } catch (error) { showError(error); } });
  form.querySelector('[data-focus-map]')!.addEventListener('click', options.onFocusMap);
  form.querySelector('[data-cancel]')!.addEventListener('click', options.onCancel);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { options.onSave({ name: name.value.trim(), type: type.value as PlaceDraft['type'], note: note.value, coordinates: coordinates() }); }
    catch (error) { showError(error); }
  });
  address.addEventListener('input', () => {
    generation++; const id = generation; clearTimeout(timer); request?.abort(); suggestions.replaceChildren();
    if (address.value.trim().length < 3) return;
    timer = setTimeout(async () => {
      request = new AbortController(); status.textContent = 'Adressen zoeken…';
      try {
        const results = await searchPlaces(address.value.trim(), request.signal);
        if (disposed || id !== generation) return;
        status.textContent = results.length ? 'Kies een adres om de pin te verplaatsen.' : 'Geen adres gevonden. Je kunt ook een kaartpunt kiezen.';
        status.classList.remove('error');
        for (const result of results.slice(0, 5)) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'place-editor-result';
          button.textContent = [result.label, result.detail].filter(Boolean).join(', ');
          button.addEventListener('click', () => acceptAddress(result)); suggestions.append(button);
        }
      } catch (error) { if (!disposed && id === generation) showError(error); }
    }, 400);
  });
  return {
    setCoordinates,
    acceptAddress,
    focus: () => name.focus({ preventScroll: true }),
    showError,
    dispose() { disposed = true; generation++; clearTimeout(timer); request?.abort(); },
  };
}
