import { Resend } from 'resend'

type RequestLike = { method?: string; body?: unknown }
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }

export default async function handler(req: RequestLike, res: ResponseLike) {
  console.info('[registration] route reached', { method: req.method })
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).json({})
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })

  let body: unknown
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body } catch { console.warn('[registration] body parse failed'); return res.status(400).json({ success: false, error: 'Please provide valid JSON.' }) }
  const name = typeof (body as { name?: unknown })?.name === 'string' ? (body as { name: string }).name.trim() : ''
  const email = typeof (body as { email?: unknown })?.email === 'string' ? (body as { email: string }).email.trim().toLowerCase() : ''
  const turnstileToken = typeof (body as { turnstileToken?: unknown })?.turnstileToken === 'string' ? (body as { turnstileToken: string }).turnstileToken.trim() : ''
  console.info('[registration] body parsed', { hasName: Boolean(name), hasEmail: Boolean(email), hasTurnstileToken: Boolean(turnstileToken) })
  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.warn('[registration] validation failed'); return res.status(400).json({ success: false, error: 'Please provide a valid name and email.' }) }

  if (!turnstileToken) { console.warn('[registration] Turnstile token missing'); return res.status(400).json({ success: false, code: 'turnstile_required', error: 'Please complete verification.' }) }
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
  if (!turnstileSecret || turnstileSecret === '<your-turnstile-secret-key-here>') { console.error('[registration] TURNSTILE_SECRET_KEY is not configured'); return res.status(500).json({ success: false, code: 'turnstile_not_configured', error: 'Registration is not configured.' }) }
  console.info('[registration] verifying Turnstile token')
  let turnstileResponse: Response
  try { turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: turnstileSecret, response: turnstileToken }) }) } catch { console.error('[registration] Turnstile request threw'); return res.status(502).json({ success: false, error: 'Verification service unavailable.' }) }
  if (!turnstileResponse.ok) { console.error('[registration] Turnstile returned HTTP error', { statusCode: turnstileResponse.status }); return res.status(502).json({ success: false, error: 'Verification service unavailable.' }) }
  const verification = await turnstileResponse.json() as { success?: boolean }
  if (!verification.success) { console.warn('[registration] Turnstile verification failed'); return res.status(403).json({ success: false, code: 'turnstile_failed', error: 'We could not verify this request.' }) }
  console.info('[registration] Turnstile verification passed')

  const apiKey = process.env.RESEND_API_KEY
  const hasApiKey = Boolean(apiKey && apiKey !== '<your-resend-api-key>')
  console.info('[registration] server key check', { configured: hasApiKey })
  if (!hasApiKey) return res.status(500).json({ success: false, error: 'Registration is not configured.' })
  const nameParts = name.split(/\s+/)
  const firstName = nameParts.shift() ?? ''
  const lastName = nameParts.join(' ')
  const resend = new Resend(process.env.RESEND_API_KEY!)
  let result: Awaited<ReturnType<typeof resend.contacts.create>>
  console.info('[registration] Resend contact create attempted')
  try { result = await resend.contacts.create({ email, firstName, lastName, unsubscribed: false }) } catch { console.error('[registration] Resend request threw'); return res.status(502).json({ success: false, error: 'Registration provider unavailable.' }) }
  if (result.error) {
    console.error('[registration] Resend returned an error', { statusCode: result.error.statusCode, name: result.error.name })
    const duplicate = result.error.statusCode === 409 || /already exists|already registered|duplicate/i.test(`${result.error.name} ${result.error.message}`)
    if (duplicate) return res.status(409).json({ success: false, code: 'duplicate', error: 'This email is already registered.' })
    return res.status(502).json({ success: false, error: 'Registration provider unavailable.' })
  }
  console.info('[registration] Resend contact created')
  return res.status(201).json({ success: true })
}
