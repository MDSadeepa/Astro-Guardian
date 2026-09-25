import { useState, type FormEvent } from 'react'
import './LoginPage.css'

interface LoginResponse {
  success: boolean
  message: string
  token?: string
}

interface LoginPageProps {
  onLoginSuccess: (token: string) => void
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data: LoginResponse = await res.json()

      if (data.success && data.token) {
        onLoginSuccess(data.token)
      } else {
        setError(data.message || 'Login failed.')
      }
    } catch {
      setError('Unable to reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <svg className="login-logo" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
            <path d="M20 8 L20 20 L28 28" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <circle cx="20" cy="20" r="3" fill="var(--accent)" />
          </svg>
          <h1 className="login-title">Astro-Guardian</h1>
          <p className="login-subtitle">Sign in to your account</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="admin@astro-guardian.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-hint">
          Demo credentials: <code>admin@astro-guardian.com</code> / <code>password123</code>
        </p>
      </div>
    </div>
  )
}
