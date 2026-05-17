import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import tailwindcss from '@tailwindcss/vite'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    electron({
      main: {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3', 'pdf-parse', 'chokidar', 'pdf-lib', 'tesseract.js', 'pdfjs-dist/legacy/build/pdf.mjs', 'canvas', 'node-llama-cpp']
            }
          }
        }
      },
      preload: {
        input: 'src/preload/preload.ts',
      },
    }),
    renderer(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        search: 'src/search.html',
      },
    },
  },
})
