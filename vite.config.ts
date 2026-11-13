import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from 'vite-plugin-pwa'

// The home page's 3D code (three.js and the drum viewer) is a lazy chunk, so the browser only learns about it after the
// main bundle has downloaded and run. This hands their hashed file names to the inline script in index.html, which
// preloads them (on the home page only) in parallel with the main bundle.
function preloadDrumChunks(): Plugin {
  return {
    name: "preload-drum-chunks",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const files = Object.values(ctx.bundle ?? {})
          .filter((c) => c.type === "chunk" && /^(DrumViewer|materials)$/.test(c.name))
          .map((c) => JSON.stringify("/" + c.fileName));
        return html.replace("/*__DRUM_CHUNKS__*/", files.join(", "));
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Set base path for GitHub Pages deployment
  // Change this to your repository name if deploying to https://username.github.io/repo-name/
  // Leave as '/' if deploying to a custom domain or https://username.github.io/
  base: '/',
  plugins: [
    react(),
    preloadDrumChunks(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'ITAIKO Configurator',
        short_name: 'ITAIKO',
        description: 'ITAIKO Drum Configurator',
        theme_color: '#0a0a0a',
        start_url: '/configure',
        scope: '/configure',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      pwaAssets: {
        config: true,
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
