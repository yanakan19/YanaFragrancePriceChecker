import type { BrowserContext } from 'playwright';

/**
 * A signed in reader for browser tests, without a real Supabase.
 *
 * Nothing in the app is changed for this: the page runs its real Supabase
 * client against a stored session (the same local storage entry the library
 * writes on a real sign in) and every request it makes to the project is
 * answered here instead of by the network. So the account menu, the three
 * account pages and the wishlist are driven exactly as they would be for a
 * real account, and a test can never reach, read or write the live project.
 *
 * The project ref is read from demo/supabase.ts's URL so the storage key
 * matches what the library looks for.
 */
export const SUPABASE_HOST = 'https://kemjyocklbkgjsyfdqtf.supabase.co';
const STORAGE_KEY = 'sb-kemjyocklbkgjsyfdqtf-auth-token';

export interface FakeAccount {
  email: string;
  createdAt: string;
  wishlist: { fragrance_id: string; target_price_gbp: number | null; added_at: string }[];
  priceAlerts: boolean;
}

function fakeUser(a: FakeAccount) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: a.email,
    email_confirmed_at: a.createdAt,
    confirmed_at: a.createdAt,
    created_at: a.createdAt,
    updated_at: a.createdAt,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
  };
}

function fakeSession(a: FakeAccount) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'test-refresh-token',
    user: fakeUser(a),
  };
}

/**
 * Answers every request to the project. Signed out when `account` is null.
 *
 * `signInAs`, with `account` null, starts signed out and lets the sign in
 * form succeed as that account: the password grant answers with a session
 * and from then on the project answers as that reader, which is how a test
 * watches a signed out visit turn into the page it asked for.
 */
export async function stubSupabase(
  context: BrowserContext,
  initial: FakeAccount | null,
  signInAs: FakeAccount | null = null,
): Promise<void> {
  let account = initial;
  if (account) {
    const session = fakeSession(account);
    await context.addInitScript(
      ([key, value]: [string, string]) => {
        try {
          (globalThis as { localStorage?: { setItem(k: string, v: string): void } }).localStorage?.setItem(key, value);
        } catch {
          /* storage unavailable: the test will see a signed out page */
        }
      },
      [STORAGE_KEY, JSON.stringify(session)] as [string, string],
    );
  }

  await context.route(`${SUPABASE_HOST}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname === '/auth/v1/user') {
      return account ? json(200, fakeUser(account)) : json(401, { message: 'no session' });
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && signInAs) {
      account = signInAs;
      return json(200, fakeSession(signInAs));
    }
    if (url.pathname === '/auth/v1/logout') {
      account = null;
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname.startsWith('/auth/v1/')) return json(400, { message: 'not stubbed' });

    if (url.pathname === '/rest/v1/wishlists') {
      if (req.method() === 'GET') return json(200, account?.wishlist ?? []);
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname === '/rest/v1/profiles') {
      if (req.method() === 'GET') {
        const accept = req.headers()['accept'] ?? '';
        const row = { price_alerts: account?.priceAlerts ?? false };
        return json(200, accept.includes('vnd.pgrst.object') ? row : [row]);
      }
      return route.fulfill({ status: 204, body: '' });
    }
    return json(404, { message: 'not stubbed' });
  });
}
