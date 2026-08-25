import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface AuthPlaceholderProps {
  mode: 'login' | 'signup';
}

const COPY = {
  login: { title: 'Log in', cta: 'Log In' },
  signup: { title: 'Get started', cta: 'Sign Up' },
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const AuthPlaceholder: React.FC<AuthPlaceholderProps> = ({ mode }) => {
  const { signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const copy = COPY[mode];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter a password.');
      return;
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      setSubmitting(true);
      const { error: signUpError, needsConfirmation } = await signUp(email, password);
      setSubmitting(false);

      if (signUpError) {
        setError(signUpError);
        return;
      }

      if (needsConfirmation) {
        setSuccessMessage('Account created — check your email to confirm it before logging in.');
      } else {
        navigate('/app');
      }
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);

    if (signInError) {
      setError(signInError);
      return;
    }

    navigate('/app');
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ backgroundColor: 'var(--bg-app)' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-md"
            style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }}
          >
            <Sparkles size={20} aria-hidden="true" />
          </span>

          <h1 className="mt-4 text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>
            {copy.title}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="auth-email" className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full text-sm"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full text-sm"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label
                htmlFor="auth-confirm-password"
                className="block text-xs font-semibold mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Confirm Password
              </label>
              <input
                id="auth-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full text-sm"
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <p className="text-sm" style={{ color: 'var(--status-danger)' }} role="alert">
              {error}
            </p>
          )}
          {successMessage && (
            <p className="text-sm" style={{ color: 'var(--primary-dark)' }} role="status">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary-dark)' }}
          >
            {submitting ? 'Please wait…' : copy.cta}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <Link to="/app" className="block text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            Continue without an account →
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AuthPlaceholder;
