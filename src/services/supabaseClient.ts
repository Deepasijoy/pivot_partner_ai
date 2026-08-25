import { createClient } from '@supabase/supabase-js';

// Client-safe values only — never the service_role/secret key. Supabase's
// newer projects label this the "publishable key" (VITE_SUPABASE_PUBLISHABLE_KEY);
// older docs/projects call it the "anon key" (VITE_SUPABASE_ANON_KEY). This
// project's .env uses the newer name, so that's read first, with the older
// name as a fallback in case it's ever configured that way instead.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  // Non-fatal — /app must keep working even if auth isn't configured.
  // Actual auth calls will surface a clear error instead of the whole app
  // failing to load.
  console.error(
    'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '');
