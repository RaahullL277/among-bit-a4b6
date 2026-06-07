import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180 },
  // The two production domains (and previews) the app is served on.
  preview: {
    port: 5180,
    allowedHosts: ['ecom.imagine.bo', 'www.ecom.imagine.bo', 'ecompartner.imagine.bo', 'www.ecompartner.imagine.bo'],
  },
})
