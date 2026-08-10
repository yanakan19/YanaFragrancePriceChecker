import { describe, expect, it } from 'vitest';
import { parseAwinFeedList, awinMerchantIdFromSignupUrl } from '../src/catalogue/awinFeedList.js';

/**
 * Fixture rows below use Awin's own documented example data (Fragrancedirect,
 * TheDrinkShop, etc. — see docs/Product Feed List Download) with the URL's
 * apikey replaced by a placeholder, never a real credential. This parser has
 * not been run against a real downloaded feed list — this sandbox cannot
 * reach ui.awin.com — so header matching is deliberately tolerant; see
 * src/catalogue/awinFeedList.ts's own doc comment.
 */

const HEADER = 'Advertiser ID,Advertiser Name,Primary Region,Membership Status,Feed ID,Feed Name,Language,Vertical,Last Imported,URL';

function row(over: Partial<Record<string, string>> = {}): string {
  const fields: Record<string, string> = {
    'Advertiser ID': '124166',
    'Advertiser Name': 'Fragrance Click UK',
    'Primary Region': 'GB',
    'Membership Status': 'Joined',
    'Feed ID': '124166',
    'Feed Name': 'Default',
    Language: 'English',
    Vertical: '',
    'Last Imported': '2026-08-11 06:00:00',
    URL: 'http://datafeed.api.productserve.com/datafeed/download/apikey/PLACEHOLDER/fid/124166/format/csv/',
    ...over,
  };
  return [
    fields['Advertiser ID'], fields['Advertiser Name'], fields['Primary Region'], fields['Membership Status'],
    fields['Feed ID'], fields['Feed Name'], fields.Language, fields.Vertical, fields['Last Imported'], fields.URL,
  ].join(',');
}

describe('parseAwinFeedList', () => {
  it('parses a well-formed feed list', () => {
    const csv = `${HEADER}\n${row()}`;
    const rows = parseAwinFeedList(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      advertiserId: '124166',
      advertiserName: 'Fragrance Click UK',
      lastImported: '2026-08-11 06:00:00',
      url: 'http://datafeed.api.productserve.com/datafeed/download/apikey/PLACEHOLDER/fid/124166/format/csv/',
    });
  });

  it('matches headers case and spacing insensitively, not just Awin\'s documented Title Case', () => {
    const lowerHeader = HEADER.toLowerCase().replace(/ /g, '_');
    const csv = `${lowerHeader}\n${row()}`;
    const rows = parseAwinFeedList(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.advertiserId).toBe('124166');
  });

  it('parses multiple rows, one per feed', () => {
    const csv = [
      HEADER,
      row({ 'Advertiser ID': '9', 'Advertiser Name': 'Fragrancedirect' }),
      row({ 'Advertiser ID': '61', 'Advertiser Name': 'TheDrinkShop' }),
    ].join('\n');
    const rows = parseAwinFeedList(csv);
    expect(rows.map((r) => r.advertiserId)).toEqual(['9', '61']);
  });

  it('skips a row with no advertiser id or no url rather than guessing', () => {
    const csv = [HEADER, row({ 'Advertiser ID': '' }), row({ URL: '' })].join('\n');
    expect(parseAwinFeedList(csv)).toHaveLength(0);
  });

  it('returns nothing for an empty file', () => {
    expect(parseAwinFeedList('')).toEqual([]);
  });

  it('returns nothing when the required columns are entirely absent', () => {
    const csv = 'Feed Name,Language\nDefault,English';
    expect(parseAwinFeedList(csv)).toEqual([]);
  });
});

describe('awinMerchantIdFromSignupUrl', () => {
  it('extracts the numeric merchant id from a merchant-profile URL', () => {
    expect(awinMerchantIdFromSignupUrl('https://ui.awin.com/merchant-profile/124166')).toBe('124166');
  });

  it('returns null for a non-Awin or malformed URL', () => {
    expect(awinMerchantIdFromSignupUrl('https://example.com/not-awin')).toBeNull();
    expect(awinMerchantIdFromSignupUrl(null)).toBeNull();
  });
});
