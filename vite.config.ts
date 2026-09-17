import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    host: true,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        contracts: 'contracts-demo.html',
        apocalypseV2: 'apocalypse-v2.html',
        apocalypseV3: 'apocalypse-v3.html',
        pzSurvival: 'pz-survival.html',
      },
    },
  },
})
