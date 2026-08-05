export type {
  Retailer,
  RetailerTier,
  AdapterStrategy,
  AffiliateNetwork,
  AffiliateConfig,
  ShippingRule,
} from './types/retailer.js';
export type {
  RawOffer,
  PresentedOffer,
  StockState,
  DiscountDisplay,
  DeliveryDisplay,
} from './types/offer.js';

export { RETAILERS, getRetailer, enabledRetailers, retailersForTier, cannotCarryBrand } from './config/retailers.js';
export {
  TIKTOK_SELLERS,
  TIKTOK_BETA_CONFIG,
  visibleTikTokSellers,
} from './config/tiktokSellers.js';
export type { TikTokSeller } from './config/tiktokSellers.js';

export { resolveDelivery, deliveredPrice } from './services/shipping.js';
export { buildDiscount, canShowCountdown } from './services/discount.js';
export { buildOutboundLink, pendingAffiliateSetup, hasAffiliateGaps } from './services/affiliate.js';
export type { AffiliateGap, OutboundLink } from './services/affiliate.js';
export {
  buildComparison,
  presentOffer,
  purchasableOffers,
  outOfStockOffers,
  bestOffer,
  isPurchasable,
} from './services/priceService.js';
export type { ComparisonOptions, SortKey } from './services/priceService.js';
export { formatGbp, roundPence } from './services/money.js';
