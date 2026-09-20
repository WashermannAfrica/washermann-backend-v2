import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 10 — Charge stack + ironing on platform_config.
 *
 * Adds the stackable charge stack (applied on top of an item's P70 base) and
 * the ironing surcharge percentage (Wash & Iron only). Backfills the existing
 * config row with default charges derived from the current discrete percentages.
 */
const DEFAULT_STACK = [
  { key: 'platform_margin',     label: 'Platform margin',     kind: 'percent', value: 25 },
  { key: 'service_charge',      label: 'Service charge',      kind: 'percent', value: 5 },
  { key: 'wash_rep_commission', label: 'Wash-rep commission', kind: 'percent', value: 15 },
  { key: 'vat',                 label: 'VAT',                 kind: 'percent', value: 7.5 },
];

export class Phase10ChargeStack1776180000000 implements MigrationInterface {
  name = 'Phase10ChargeStack1776180000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "charge_stack" jsonb NOT NULL DEFAULT '[]'`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "ironing_percent" decimal(5,2) NOT NULL DEFAULT 15`);
    // Backfill default stack onto any existing config row that has none.
    await queryRunner.query(
      `UPDATE "platform_config" SET "charge_stack" = $1::jsonb WHERE "charge_stack" = '[]'::jsonb`,
      [JSON.stringify(DEFAULT_STACK)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "ironing_percent"`);
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "charge_stack"`);
  }
}
