import type { TabDeps } from '../../demo/tabPanels.js';
import { filterControlsHtml } from '../../demo/filterUi.js';

/**
 * What the page hands the Oils and Sets tabs (demo/tabPanels.ts), stood in for
 * by the simplest markup that still names every control a test reads, so a
 * tab can be drawn and filtered in Node. The Filters button and chips are the
 * real markup (demo/filterUi.ts).
 */
export function tabDeps(): TabDeps {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return {
    attrs: (f) => ({ concentration: 'edp', gender: 'notStated', tier: f.tier, priceBand: null, inStock: true }),
    concentrationOptions: [{ value: 'edp', label: 'Eau de Parfum (EDP)' }],
    genderOptions: [{ value: 'notStated', label: 'Not Stated' }],
    priceOptions: [{ value: '0-25', label: 'Under £25' }],
    tierOptions: [
      { value: 'designer', label: 'Designer' },
      { value: 'niche', label: 'Niche' },
      { value: 'mideast', label: 'Middle East' },
    ],
    fragranceList: (list, empty) => (list.length ? `<ul>${list.length}</ul>` : `<p>${empty}</p>`),
    sortControl: (id, subject, options, current) =>
      `<select id="${id}" data-subject="${subject}">${options.map((o) => `<option value="${o.value}"${o.value === current ? ' selected' : ''}>${o.label}</option>`).join('')}</select>`,
    listControls: (sort, ui) => `${sort}${ui.toggle}${ui.panel}`,
    filterControls: (ctx) => filterControlsHtml(ctx, { esc, iconFilter: '<i/>', iconClose: '<i/>', iconChevron: '<i/>' }),
    esc,
  };
}
