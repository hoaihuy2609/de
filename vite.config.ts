import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { latexCompilerPlugin } from './latexVitePlugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProd = mode === 'production';
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), latexCompilerPlugin()],
    optimizeDeps: {
      include: ['xlsx'],
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.VITE_GITHUB_TOKEN': JSON.stringify(env.VITE_GITHUB_TOKEN),
      'process.env.VITE_GITHUB_REPO': JSON.stringify(env.VITE_GITHUB_REPO),
      'process.env.VITE_GITHUB_BRANCH': JSON.stringify(env.VITE_GITHUB_BRANCH),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // Keep console.log in production so voice-grader [VG] logs are visible in DevTools
    esbuild: isProd ? { drop: ['debugger'] } : {},
    build: {
      target: 'es2020',
      sourcemap: false,
      cssCodeSplit: true,
      minify: 'esbuild',
      // Suppress size warnings for intentionally large vendor bundles
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        treeshake: {
          // Only tree-shake pure property reads — do NOT set moduleSideEffects: false
          // as it causes side-effectful packages (react-dom, supabase) to produce empty chunks.
          propertyReadSideEffects: false,
        },
        output: {
          // Merge micro-chunks smaller than 10 kB into their importers,
          // eliminating the ~25 tiny lucide-react icon files from the build.
          experimentalMinChunkSize: 10_000,
          manualChunks(id) {
            // Normalize Windows backslashes for reliable matching
            const n = id.replace(/\\/g, '/');
            if (!n.includes('/node_modules/')) return undefined;

            // React runtime — react, react-dom, react-is, scheduler
            if (/\/node_modules\/(react|react-dom|react-is|scheduler)\//.test(n)) return 'vendor-react';
            // Router
            if (/\/node_modules\/(react-router|@remix-run)\//.test(n)) return 'vendor-router';
            // State
            if (n.includes('/node_modules/zustand/')) return 'vendor-state';
            // Icons
            if (n.includes('/node_modules/lucide-react/')) return 'vendor-icons';
            // Charts
            if (/\/node_modules\/(recharts|d3-|victory-vendor)/.test(n)) return 'vendor-recharts';
            // Math + Markdown — merged to avoid circular deps between
            // rehype-katex (needs katex) and unified ecosystem (needs rehype-katex).
            // Both are always loaded together by BlogDetail/LessonView anyway.
            if (/\/node_modules\/(katex|rehype-katex|remark-math|rehype-raw|react-markdown|rehype-|remark-|unified|hast|mdast|micromark|vfile|bail|extend|is-plain|decode-named|character-entities|zwitch|comma-separated|space-separated|property-information|hastscript|stringify-entities|ccount|longest-streak|trim-lines|markdown-table|trough)/.test(n)) return 'vendor-content';
            // Supabase
            if (n.includes('/node_modules/@supabase/')) return 'vendor-supabase';
            // JSZip — dynamically imported (admin-only sync), keep separate so it
            // is NOT eagerly loaded with crypto-js on startup.
            if (n.includes('/node_modules/jszip/')) return 'vendor-jszip';
            // Crypto utils — statically required at startup (activation check)
            if (n.includes('/node_modules/crypto-js/')) return 'vendor-utils';
          },
        },
      },
    },
  };
});
