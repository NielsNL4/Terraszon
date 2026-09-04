import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function emitMapLibreWorkerSharedChunk(): Plugin {
  return {
    name: 'emit-maplibre-worker-shared-chunk',
    generateBundle() {
      const sharedWorker = resolve(
        process.cwd(),
        'node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs',
      );
      this.emitFile({
        type: 'asset',
        fileName: 'assets/maplibre-gl-shared.mjs',
        source: readFileSync(sharedWorker),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [emitMapLibreWorkerSharedChunk()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
});
