import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        buildingColors: fileURLToPath(new URL('./gebouwkleuren.html', import.meta.url)),
      },
    },
  },
});
