import { describe, expect, it } from 'vitest';
import { authErrorMessage } from '../src/services/authErrors.js';

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
