import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Multi-threaded Stockfish needs SharedArrayBuffer, which browsers only expose
// to cross-origin isolated pages.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
