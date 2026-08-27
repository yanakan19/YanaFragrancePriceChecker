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
/**
 * The one distinction a caller needs to act on rather than merely display.
 *
 * "Email not confirmed" on sign in is not a dead end — it is a reader who has
 * an account and needs the verification link resent, and the message
 * authErrorMessage returns for it says as much ("request a new one below").
 * That sentence was pointing at nothing: the resend control only ever
 * rendered for someone holding a session, and Supabase issues no session on a
 * sign in it rejects. Classifying it here lets demo/app.ts put the reader on
 * the verification screen, where the resend button actually is.
 *
 * Deliberately the narrowest possible classification. Everything else is
 * 'other' and stays a plain message, because every other distinction Supabase
 * draws here is one this site should not repeat back to a reader — telling
 * them which of the email and the password was wrong is exactly the user
 * enumeration authErrorMessage exists to refuse.
 */
export type AuthFailureReason = 'unverified' | 'other';

export function authFailureReason(raw: string): AuthFailureReason {
  return raw.toLowerCase().includes('email not confirmed') ? 'unverified' : 'other';
}

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

/**
 * Turns a failed *URL callback* — the tab that just followed a confirmation,
 * magic, or password recovery link back in — into an honest sentence.
 *
 * This is a different moment from everything above it in this file: those
 * functions cover a reader typing into a form and getting a response back.
 * This one covers a reader who clicked a link, landed back on the site, and
 * whose session never appeared — a failure with no form to show it against,
 * which is exactly how it used to go unnoticed. See demo/auth.ts's
 * `checkEmailLinkCallback` for where this is called and why nothing called
 * anything like it before.
 *
 * Deliberately keyed on the auth-js *error class name*, not on Supabase's
 * free-text `message` (unlike authErrorMessage's raw-string matching above).
 * The two failure modes this distinguishes are named, documented classes in
 * `@supabase/auth-js` — `AuthPKCEGrantCodeExchangeError` and
 * `AuthPKCECodeVerifierMissingError`, whose own source comment reads "This
 * typically happens when the auth flow was initiated in a different browser,
 * device, or the storage was cleared" — so matching on the name is matching
 * on something the library itself defines and keeps stable, not on wording
 * that could change under this project without notice.
 *
 * No enumeration concern here, unlike the sign in/sign up messages above: a
 * broken confirmation link says nothing about whether an email address has
 * an account, only that the specific link just clicked did not produce a
 * session. It is safe, and more honest, to be specific about *why*.
 */
export function authCallbackErrorMessage(errorName: string): string {
  if (errorName === 'AuthPKCEGrantCodeExchangeError' || errorName === 'AuthPKCECodeVerifierMissingError') {
    // Kept even though this project's client is configured for the implicit
    // flow (see demo/supabase.ts), where this pair cannot fire today: it is
    // the one message that names the actual cause rather than a generic
    // retry, and costs nothing to leave in place against a future change to
    // that configuration.
    return 'This link only works in the browser you signed up in. Open it there, or sign in and request a new one.';
  }
  // Every other callback failure (AuthImplicitGrantRedirectError covers an
  // expired link, an already-used link, and a link Supabase itself rejected
  // with an error in the redirect) shares one honest, always-true remedy:
  // the link in hand did not work, and a new one will.
  return 'That confirmation link did not work. It may have expired or already been used — request a new one from the sign in page.';
}
