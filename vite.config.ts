import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'opening-hours-source-and-licenses',
    generateBundle() {
      for (const name of ['LGPL-3.0-only.txt', 'CC0-1.0.txt', 'ODbL-1.0.txt']) {
        this.emitFile({ type: 'asset', fileName: `licenses/opening_hours/${name}`,
          source: readFileSync(new URL(`./node_modules/opening_hours/LICENSES/${name}`, import.meta.url), 'utf8') });
      }
      this.emitFile({ type: 'asset', fileName: 'licenses/opening_hours/original-module.mjs',
        source: readFileSync(new URL('./node_modules/opening_hours/build/opening_hours.esm.mjs', import.meta.url), 'utf8') });
      this.emitFile({ type: 'asset', fileName: 'licenses/opening_hours/NOTICE.txt', source: [
        'Terraszon uses opening_hours.js 3.15.0, copyright its contributors, LGPL-3.0-only.',
        'The library is unmodified. Its original distributable ESM module is provided alongside this notice.',
        'Full corresponding source: https://github.com/opening-hours/opening_hours.js/tree/v3.15.0',
        'Package: https://registry.npmjs.org/opening_hours/-/opening_hours-3.15.0.tgz',
        'GNU LGPL v3: https://www.gnu.org/licenses/lgpl-3.0.html',
        'GNU GPL v3 (incorporated by LGPL v3): https://www.gnu.org/licenses/gpl-3.0.html',
        'Included data notices: see CC0-1.0.txt and ODbL-1.0.txt; OpenStreetMap contributors.',
        'The separately loaded worker can be rebuilt/replaced with a modified library using the source project and npm dependency.',
      ].join('\n') });
    },
  }],
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        buildingColors: fileURLToPath(new URL('./gebouwkleuren.html', import.meta.url)),
      },
    },
  },
});
