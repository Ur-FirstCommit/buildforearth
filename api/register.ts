type RequestLike = { method?: string; body?: unknown }
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character) }

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).json({})
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  let body: unknown
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body } catch { return res.status(400).json({ message: 'Please provide valid JSON.' }) }
  const name = typeof (body as { name?: unknown })?.name === 'string' ? (body as { name: string }).name.trim() : ''
  const email = typeof (body as { email?: unknown })?.email === 'string' ? (body as { email: string }).email.trim().toLowerCase() : ''
  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Please provide a valid name and email.' })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey === '<your-resend-api-key>') return res.status(500).json({ message: 'Registration is not configured.' })
  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  let resend: Response
  try { resend = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Build for Earth <onboarding@resend.dev>', to: ['hello@firstcommit.xyz'], reply_to: email, subject: `New Build for Earth registration: ${name}`, html: `<h2>New Build for Earth registration</h2><p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p>` }) }) } catch { return res.status(502).json({ message: 'Registration provider unavailable.' }) }
  if (!resend.ok) return res.status(502).json({ message: 'Registration provider unavailable.' })
  return res.status(200).json({ ok: true })
}
