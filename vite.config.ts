import { defineConfig } from 'vitest/config';

export default defineConfig({
    // Base public path when served in development or production.
    // Useful if you deploy to a subdirectory (like GitHub Pages).
    base: './',

    build: {
        // Optimizes the build for modern browsers
        target: 'esnext',
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