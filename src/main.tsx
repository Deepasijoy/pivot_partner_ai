import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import './styles/theme.css'

// Code-split the authenticated app and auth placeholders out of the
// landing page's initial bundle — visitors hitting "/" for SEO/marketing
// shouldn't have to download the full dashboard.
const App = lazy(() => import('./App.tsx'))
const AuthPlaceholder = lazy(() => import('./pages/AuthPlaceholder.tsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.tsx'))

function RouteFallback() {
  return (
    <div
      className="flex min-h-screen items-center justify-center text-sm"
      style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-muted)' }}
    >
      Loading…
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app" element={<App />} />
            <Route path="/login" element={<AuthPlaceholder mode="login" />} />
            <Route path="/get-started" element={<AuthPlaceholder mode="signup" />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
