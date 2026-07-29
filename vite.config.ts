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
            input: {
                index: 'src/index.ts',
                worker: 'src/workers/index.ts',
            },
            external: (id) =>
                !id.startsWith('.') &&
                !id.startsWith('/') &&
                id !== 'src/index.ts' &&
                id !== 'src/workers/index.ts',
            output: {
                entryFileNames: '[name].mjs',
                format: 'esm',
            },
        },
    },
});
