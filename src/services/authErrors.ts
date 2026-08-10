/**
 * Supabase's own error text is written for a developer, not a reader, and
 * some of it actively invites user enumeration — "User already registered"
 * on signup confirms an address has an account before its owner has proven
 * they control it. Every message a reader can see goes through this map
 * instead, deliberately vague where vagueness is the safe answer, specific
 * only where specificity cannot leak anything (weak password, malformed
 * email, rate limiting).
 *
 * Kept DOM-free and in src/ rather than demo/auth.ts itself so it can be
 * unit tested through the ordinary tsconfig — demo/ carries `window` and a
 * DOM lib the rest of this project deliberately does not.
 */
export function authErrorMessage(raw: string, context: 'signUp' | 'signIn' | 'reset'): string {
  const s = raw.toLowerCase();
  if (s.includes('already registered') || s.includes('already exists')) {
    // Do not confirm the account exists. Same wording a genuine new signup
    // sees, so the response looks identical either way.
    return 'Check your email to finish setting up your account. If you already have one, use Sign in instead.';
  }
  if (s.includes('invalid login credentials')) {
    return 'That email and password combination is not recognised.';
  }
  if (s.includes('email not confirmed')) {
    return 'Please verify your email before signing in. Check your inbox for the link, or request a new one below.';
  }
  if (s.includes('password') && (s.includes('short') || s.includes('weak') || s.includes('at least'))) {
    return 'Choose a password with at least 8 characters.';
  }
  if (s.includes('rate limit') || s.includes('too many')) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (s.includes('invalid') && s.includes('email')) {
    return 'That does not look like a valid email address.';
  }
  if (context === 'reset') {
    // Password reset must never confirm or deny an address exists either.
    return 'If that address has an account, a reset link is on its way.';
  }
  return 'Something went wrong. Please try again.';
}
