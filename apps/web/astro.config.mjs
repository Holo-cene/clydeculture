import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  // SSR on Cloudflare's Workers runtime. Pages opt into build-time prerender
  // individually with `export const prerender = true` (hybrid). The browser/SSR
  // reads Supabase via the anon key scoped by RLS — see ADR 0001.
  output: 'server',
  adapter: cloudflare({
    // Lets `astro dev` expose Cloudflare bindings/env via Astro.locals.runtime.
    platformProxy: { enabled: true },
    // Link-first: source images are hotlinked, never processed. Passthrough
    // skips sharp (unavailable on the Workers runtime) entirely.
    imageService: 'passthrough',
  }),
});
