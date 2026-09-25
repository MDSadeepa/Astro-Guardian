import { useState } from 'react'
import LoginPage from './LoginPage'
import './App.css'

function App() {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('ag_token')
  )

  function handleLoginSuccess(receivedToken: string) {
    sessionStorage.setItem('ag_token', receivedToken)
    setToken(receivedToken)
  }

  function handleLogout() {
    sessionStorage.removeItem('ag_token')
    setToken(null)
  }

  if (!token) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <>
      <section id="center">
        <div>
          <h1>Welcome to Astro-Guardian 🚀</h1>
          <p>You are now signed in.</p>
        </div>
        <button type="button" className="counter" onClick={handleLogout}>
          Sign out
        </button>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
