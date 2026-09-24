import { defineConfig } from 'vite';

// `base: './'` makes every asset path relative, so the built site works
// whether it's served from a domain root or a GitHub Pages project path
// like https://you.github.io/pocket-arcade/. Routing uses the URL hash,
// so no server rewrites are needed.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
});
