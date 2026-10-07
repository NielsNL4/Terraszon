---
name: Terraszon
description: Existing Terraszon map interface and its completed discovery-panel extension.
colors:
  sun-mark: "#eda90a"
  time-accent: "#e9a600"
  sun-status: "#926000"
  focus: "#ba8100"
  toggle-focus: "#d79800"
  page: "#f4f1e8"
  map-base: "#e9e5da"
  map-card: "rgb(255 253 247 / 92%)"
  map-card-border: "rgb(36 39 34 / 10%)"
  panel: "#fffdf7"
  field: "#fffefb"
  hover: "#f2ede0"
  border: "#dedbd2"
  divider: "#e6e2d9"
  text: "#20231f"
  control-text: "#30322e"
  muted: "#62665f"
  quiet: "#777970"
  status-neutral: "#555e52"
  shade-status: "#49616f"
  filtered-status: "#3d6553"
  action-text: "#365744"
  action-border: "#d1d7c9"
  action-hover: "#eff2e9"
  action-active: "#e5e9dd"
  icon-text: "#454e43"
  checked: "#373a35"
  sunny-checked: "#f5bf31"
  sunny-border: "#e3a000"
  sunny-text: "#2f2a1e"
  selection: "#f5d681"
  skeleton: "#eeeade"
  scrollbar: "#abae9f"
  notice: "#343935"
  notice-text: "#fff"
  legend-sun: "#f2a900"
  legend-shade: "#536b7c"
  legend-tree: "#2d6945"
  legend-filtered: "#79a885"
typography:
  wordmark:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "17px"
    fontWeight: 750
    letterSpacing: "-.025em"
  title:
    fontSize: "16px"
    fontWeight: 750
    lineHeight: 1.35
  row-title:
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontSize: "13px"
    lineHeight: 1.5
  note:
    fontSize: "12px"
    lineHeight: 1.5
  label:
    fontSize: "11px"
    lineHeight: 1.4
  action:
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1.3
  time:
    fontSize: "24px"
    letterSpacing: "-.04em"
rounded:
  heading-focus: "3px"
  date: "7px"
  field: "8px"
  icon: "9px"
  search: "12px"
  brand: "14px"
  panel: "15px"
  controls: "17px"
  chip: "999px"
spacing:
  status-gap: "5px"
  action-gap: "8px"
  row-gap: "10px"
  field-margin: "12px 14px 0"
  row-padding: "13px 16px"
  body-padding: "0 14px 16px"
components:
  discover-button:
    backgroundColor: "{colors.map-card}"
    textColor: "{colors.control-text}"
    rounded: "{rounded.search}"
    padding: "0 12px"
  discover-button-hover:
    backgroundColor: "{colors.hover}"
  icon-button:
    textColor: "{colors.icon-text}"
    rounded: "{rounded.icon}"
    size: "40px"
  place-action:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.action-text}"
    typography: "{typography.action}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
  place-action-hover:
    backgroundColor: "{colors.action-hover}"
  place-action-active:
    backgroundColor: "{colors.action-active}"
  local-query:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "0 10px"
  layer-chip:
    textColor: "#71736c"
    rounded: "{rounded.chip}"
    padding: "5px 9px"
  layer-chip-checked:
    backgroundColor: "{colors.checked}"
    textColor: "{colors.panel}"
  place-row:
    textColor: "{colors.text}"
    padding: "{spacing.row-padding}"
  place-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
  sun-status:
    textColor: "{colors.sun-status}"
    typography: "{typography.label}"
---

# Design System: Terraszon

## Overview

This documents the coherent, existing Terraszon map interface and the completed F1 discovery extension. The implementation is the visual authority; no new creative direction or metaphor is selected. The Terraszon name, sun mark and Dutch controls are preserved, as required by `PRODUCT.md` and `.impeccable/surfaces/src-main-ts.md`.

The map fills the viewport. Cream overlays, dark green-grey text, warm sun accents, rounded controls and soft shadows carry the existing identity. Discovery adds a compact list and a shared detail view with separators rather than individually elevated row cards.

**Key Characteristics:**
- Full-viewport map with compact cream overlays.
- System-sans typography, dark green-grey text and warm sun accents.
- Rounded controls, soft overlay shadows and quiet row separators.
- Initially closed, nonmodal discovery with explicit Dutch status and source uncertainty.

