import { defineConfig } from 'vite'
import webExtension, { readJsonFile } from 'vite-plugin-web-extension'
import { resolve } from 'path'

function generateManifest() {
  const manifest = readJsonFile('manifest.json')
  const pkg = readJsonFile('package.json')
  return {
    ...manifest,
    version: pkg.version,
  }
}

export default defineConfig({
  // Copy contents of src/assets/ to dist/ root so icons are accessible
  publicDir: resolve(__dirname, 'src/assets'),
  plugins: [
    webExtension({
      manifest: generateManifest,
      // Disable HMR reload for service workers (not supported in MV3)
      disableAutoLaunch: true,
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Disable minification for easier debugging during development
    minify: false,
    // Increase chunk size warning to avoid false positives for extension bundles
    chunkSizeWarningLimit: 1024,
  },
  server: {
    port: 3000,
  },
})