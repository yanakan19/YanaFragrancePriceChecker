import { describe, expect, it } from 'vitest';
import { authCallbackErrorMessage, authErrorMessage, authFailureReason } from '../src/services/authErrors.js';

describe('authErrorMessage', () => {
  it('never confirms an address already has an account on signup', () => {
    const msg = authErrorMessage('User already registered', 'signUp');
    expect(msg.toLowerCase()).not.toContain('already registered');
    expect(msg.toLowerCase()).not.toContain('already exists');
    expect(msg).toContain('Check your email');
  });

  it('never confirms or denies an address exists on password reset', () => {
    const msg = authErrorMessage('some odd unexpected message', 'reset');
    expect(msg).toBe('If that address has an account, a reset link is on its way.');
  });

  it('gives a plain, honest reason for a bad sign in without saying which field was wrong', () => {
    const msg = authErrorMessage('Invalid login credentials', 'signIn');
    expect(msg).not.toMatch(/wrong password|no account|not found|unknown email/i);
  });

  it('tells the reader to verify before signing in, distinctly from a wrong password', () => {
    const msg = authErrorMessage('Email not confirmed', 'signIn');
    expect(msg).toContain('verify your email');
  });

  it('surfaces a weak password as a concrete, actionable message', () => {
    expect(authErrorMessage('Password should be at least 8 characters', 'signUp')).toContain('8 characters');
  });

  it('surfaces rate limiting rather than hiding it behind a generic error', () => {
    expect(authErrorMessage('email rate limit exceeded', 'signUp')).toContain('Too many attempts');
  });

  it('falls back to a generic message for anything unrecognised', () => {
    expect(authErrorMessage('some brand new supabase error string', 'signIn')).toBe('Something went wrong. Please try again.');
  });
});

describe('authFailureReason', () => {
  it('recognises an unconfirmed address, whatever case Supabase sends it in', () => {
    // This is what routes the reader to the screen the Resend button is on,
    // rather than leaving them at a message pointing at a control that was
    // never rendered for them.
    expect(authFailureReason('Email not confirmed')).toBe('unverified');
    expect(authFailureReason('email not confirmed')).toBe('unverified');
  });

  it('does not classify a wrong password as anything actionable', () => {
    // A bad sign in must stay indistinguishable from a sign in against an
    // address with no account. Anything that told the two apart here would
    // hand back the user enumeration authErrorMessage exists to refuse.
    expect(authFailureReason('Invalid login credentials')).toBe('other');
  });

  it('classifies everything else as other rather than guessing', () => {
    expect(authFailureReason('User already registered')).toBe('other');
    expect(authFailureReason('email rate limit exceeded')).toBe('other');
    expect(authFailureReason('some brand new supabase error string')).toBe('other');
    expect(authFailureReason('')).toBe('other');
  });
});

/**
 * The other half of the accounts audit fix: what a reader sees when the tab
 * that just followed an email link back in did not get a session. See
 * demo/supabase.ts's flowType comment for why the client is pinned to the
 * 'implicit' flow, and demo/auth.ts's checkEmailLinkCallback for where this
 * is actually called — nothing did before.
 */
describe('authCallbackErrorMessage', () => {
  it('names the cross-browser cause for the two PKCE error classes auth-js defines for it', () => {
    // Real class names from @supabase/auth-js's errors.ts — not free text —
    // so this stays correct even if Supabase reworded its own message.
    for (const name of ['AuthPKCEGrantCodeExchangeError', 'AuthPKCECodeVerifierMissingError']) {
      const msg = authCallbackErrorMessage(name);
      expect(msg).toContain('browser you signed up in');
    }
  });

  it('gives an honest, generic remedy for every other callback failure', () => {
    // AuthImplicitGrantRedirectError covers an expired link, an already-used
    // link, and anything Supabase itself rejected with an error in the
    // redirect — none of which this function can tell apart from the error
    // class alone, so it must not claim a specific cause it cannot verify.
    const msg = authCallbackErrorMessage('AuthImplicitGrantRedirectError');
    expect(msg).toMatch(/expired|already been used/i);
    expect(msg).not.toContain('browser you signed up in');
  });

  it('never leaves a reader with nothing to do next', () => {
    for (const name of ['AuthPKCEGrantCodeExchangeError', 'AuthImplicitGrantRedirectError', 'SomeFutureErrorClass']) {
      const msg = authCallbackErrorMessage(name);
      expect(msg.length).toBeGreaterThan(0);
      // Every branch points at a concrete next step: open it in the right
      // browser, or get a new link.
      expect(msg).toMatch(/open it|request a new one/i);
    }
  });

  it('falls back to the generic message for an error class it does not recognise', () => {
    // A future auth-js version could add new callback error classes this
    // function has never heard of. Silence or a thrown error would both be
    // worse than the same honest, always-true remedy every other unrecognised
    // callback failure already gets.
    expect(authCallbackErrorMessage('SomeFutureErrorClass')).toBe(authCallbackErrorMessage('AuthImplicitGrantRedirectError'));
  });
});
