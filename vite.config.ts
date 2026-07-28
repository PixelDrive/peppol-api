import { defineConfig } from 'vite';

export default defineConfig({
    appType: 'custom',
    optimizeDeps: {
        noDiscovery: true,
    },
    ssr: {
        target: 'node',
    },
    build: {
        ssr: true,
        outDir: 'dist',
        target: 'node20',
        rollupOptions: {
            input: 'src/index.ts',
            external: (id) =>
                !id.startsWith('.') &&
                !id.startsWith('/') &&
                id !== 'src/index.ts',
            output: {
                entryFileNames: 'index.mjs',
                format: 'esm',
            },
        },
    },
});
