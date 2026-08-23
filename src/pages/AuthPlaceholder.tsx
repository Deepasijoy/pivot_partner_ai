import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';

interface AuthPlaceholderProps {
  mode: 'login' | 'signup';
}

const COPY = {
  login: {
    title: 'Log in',
    body: "Account sign-in isn't live yet — we're finishing the core product experience first. In the meantime, you can explore PivotPartner's dashboard directly.",
  },
  signup: {
    title: 'Get started',
    body: "Account creation isn't live yet — we're finishing the core product experience first. In the meantime, you can explore PivotPartner's dashboard directly, no sign-up required.",
  },
};

const AuthPlaceholder: React.FC<AuthPlaceholderProps> = ({ mode }) => {
  const copy = COPY[mode];

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ backgroundColor: 'var(--bg-app)' }}
    >
      <div className="w-full max-w-sm text-center">
        <span
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-md"
          style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }}
        >
          <Sparkles size={20} aria-hidden="true" />
        </span>

        <h1 className="mt-4 text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>
          {copy.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {copy.body}
        </p>

        <Link
          to="/app"
          className="mt-6 inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--primary-dark)' }}
        >
          Preview the dashboard
        </Link>

        <div className="mt-4">
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
