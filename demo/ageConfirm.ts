import type { RegionId } from '../src/config/regions.js';

/**
 * "I am 18 or over" at sign up for Indian visitors (owner decision, 9 October
 * 2026; docs/INTERNATIONAL-PLAN.md section 5: the DPDP Act treats under 18s
 * specially). A required step in the form, nothing stored: no column, no
 * migration. The UK and US forms have no such box.
 */

export const AGE_CONFIRM_REGION: RegionId = 'IN';

/** Whether a sign up from this region must confirm the visitor is 18 or over. */
export function needsAgeConfirmation(pageRegion: RegionId, chosenRegion: RegionId | null): boolean {
  return pageRegion === AGE_CONFIRM_REGION || chosenRegion === AGE_CONFIRM_REGION;
}

export const AGE_CONFIRM_LABEL = 'I am 18 or over';
export const AGE_CONFIRM_ERROR_TITLE = 'Please Confirm Your Age';
export const AGE_CONFIRM_ERROR_MESSAGE = 'Accounts are for people aged 18 or over. Tick "I am 18 or over" to create yours.';

/** The checkbox, in the same markup as the account page's other checkbox. */
export function ageConfirmHtml(): string {
  return `
        <label class="control facet-check alerts-check age-check">
          <input type="checkbox" id="auth-age" aria-required="true" />
          <span class="facet-check-label">${AGE_CONFIRM_LABEL}</span>
        </label>`;
}
