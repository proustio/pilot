import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    // Base public path when served in development or production.
    // Useful if you deploy to a subdirectory (like GitHub Pages).
    base: './',

    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['**/*.{js,css,html,png,woff2,vert,frag}'],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB — menu card PNGs are ~3 MB each
                navigateFallbackDenylist: [/\/ping\.txt$/],
                runtimeCaching: [
                    {
                        // Health-check ping — MUST hit the real server, never cache
                        urlPattern: /\/ping\.txt$/,
                        handler: 'NetworkOnly'
                    },
                    {
                        // Cache-first for all same-origin assets (JS, CSS, images, fonts)
                        urlPattern: ({ request }) => 
                            request.destination === 'script' ||
                            request.destination === 'style' ||
                            request.destination === 'font' ||
                            request.destination === 'image',
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'battleships-assets',
                            expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }
                        }
                    },
                    {
                        // Network-first for navigation (HTML) — picks up updates when online
                        urlPattern: ({ request }) => request.mode === 'navigate',
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'battleships-html',
                            networkTimeoutSeconds: 3
                        }
                    }
                ]
            },
            manifest: false, // We provide our own public/manifest.json
        })
    ],

    build: {
        // Optimizes the build for modern browsers
        target: 'esnext',
        chunkSizeWarningLimit: 600,
        // Helps with Three.js performance by chunking dependencies
        rollupOptions: {
            output: {
                manualChunks: {
                    three: ['three']
                }
            }
        }
    },

    test: {
        // Utilizes the jsdom package you installed in package.json
        environment: 'jsdom',
        globals: true, // Allows you to use describe/it/expect without importing them
        // setupFiles: ['./src/test/setup.ts'], // Optional: if you need to mock canvas/webgl
    }
});