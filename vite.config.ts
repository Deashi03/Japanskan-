import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Japanskan',
        short_name: 'Japanskan',
        description: 'Lär dig japanska ord med FSRS',
        lang: 'sv',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        background_color: '#fbf7f2',
        theme_color: '#2f52a5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
})
