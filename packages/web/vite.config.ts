import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Capas de Livro: o nginx do docker-compose (ADR-0008). O proxy existe
      // para que `coverUrl` seja sempre um caminho relativo — em produção
      // /capas/ é atendido pela mesma origem, sem variável de ambiente no meio.
      '/capas': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
