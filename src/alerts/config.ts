/**
 * What the price alert sender needs from its environment, and the
 * "not configured" answer when any of it is missing.
 *
 * Both secrets live in GitHub Actions (Settings > Secrets and variables >
 * Actions) and reach the script as environment variables. Until the owner
 * adds them, the scheduled job reads this, prints one line and exits 0, so a
 * fresh clone, a fork or today's repository never fails a run or sends
 * anything. Secret values are never printed; only the names of missing ones.
 */

export const SECRET_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY'] as const;

export const DEFAULT_FROM = 'PriceSniffs <alerts@pricesniffs.space>';

export type AlertConfig =
  | { configured: false; missing: string[] }
  | {
      configured: true;
      serviceRoleKey: string;
      resendApiKey: string;
      from: string;
      dryRun: boolean;
    };

export function readAlertConfig(env: Record<string, string | undefined>): AlertConfig {
  const missing = SECRET_NAMES.filter((n) => !(env[n] ?? '').trim());
  if (missing.length > 0) return { configured: false, missing: [...missing] };
  return {
    configured: true,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    resendApiKey: env.RESEND_API_KEY!.trim(),
    from: (env.ALERTS_FROM ?? '').trim() || DEFAULT_FROM,
    // Anything but an explicit "false" is a dry run, so a local run or a
    // typo in the workflow never sends by accident.
    dryRun: (env.DRY_RUN ?? '').trim().toLowerCase() !== 'false',
  };
}

export function notConfiguredMessage(missing: readonly string[]): string {
  return `Price alerts not configured (missing ${missing.join(', ')}). Nothing sent.`;
}
