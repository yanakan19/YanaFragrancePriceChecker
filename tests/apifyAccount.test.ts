import { describe, it, expect } from 'vitest';
import { describeApifyAccount, checkApifyAccount } from '../src/catalogue/apifyAccount.js';

const account = (over: Record<string, unknown> = {}) => ({
  data: {
    username: 'pricesniffs',
    plan: { id: 'STARTER' },
    proxy: { password: 'the-real-proxy-password', groups: [{ name: 'RESIDENTIAL' }, { name: 'SHADER' }] },
    ...over,
  },
});

describe('describeApifyAccount', () => {
  it('never prints either password, only whether they match', () => {
    const report = describeApifyAccount(account(), 'the-real-proxy-password');
    const text = report.lines.join('\n');
    expect(text).toContain('matches');
    expect(text).not.toContain('the-real-proxy-password');
  });

  it('says plainly when the configured proxy password is the wrong one', () => {
    const report = describeApifyAccount(account(), 'an-api-token-pasted-into-the-wrong-secret');
    const text = report.lines.join('\n');
    expect(text).toContain('does NOT match');
    // And still leaks neither value.
    expect(text).not.toContain('an-api-token-pasted-into-the-wrong-secret');
    expect(text).not.toContain('the-real-proxy-password');
  });

  it('names the plan and the proxy groups it actually includes', () => {
    const text = describeApifyAccount(account(), 'the-real-proxy-password').lines.join('\n');
    expect(text).toContain('plan STARTER');
    expect(text).toContain('RESIDENTIAL, SHADER');
  });

  it('calls out an account without RESIDENTIAL, which both tiers ask for by name', () => {
    const text = describeApifyAccount(
      account({ proxy: { password: 'p', groups: [{ name: 'DATACENTER' }] } }),
      'p',
    ).lines.join('\n');
    expect(text).toContain('RESIDENTIAL is NOT among them');
  });

  it('calls out an account with no proxy groups at all', () => {
    const text = describeApifyAccount(account({ proxy: { password: 'p', groups: [] } }), 'p').lines.join('\n');
    expect(text).toContain('none — the proxy tier cannot work on this plan');
  });

  it('distinguishes an unset proxy password from a wrong one', () => {
    const text = describeApifyAccount(account(), null).lines.join('\n');
    expect(text).toContain('is not set for this run');
    expect(text).not.toContain('does NOT match');
  });

  it('reports a payload with no account data rather than guessing', () => {
    expect(describeApifyAccount({}, 'p')).toEqual({
      ok: false,
      lines: ['Apify account check: response carried no account data'],
    });
  });
});

describe('checkApifyAccount', () => {
  it('asks the documented endpoint with the token', async () => {
    let asked = '';
    const fakeFetch = (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify(account()), { status: 200 });
    }) as unknown as typeof fetch;

    await checkApifyAccount('tok en', 'the-real-proxy-password', fakeFetch);
    expect(asked).toBe('https://api.apify.com/v2/users/me?token=tok%20en');
  });

  it('carries the API rejection back rather than throwing, so a harvest never dies on a diagnostic', async () => {
    const fakeFetch = (async () =>
      new Response('{"error":{"type":"token-not-found"}}', { status: 401 })) as unknown as typeof fetch;
    const report = await checkApifyAccount('bad', null, fakeFetch);
    expect(report.ok).toBe(false);
    expect(report.lines[0]).toContain('HTTP 401');
    expect(report.lines[0]).toContain('token-not-found');
  });

  it('survives a network failure', async () => {
    const fakeFetch = (async () => {
      throw new Error('connection reset');
    }) as unknown as typeof fetch;
    const report = await checkApifyAccount('tok', null, fakeFetch);
    expect(report.ok).toBe(false);
    expect(report.lines[0]).toContain('connection reset');
  });
});
