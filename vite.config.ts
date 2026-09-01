import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import registerHandler from './api/register.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'

function registrationDevApi(): Plugin {
  return { name: 'registration-dev-api', configureServer(server) {
    const env = loadEnv('public', process.cwd(), '')
    if (env.RESEND_API_KEY && !process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = env.RESEND_API_KEY
    server.middlewares.use('/api/register', (req: IncomingMessage, res: ServerResponse, next) => {
      if (req.method !== 'POST' && req.method !== 'OPTIONS') return next()
      let body = ''
      req.setEncoding('utf8')
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        const response = { setHeader: (name: string, value: string) => res.setHeader(name, value), status(code: number) { res.statusCode = code; return response }, json(payload: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)) } }
        void registerHandler({ method: req.method, body }, response).catch(() => { if (!res.writableEnded) { res.statusCode = 500; res.end(JSON.stringify({ message: 'Registration unavailable.' })) } })
      })
    })
  } }
}

export default defineConfig({ plugins: [react(), registrationDevApi()] })
