/**
 * Email sending, behind one small interface so the provider can be swapped
 * (Postmark, SES, an SMTP relay) by writing one more function like
 * `resendProvider` and changing one line in scripts/price-alerts.ts.
 *
 * Nothing here logs. A failure comes back as a short reason that never
 * includes the recipient address or the API key; the caller decides what to
 * print.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Shown to mail clients as the List-Unsubscribe header. */
  unsubscribeUrl: string;
  /** Same key on a retry means the provider sends it once (where supported). */
  idempotencyKey: string;
}

export type SendResult = { ok: true } | { ok: false; reason: string };

export interface EmailProvider {
  readonly name: string;
  send(email: OutgoingEmail): Promise<SendResult>;
}

/** The subset of fetch this file uses, so tests can pass a fake. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface ResendOptions {
  apiKey: string;
  /** e.g. "PriceSniffs <alerts@pricesniffs.space>". The domain must be verified in Resend. */
  from: string;
  /** Where a reply goes; the alerts address itself has no inbox. */
  replyTo?: string;
  fetch?: FetchLike;
}

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * Free tier: 100 emails a day, 3,000 a month, a few requests a second.
 */
export function resendProvider({ apiKey, from, replyTo, fetch: fetchImpl }: ResendOptions): EmailProvider {
  const doFetch: FetchLike = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  return {
    name: 'Resend',
    async send(email) {
      const body: Record<string, unknown> = {
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: { 'List-Unsubscribe': `<${email.unsubscribeUrl}>` },
      };
      if (replyTo) body.reply_to = replyTo;
      let res;
      try {
        res = await doFetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': email.idempotencyKey,
          },
          body: JSON.stringify(body),
        });
      } catch {
        return { ok: false, reason: 'network error' };
      }
      if (res.ok) return { ok: true };
      // Resend's error body is {name, message}. Only the name is kept: the
      // message can quote the request, and the request holds an address.
      let name = '';
      try {
        const parsed = JSON.parse(await res.text()) as { name?: unknown };
        if (typeof parsed.name === 'string') name = parsed.name.replace(/[^a-z_]/gi, '').slice(0, 60);
      } catch {
        /* not JSON; the status alone will do */
      }
      return { ok: false, reason: `HTTP ${res.status}${name ? ` ${name}` : ''}` };
    },
  };
}
