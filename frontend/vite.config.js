import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/v1': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@react-pdf'))        return 'vendor-pdf';
          if (id.includes('recharts'))           return 'vendor-charts';
          if (id.includes('@mantine'))           return 'vendor-mantine';
          if (id.includes('@tanstack'))          return 'vendor-query';
          if (id.includes('react-router'))       return 'vendor-react';
          if (id.includes('react-dom'))          return 'vendor-react';
          if (/\/react\//.test(id))              return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },
})