Evidence inspected: `src/styles.css`, `src/place-panel.css`, `src/main.ts`, `src/place-panel.ts`, and status/source helpers in `src/discovery.ts`. Existing captures in `.impeccable/review/`: `desktop.png`, `mobile.png`, `desktop-list.png`, `mobile-list.png`, `user-320.png`, `landscape.png`, `keyboard.png`, `error.png`; geometry and check scope in `verification.json`. These are review evidence, not shipping assets. `Test*` venues and shadow classifications are synthetic fixtures; the MapLibre/OpenFreeMap base map is real.

Prior verification supplied for this completed extension: three initial reviewer findings resolved (keyboard full row at 390×400, live announcements, Dutch source facts), verdict **ship** within the scored fix scope; one detector result `[]`; native browser behaviors passed; code-level tests **147 passed**, lint and build passed. This documentation pass does not rerun those checks or imply a full performance or WCAG compliance assessment.

## Colors

### Primary

Warm sun colors remain contextual: `sun-mark` identifies Terraszon; `time-accent` fills the timeline and loading progress; `sun-status` labels direct sun and the panel caret. `focus` is the standard visible outline, with `toggle-focus` on layer toggles. These are distinct incumbent values, not a newly unified accent.

### Secondary

Green `action-text`/`filtered-status` identify detail actions, source links and possibly filtered light. Blue-grey `shade-status` identifies building shade and lack of direct daylight. These status colors accompany words and inline icons; they do not replace explanatory text.

### Neutral

`page` and `map-base` are fallback backgrounds. `map-card` is the existing translucent cream surface with its existing translucent border; `panel` is the opaque discovery surface. Preserve the normative CSS color formats above, including `rgb(... / ...%)`; do not convert translucent surfaces to opaque approximations. Fields, hover surfaces, dividers, skeletons and text levels use their own observed values.

### Source mappings

The frontmatter names are documentation keys, **not CSS custom properties**. Colors are literal declarations in the source.

| Tokens / roles | Source selectors |
| --- | --- |
| `page`, `text`, inherited font stack | `src/styles.css` → `:root` |
| `map-card`, `map-card-border` | `src/styles.css` → `.map-card` |
| `sun-mark`, `time-accent` | `src/styles.css` → `.sun-mark`, loading progress, range track/thumb |
| `checked`, sunny chip colors, `toggle-focus` | `src/styles.css` → `.toggles input:checked + span`, `.sun-only`, focus rule |
| Legend colors | `src/styles.css` → `.dot.sun`, `.shade`, `.tree`, `.filtered`, `.possible` |
| `panel`, `border`, `divider` | `src/place-panel.css` → `.place-panel`, `.place-query-row`, header and list separators |
| `muted`, `status-neutral`, status colors | `src/place-panel.css` → row metadata, context, `.place-status` and variants |
| Action colors | `src/place-panel.css` → `.place-action` and hover/active rules |
| `selection`, `scrollbar`, `skeleton` | `src/place-panel.css` → `::selection`, `.place-panel-body`, `.place-skeleton span` |
| `focus` | Both stylesheets → focus-visible / focus-within rules |
| `notice`, `notice-text` | `src/styles.css` → `.notice` |

## Typography

The inherited stack is Inter followed by UI/system sans and platform fallbacks, as recorded in `typography.wordmark`. It is a CSS family preference, not evidence of a loaded or self-hosted Inter font. Buttons and inputs inherit the stack. There is no distinct display or mono family in this surface.

- **Wordmark:** `wordmark`; loading logo uses 18px with the same weight and tracking.
- **Panel title:** `title`; up to three lines, wrapping long words. Keyboard-visible heading focus remains visible.
- **List name:** `row-title`; up to two lines with long-word wrapping.
- **Detail prose and facts:** `body`; notes use `note`. These are observed component styles, not a universal body reset.
- **Metadata and status:** `label`; context and distances use tabular numerals.
- **Actions:** `action`; Ontdek instead uses 12px/700.
- **Solar time:** `time`, tabular numerals; compact layout reduces it to 21px.
- **Compact search:** address and local-query inputs use 16px instead of desktop 13px.

## Layout

