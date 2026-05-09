import {
  PricingConfig,
  PricingInputs,
  PricingLineItem,
  PricingResult,
} from './pricing.types';

/**
 * PricingEngine — standalone, stateless, versioned calculation module.
 *
 * Principles:
 *  1. No database access — all inputs are passed in as plain objects.
 *  2. Deterministic — same inputs + same config = same result.
 *  3. Extensible — new charge types are added as new inputs; output shape never changes.
 *  4. Testable in isolation (no DI, no decorators needed).
 *
 * The engine is called in two contexts:
 *  A. Real-time (client preview): front-end fetches PricingConfig once and calls a
 *     lightweight version locally (or via GET /pricing/config).
 *  B. Authoritative (server at order placement): POST /pricing/calculate — this result
 *     is locked into the order record and cannot be disputed.
 */
export class PricingEngine {
  /**
   * Calculate the full pricing breakdown for an order.
   *
   * @param inputs  - Order details (bag, items, ironing, area, optional flags)
   * @param config  - Pre-loaded platform price config (fetched by PricingService)
   * @returns       - Full PricingResult with itemised breakdown
   */
  static calculate(inputs: PricingInputs, config: PricingConfig): PricingResult {
    const lineItems: PricingLineItem[] = [];

    // ── 1. Bag base price ─────────────────────────────────────────────────────
    const bagLabel = `${this.capitalize(inputs.bagSize)} Bag — ${this.serviceLabel(inputs.serviceType)}`;
    lineItems.push({
      label:       bagLabel,
      category:    'bag',
      unitPriceWP: config.bagPriceWP,
      qty:         1,
      subtotalWP:  config.bagPriceWP,
    });

    // ── 2. Special items ──────────────────────────────────────────────────────
    for (const item of inputs.specialItems) {
      if (item.qty <= 0) continue;
      const unitPrice = config.specialItemPrices[item.type] ?? 0;
      if (unitPrice === 0) continue; // Unknown item — skip or could throw
      lineItems.push({
        label:       this.capitalize(item.type.replace(/_/g, ' ')),
        category:    'special_item',
        unitPriceWP: unitPrice,
        qty:         item.qty,
        subtotalWP:  unitPrice * item.qty,
      });
    }

    // ── 3. Ironing add-on ─────────────────────────────────────────────────────
    if (inputs.serviceType === 'wash_iron' && inputs.ironingCount > 0) {
      lineItems.push({
        label:       `Ironing (${inputs.ironingCount} item${inputs.ironingCount === 1 ? '' : 's'})`,
        category:    'ironing',
        unitPriceWP: config.ironingUnitPriceWP,
        qty:         inputs.ironingCount,
        subtotalWP:  config.ironingUnitPriceWP * inputs.ironingCount,
      });
    }

    // ── 4. Subtotal (before service charge and transport) ─────────────────────
    const subtotalWP = lineItems.reduce((sum, li) => sum + li.subtotalWP, 0);

    // ── 5. Service charge ─────────────────────────────────────────────────────
    const serviceChargeWP = Math.round(subtotalWP * (config.serviceChargePercent / 100));
    if (serviceChargeWP > 0) {
      lineItems.push({
        label:       `Service charge (${config.serviceChargePercent}%)`,
        category:    'service_charge',
        unitPriceWP: null,
        qty:         null,
        subtotalWP:  serviceChargeWP,
      });
    }

    // ── 6. VAT (applied on subtotal + service charge) ─────────────────────────
    const vatBase = subtotalWP + serviceChargeWP;
    const vatWP   = config.vatPercent > 0
      ? Math.round(vatBase * (config.vatPercent / 100))
      : 0;
    if (vatWP > 0) {
      lineItems.push({
        label:       `VAT (${config.vatPercent}%)`,
        category:    'service_charge',   // grouped under service_charge category
        unitPriceWP: null,
        qty:         null,
        subtotalWP:  vatWP,
      });
    }

    // ── 7. Transport fee ──────────────────────────────────────────────────────
    const transportWP = config.transportFeeWP;
    if (transportWP > 0) {
      lineItems.push({
        label:       `Transport`,
        category:    'transport',
        unitPriceWP: transportWP,
        qty:         1,
        subtotalWP:  transportWP,
      });
    }

    // ── 8. Future optional charges (placeholders) ─────────────────────────────
    // isRushOrder, insuranceRequested, promoCode, membershipLevel go here.
    // Each is a new named computation that appends a line item.

    // ── 9. Total ──────────────────────────────────────────────────────────────
    const totalWP = subtotalWP + serviceChargeWP + vatWP + transportWP;

    // ── 10. Naira equivalent (display only — not source of truth) ────────────
    // nairaEquivalent = totalWP ÷ pointsPerUnit
    const nairaEquivalent = config.pointsPerUnit > 0
      ? Math.round((totalWP / config.pointsPerUnit) * 100) / 100
      : 0;

    return {
      lineItems,
      subtotalWP,
      serviceChargeWP,
      vatWP,
      transportWP,
      totalWP,
      nairaEquivalent,
      conversionRateId:       config.conversionRateId,
      conversionRateSnapshot: config.pointsPerUnit,
      calculatedAt:           new Date().toISOString(),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private static serviceLabel(serviceType: string): string {
    return serviceType === 'wash_fold' ? 'Wash & Fold' : 'Wash & Iron';
  }
}
