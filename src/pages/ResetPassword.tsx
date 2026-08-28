import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

type LinkStatus = 'checking' | 'ready' | 'invalid';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Clicking a valid Supabase recovery link makes the client parse the
  // token/code out of the URL and fires a PASSWORD_RECOVERY auth event —
  // that event, not the mere presence of a session, is the actual proof the
  // user arrived via a valid recovery link. A session can exist here for
  // unrelated reasons (e.g. the visitor was already logged in and simply
  // navigated to this URL directly), so an arbitrary existing session must
  // never be accepted as substitute proof.
  //
  // Supabase's URL parsing runs as soon as its client initializes, which can
  // race ahead of this component subscribing — this page is lazy-loaded, so
  // its own chunk may still be downloading while that parsing completes and
  // the event fires to nobody. To cover that race without weakening the
  // check above, look for the recovery marker Supabase itself appends to
  // the redirect URL (hash-based tokens carry `type=recovery`; the PKCE
  // code-exchange flow carries `code`, only ever sent to this route for a
  // recovery request) and, only when that marker is present, treat an
  // already-established session as confirmation the event already fired.
  useEffect(() => {
    let settled = false;

    const markReady = () => {
      if (!settled) {
        settled = true;
        setLinkStatus('ready');
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        markReady();
      }
    });

    const hasRecoveryMarker =
      window.location.hash.includes('type=recovery') ||
      new URLSearchParams(window.location.search).get('type') === 'recovery' ||
      new URLSearchParams(window.location.search).has('code');

    if (hasRecoveryMarker) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          markReady();
        }
      });
    }

    // Generous timeout: this only needs to fire for a genuinely invalid/
    // expired link. A short timeout risks rejecting a valid link just
    // because the recovery chunk or auth call was slow to load.
    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setLinkStatus('invalid');
      }
    }, 15000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      // The recovery link leaves the user in a temporary signed-in session —
      // sign them out so they return to login and authenticate fresh with
      // the new password, as requested.
      await supabase.auth.signOut();
      navigate('/login', { state: { justReset: true }, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
            Set a new password
          </h1>
        </div>

        {linkStatus === 'checking' && (
          <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Verifying your reset link…
          </p>
        )}

        {linkStatus === 'invalid' && (
          <div className="mt-6 space-y-4 text-center">
            <p className="text-sm" style={{ color: 'var(--status-danger)' }} role="alert">
              This password reset link is invalid or has expired.
            </p>
            <Link
              to="/login"
              className="inline-block rounded-md px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--primary-dark)' }}
            >
              Back to log in
            </Link>
          </div>
        )}

        {linkStatus === 'ready' && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="new-password" className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                New password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full text-sm"
                  style={{ paddingRight: '2.5rem' }}
                  autoComplete="new-password"
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

            <div>
              <label htmlFor="confirm-new-password" className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Confirm new password
              </label>
              <input
                id="confirm-new-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (error) setError(null);
                }}
                className="w-full text-sm"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: 'var(--status-danger)' }} role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: 'var(--primary-dark)' }}
            >
              {submitting ? 'Please wait…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
