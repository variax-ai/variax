import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.CI ? '/variax/' : '/',
  build: {
    outDir: 'dist',
  },
})
