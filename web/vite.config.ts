import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

const OCR_LANGUAGES = ['eng', 'rus']

/**
 * Serves the Tesseract.js worker and engine from this site instead of a CDN, under
 * `tesseract/`. The English and Russian models too, when `@tesseract.js-data/eng` and
 * `@tesseract.js-data/rus` are installed; otherwise Tesseract.js fetches them from its CDN.
 */
function tesseractAssets(): Plugin {
  const tesseractDir = dirname(require.resolve('tesseract.js/package.json'))
  const coreDir = dirname(require.resolve('tesseract.js-core/package.json'))
  const files: Record<string, string> = {
    'worker.min.js': join(tesseractDir, 'dist/worker.min.js'),
    // LSTM engine builds; the worker picks one by the device's SIMD support.
    'tesseract-core-lstm.wasm.js': join(coreDir, 'tesseract-core-lstm.wasm.js'),
    'tesseract-core-simd-lstm.wasm.js': join(coreDir, 'tesseract-core-simd-lstm.wasm.js'),
    'tesseract-core-relaxedsimd-lstm.wasm.js': join(coreDir, 'tesseract-core-relaxedsimd-lstm.wasm.js'),
  }
  // English and Russian models: exchanges are read in either interface language.
  for (const language of OCR_LANGUAGES) {
    let model: string | undefined
    try {
      model = join(dirname(require.resolve(`@tesseract.js-data/${language}/package.json`)), `4.0.0_best_int/${language}.traineddata.gz`)
    } catch {
      model = undefined
    }
    if (model && existsSync(model)) files[`lang/${language}.traineddata.gz`] = model
  }
  const hasModel = OCR_LANGUAGES.every((language) => `lang/${language}.traineddata.gz` in files)

  return {
    name: 'tesseract-assets',
    config: () => ({
      define: { 'import.meta.env.VITE_OCR_LOCAL_MODEL': JSON.stringify(hasModel) },
    }),
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = request.url?.match(/\/tesseract\/(.+)$/)
        const file = match && files[decodeURIComponent(match[1]!)]
        if (!file) return next()
        response.setHeader('Content-Type', file.endsWith('.gz') ? 'application/octet-stream' : 'text/javascript')
        response.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [name, file] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: `tesseract/${name}`, source: readFileSync(file) })
      }
    },
  }
}

/**
 * Emits sw.js from src/serviceWorker.js with this build's id and the list of files to
 * precache, so the installed app opens offline from the very first launch.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((name) => !name.startsWith('tesseract/') && !name.endsWith('.map'))
      const precache = [...files, 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'fonts/Geist-Variable.woff2', 'fonts/GeistMono-Variable.woff2'].map((name) => `./${name}`)
      const buildId = Date.now().toString(36)
      const source = readFileSync(new URL('./src/serviceWorker.js', import.meta.url), 'utf8')
      const header = `self.BUILD_ID = ${JSON.stringify(buildId)}\nself.PRECACHE = ${JSON.stringify(precache)}\n`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: header + source })
    },
  }
}

export default defineConfig({
  plugins: [react(), tesseractAssets(), serviceWorker()],
  // Relative asset paths so the build works from the GitHub Pages project subpath.
  base: './',
  // Two pages: the landing page at the site's root and the journal at /app/ (SPEC section 4.0).
  build: {
    rollupOptions: {
      input: { landing: fileURLToPath(new URL('./index.html', import.meta.url)), app: fileURLToPath(new URL('./app/index.html', import.meta.url)) },
    },
  },
  test: {
    environment: 'node',
  },
})
