/**
 * Pricing Engine type definitions.
 *
 * The engine is standalone — these types are the only contract between
 * the engine and the rest of the system. Adding new charge types only
 * requires extending PricingInputs and adding a new calculation step;
 * PricingResult shape never changes.
 */

// ─── Inputs ──────────────────────────────────────────────────────────────────

export type ServiceType = 'wash_fold' | 'wash_iron';
export type BagSize     = 'small' | 'medium' | 'large' | 'xl';

export interface SpecialItemInput {
  type: string;  // e.g. 'suit', 'agbada', 'duvet'
  qty:  number;
}

/** Core required inputs — always present */
export interface PricingInputsCore {
  serviceType:   ServiceType;
  bagSize:       BagSize;
  specialItems:  SpecialItemInput[];
  ironingCount:  number;           // 0 when serviceType = wash_fold
  areaId:        string;           // UUID; determines transport fee
}

/** Optional extensible inputs — new charge types added here */
export interface PricingInputsOptional {
  /** Future: promo code discount */
  promoCode?:           string;
  /** Future: same-day surcharge multiplier */
  isRushOrder?:         boolean;
  /** Future: premium garment insurance fee */
  insuranceRequested?:  boolean;
  /** Future: loyalty/membership discount */
  membershipLevel?:     string;
}

export type PricingInputs = PricingInputsCore & PricingInputsOptional;

// ─── Price config ─────────────────────────────────────────────────────────────

/** All price values the engine needs — loaded once before calculation */
export interface PricingConfig {
  bagPriceWP:          number;   // Active bag price for requested serviceType + bagSize
  specialItemPrices:   Record<string, number>;  // itemType → WP
  ironingUnitPriceWP:  number;
  serviceChargePercent: number;  // e.g. 5 = 5%
  transportFeeWP:      number;
  conversionRateId:    string;
  pointsPerUnit:       number;   // WP per ₦1 (for nairaEquivalent calc)
}

// ─── Output ───────────────────────────────────────────────────────────────────

export type LineItemCategory =
  | 'bag'
  | 'special_item'
  | 'ironing'
  | 'service_charge'
  | 'transport'
  | 'discount';   // reserved for future promo codes

export interface PricingLineItem {
  label:        string;
  category:     LineItemCategory;
  unitPriceWP:  number | null;
  qty:          number | null;
  subtotalWP:   number;
}

/** The canonical output of every PricingEngine.calculate() call */
export interface PricingResult {
  lineItems:              PricingLineItem[];
  subtotalWP:             number;   // sum before service charge and transport
  serviceChargeWP:        number;
  transportWP:            number;
  totalWP:                number;   // what the customer pays
  nairaEquivalent:        number;   // totalWP ÷ pointsPerUnit (display only, not stored)
  conversionRateId:       string;
  conversionRateSnapshot: number;   // pointsPerUnit at calculation time
  calculatedAt:           string;   // ISO 8601
}
