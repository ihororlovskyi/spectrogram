import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    open: true
  },
  // assetsInclude: ['**/*.mp3'],
  // build: {
  //   target: 'es2020',
  //   target: 'esnext',
  //   minify: 'esbuild',
  //   sourcemap: true
  // }
})