Desktop uses 24px edge offsets. Brand and solar cards occupy the top-left; search, location and Ontdek form a row at top 101px, width `min(430px, calc(100vw - 48px))`. The open discovery sidebar starts at top 163px/left 24px, width `min(352px, calc(100vw - 48px))`, bottom `calc(var(--control-panel-height, 230px) + 44px)`. The time card is centered at the bottom, max-width 850px, bottom 28px. The sidebar body scrolls independently.

Compact mode uses the exact query `(max-width: 680px), (max-height: 500px) and (pointer: coarse)`. `main.ts` moves the discovery panel, time controls and map actions into that order in `.bottom-controls`. This is an anchored bottom sheet, not a modal. Insets are 8px, gaps 8px, with bottom safe-area and keyboard offset handling. Sheet height is `min(330px, 42dvh, max(160px, calc(var(--visible-height, 100dvh) - 340px)))`. The open sheet condenses the time card to date/sunrise/sunset and range; labels, timeline events, footer, links and building status row are hidden. Attribution is lifted above bottom controls.

At width ≤680px and height ≤540px, an open panel hides the time and solar cards. At width ≥681px, height ≤500px and coarse pointer, open discovery becomes a fixed 330px left panel with 12px top/bottom/left insets; bottom controls start at left 356px. Brand and solar cards hide in that landscape arrangement.

`main.ts` measures the visual viewport and sets actual runtime properties `--visible-height`, `--keyboard-offset`, `--bottom-controls-height`, `--control-panel-height`. A keyboard offset >80px sets `.has-keyboard`. In compact keyboard mode brand, solar, time and map navigation hide; discovery height becomes `min(330px, max(160px, calc(var(--visible-height, 100dvh) - 160px)))`, the local input is 38px high, and spacing contracts. At the recorded visual viewport 390×400, the sheet is 240px high and a complete matching row remains visible (`keyboard.png`, `verification.json`). This is measured evidence for that scenario, not a guarantee for every device keyboard.

## Elevation & Depth

The map stays behind structural overlays. Shared map cards use a translucent surface, fine border, blur (18px) and soft shadow. Discovery uses an opaque surface and slightly stronger shadow, while list rows use only separators and state fills. Source z-indexes: map cards 2, discovery/notice 4, map actions/compact controls 5, loading screen 10.

### Shadow Vocabulary
- **Map overlay:** `0 12px 38px rgb(43 40 31 / 12%)` (`.map-card`).
- **Discovery:** `0 12px 38px rgb(43 40 31 / 16%)` (`.place-panel`).
- **Address results:** `0 12px 30px rgb(43 40 31 / 16%)` (`.search-results`).
- **Notice:** `0 8px 25px rgb(30 34 30 / 20%)` (`.notice`).
- **Selected marker:** `0 2px 8px rgb(35 53 36 / 25%), inset 0 0 0 3px #fffdf7` (`.selected-place-marker`).

The extension does not animate the panel opening. Existing motion is limited to loading fade (.35s ease), loading progress (1.25s ease-in-out infinite), locating pulse (1s ease-in-out infinite alternate), toggle state transition (.18s ease) and notice (.2s ease). The existing reduced-motion query disables transitions and animations and restores automatic scrolling.

## Shapes

Soft rectangular overlays use the observed radius roles in frontmatter. Search/trigger corners are 12px; brand/solar 14px; discovery and compact controls 15px; desktop time controls 17px. Local fields/actions use 8px, panel icon buttons 9px. Chips are pill-shaped; sun marks and map selection are circular. Selected marker size is 30px with a 2px green border and inset cream ring. List rows have no individual card radius.

Discovery SVGs use rounded caps/joins, no fill, current-color stroke (1.75), normally 18px. Status icons are 15px in rows and 20px in details. Existing address/location icons retain stroke 1.8 and solar-event icons 1.65; the extension does not homogenize these incumbent families.

## Components

### Buttons

Ontdek inherits `.map-card`, is at least 46px high, and uses the neutral hover surface on hover or `aria-expanded="true"`. Compact mode makes it 46px wide and hides its visible word while retaining its Dutch accessible name. Location uses a 46×46px control; locating state pulses the icon and disabled state has opacity .7/cursor wait.

