import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Sparkles, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseClient';

interface AuthPlaceholderProps {
  mode: 'login' | 'signup';
}

const COPY = {
  login: { title: 'Log in', cta: 'Log In' },
  signup: { title: 'Get started', cta: 'Sign Up' },
};

// The recovery email link must always land on the deployed app, regardless
// of which origin the reset was requested from (e.g. a local dev server).
const PRODUCTION_APP_URL = 'https://pivot-partner-ai-2.onrender.com';
const RESET_PASSWORD_REDIRECT_URL = `${PRODUCTION_APP_URL}/reset-password`;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const AuthPlaceholder: React.FC<AuthPlaceholderProps> = ({ mode }) => {
  const { signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const copy = COPY[mode];

  const [view, setView] = useState<'credentials' | 'forgot'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    mode === 'login' && (location.state as { justReset?: boolean } | null)?.justReset
      ? 'Password updated. Log in with your new password.'
      : null
  );
  const [submitting, setSubmitting] = useState(false);

  // react-router writes navigation state into the browser's native history
  // entry, which (unlike component state) survives a hard refresh — so the
  // "justReset" flag would keep re-appearing on every reload of /login
  // unless it's cleared from that entry right after being read once.
  useEffect(() => {
    if (mode === 'login' && (location.state as { justReset?: boolean } | null)?.justReset) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearMessages = () => {
    if (error) setError(null);
    if (successMessage) setSuccessMessage(null);
  };

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
      try {
        const { error: signUpError, needsConfirmation } = await signUp(email, password);

        if (signUpError) {
          setError(signUpError);
          return;
        }

        if (needsConfirmation) {
          setSuccessMessage('Account created — check your email to confirm it before logging in.');
        } else {
          navigate('/app');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError);
        return;
      }

      navigate('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: RESET_PASSWORD_REDIRECT_URL,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSuccessMessage('If an account exists for that email, a password reset link is on its way.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const backToCredentials = () => {
    setView('credentials');
    setError(null);
    setSuccessMessage(null);
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
            {mode === 'login' && view === 'forgot' ? 'Reset password' : copy.title}
          </h1>
        </div>

        {mode === 'login' && view === 'forgot' ? (
          <form onSubmit={handleForgotSubmit} className="mt-6 space-y-4" noValidate>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Enter your account email and we'll send you a link to reset your password.
            </p>

            <div>
              <label htmlFor="forgot-email" className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearMessages();
                }}
                className="w-full text-sm"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

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
              {submitting ? 'Please wait…' : 'Send reset link'}
            </button>

            <button
              type="button"
              onClick={backToCredentials}
              className="block w-full text-center text-sm font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Back to log in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearMessages();
                }}
                className="w-full text-sm"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="auth-password" className="block text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setView('forgot');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-xs font-semibold"
                    style={{ color: 'var(--primary-dark)' }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearMessages();
                  }}
                  className="w-full text-sm"
                  style={{ paddingRight: '2.5rem' }}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  onMouseDown={(event) => event.preventDefault()}
                  className="absolute inset-y-0 right-0 flex items-center px-3"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
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
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    clearMessages();
                  }}
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
        )}

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
