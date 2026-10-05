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

export interface FakePhotoFile {
  contentType: string;
  body: Buffer;
}

export interface FakeAccount {
  email: string;
  createdAt: string;
  wishlist: { fragrance_id: string; target_price_gbp: number | null; added_at: string; saved_price_gbp?: number | null }[];
  priceAlerts: boolean;
  /**
   * Profile photos (migration 0006). Left out, or `enabled: false`, is a
   * project where the owner has not run it yet: the switch function is
   * missing and the bucket answers nothing. `file` is the stored photo, and
   * the stub writes to it when the page uploads or removes one, so a test
   * can read back exactly what the browser sent. Every file here is made by
   * the test itself; nothing real is ever uploaded anywhere.
   */
  photo?: { enabled: boolean; file: FakePhotoFile | null };
  /** Filled by the stub, in order: each write the page made, for tests that check order. */
  writes?: string[];
}

/** The one object path a reader may hold, the same rule as the migration. */
export const FAKE_USER_ID = '00000000-0000-4000-8000-000000000001';
const AVATAR_PATH = `${FAKE_USER_ID}/avatar`;

/** The image part of a multipart upload body, as storage-js sends a Blob. */
function multipartImage(body: Buffer): FakePhotoFile | null {
  const text = body.toString('latin1');
  const m = /Content-Type: (image\/[a-z+.-]+)\r\n\r\n/i.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = text.indexOf('\r\n--', start);
  return { contentType: m[1]!.toLowerCase(), body: body.subarray(start, end < 0 ? undefined : end) };
}

function fakeUser(a: FakeAccount) {
  return {
    id: FAKE_USER_ID,
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
        const row = { price_alerts: account?.priceAlerts ?? false, avatar_path: account?.photo?.file ? AVATAR_PATH : null };
        return json(200, accept.includes('vnd.pgrst.object') ? row : [row]);
      }
      account?.writes?.push(`profiles ${req.postData() ?? ''}`);
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname === '/rest/v1/rpc/delete_own_account') {
      account?.writes?.push('rpc delete_own_account');
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname === '/rest/v1/rpc/profile_photos_enabled') {
      if (account?.photo?.enabled) return json(200, true);
      return json(404, { code: 'PGRST202', message: 'Could not find the function public.profile_photos_enabled without parameters in the schema cache' });
    }

    // Storage. A bucket that does not exist yet answers as Supabase does.
    if (url.pathname.startsWith('/storage/v1/')) {
      const photo = account?.photo;
      if (!photo?.enabled) return json(400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
      const object = `/storage/v1/object/avatars/${AVATAR_PATH}`;
      if (url.pathname === object && req.method() === 'GET') {
        if (!photo.file) return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        return route.fulfill({ status: 200, contentType: photo.file.contentType, body: photo.file.body });
      }
      if (url.pathname === object && (req.method() === 'POST' || req.method() === 'PUT')) {
        const file = multipartImage(req.postDataBuffer() ?? Buffer.alloc(0));
        if (!file) return json(400, { statusCode: '400', error: 'invalid', message: 'No file' });
        photo.file = file;
        account?.writes?.push(`storage upload ${file.contentType}`);
        return json(200, { Id: 'fake-object', Key: `avatars/${AVATAR_PATH}` });
      }
      if (url.pathname === '/storage/v1/object/avatars' && req.method() === 'DELETE') {
        const prefixes = (JSON.parse(req.postData() ?? '{}') as { prefixes?: string[] }).prefixes ?? [];
        account?.writes?.push(`storage remove ${prefixes.join(',')}`);
        const had = photo.file && prefixes.includes(AVATAR_PATH);
        if (prefixes.includes(AVATAR_PATH)) photo.file = null;
        return json(200, had ? [{ name: AVATAR_PATH }] : []);
      }
      return json(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    }
    return json(404, { message: 'not stubbed' });
  });
}