Detail/retry actions are outlined, green-text controls, minimum 40px high (44px compact), with action hover/pressed fills. Back/close icon buttons are 40px square (44px compact), neutral hover and pressed fills. Panel controls and links use a 2px focus outline with offset −2px; trigger/location use +2px. Heading focus-visible uses +2px; local-query focus-within uses +1px. Do not remove those surrounding rings just because the inner input suppresses its own outline.

### Chips

Map-layer toggles are real checkbox labels, with pill-shaped spans, 10px/650 type, neutral borders and dark checked fill. Only the selected “Alleen zon” variant gets the warm yellow fill. Keyboard focus appears around the span. The open compact sheet hides the footer containing these toggles.

### Cards / Containers

Map cards share the translucent surface. Discovery has a fixed header, query/context area and flexing scroll body (`min-height: 0`, contained overscroll). The opaque panel, horizontal separators and 13px×16px row padding provide structure without a card stack. Long names wrap within the observed clamps; details and source values wrap rather than widening the panel.

### Inputs / Fields

Address search is a labeled combobox with a separate listbox. Its results appear below the field on desktop and above it in compact mode. Local discovery search is a separately labeled native search input, explicitly scoped to loaded venues in the current map bounds; matching also considers their address and amenity label. Both retain native input behavior. Date and range remain native controls; Escape in the date input is exempt from discovery's close handler.

### Navigation

The panel is initially hidden on desktop and mobile; the trigger starts with `aria-expanded="false"`. Ontdek or a location selection opens it. Opening the list focuses local search; selection focuses the detail heading. Back returns to the selected list row when available, otherwise search. Close/Escape clears selection and returns focus to a connected external origin or Ontdek. There is no dialog role, modal backdrop or focus trap. Rerenders preserve body scroll and connected keyed focus.

### Discovery rows, details and uncertainty

Rows contain venue name, category/terrace evidence, icon plus explicit status, and straight-line distance from user location or map center. Sorting is by distance, then Dutch name and ID; rows are rendered in batches of 80. Details expose available address, map/route actions, conditional website/phone, source facts, coordinates and source link. Address/custom points show their map position without inventing hospitality facts or sun classification.

“In de zon”, “Gebouwschaduw”, “Mogelijk gefilterd licht” and “Geen direct daglicht” are distinct classifications. “Terras bevestigd”, “Terras ingetekend” and “Terras niet bevestigd” are source evidence, separate from light status. Filtered light remains explicitly possible; it can pass the shared “Alleen zon” filter, so that filter does not imply guaranteed direct sun. Pending and unavailable states retain their own wording; unavailable is not shade. The classification is for the source pin, not proof of the exact seat, parasol/awning coverage, weather or a personally moved analysis point.

Missing data remains missing; source details can be outdated. Known terrace, wheelchair, covered and seasonal source codes are translated into Dutch; unknown codes remain `Bronwaarde: …`. Partial cover remains “Gedeeltelijk overdekt”; limited accessibility remains “Beperkt toegankelijk”. Opening hours are labeled “Openingstijden (bron)”, not interpreted as live availability.

### Loading, empty and error states

Loaded rows stay usable during update/error, with a status banner and retry on error. A no-data loading state has three static skeleton blocks. Empty name, empty area, layer-off, zoom-required and unavailable sun states explain the scope and provide appropriate existing actions. `aria-busy` signals pending content. A visually hidden, polite, atomic status region announces settled list counts/empty/filter states after 250ms, deduplicated and cleared on close/selection; loading/error banners also have status semantics.

## Do's and Don'ts

### Do:
- **Do** preserve the Terraszon name, existing sun mark and Dutch controls.
- **Do** use the observed source colors and formats, typography, rounded controls and focus treatments.
- **Do** start discovery closed on desktop and mobile and preserve its nonmodal navigation.
- **Do** keep source evidence, computed light status and uncertain or missing data distinct.
- **Do** use the established sidebar, bottom-sheet and coarse-pointer landscape arrangements.

### Don't:
- **Don't** turn discovery rows into individually elevated decorative cards.
- **Don't** imply guaranteed sun, weather, exact terrace seats or current opening availability from source-pin estimates.
- **Don't** treat synthetic Test* screenshot venues as real content or shipping assets.
- **Don't** describe Inter as loaded or self-hosted, or infer performance or WCAG compliance from this evidence.
- **Don't** invent CSS custom properties or normalize the incumbent colors into a new palette.
