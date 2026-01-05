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
  //   target: 'esnext'
  // }
})
