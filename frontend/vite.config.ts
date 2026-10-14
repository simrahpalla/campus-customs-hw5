import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dashboard talks to the FastAPI backend at http://localhost:8000 directly
// (CORS for http://localhost:5173 is set in backend/main.py). Override with VITE_API_BASE.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
