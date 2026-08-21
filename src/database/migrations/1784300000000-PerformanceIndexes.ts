import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds indexes to the hot query paths that were previously unindexed.
 *
 * All additive (CREATE INDEX IF NOT EXISTS) — no data change, safe to re-run.
 * Tables are small today so a plain (non-CONCURRENT) build is instant; if these
 * are ever added to already-large tables, prefer CREATE INDEX CONCURRENTLY run
 * outside a transaction instead.
 *
 * Covers:
 *  - orders: every foreign key + status (all list/filter queries + the escrow
 *    auto-release and stale-PAID sweep crons that scan by status).
 *  - order_status_history: lookups by order.
 *  - assignment_broadcasts: the every-minute expiry sweep (status, expires_at),
 *    per-order batches, and accept/decline lookups by target.
 *  - ledger tables: wallet history sorted by (wallet, created_at).
 *  - reps/vendors area_ids: GIN for the `@>` containment used by broadcast
 *    candidate scoring on every order.
 */
export class PerformanceIndexes1784300000000 implements MigrationInterface {
  name = 'PerformanceIndexes1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const stmts = [
      // ─── orders ─────────────────────────────────────────────────────────────
      `CREATE INDEX IF NOT EXISTS "idx_orders_customer_id" ON "orders" ("customer_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_orders_rep_id" ON "orders" ("rep_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_orders_vendor_id" ON "orders" ("vendor_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_orders_area_id" ON "orders" ("area_id")`,
      // (status, created_at) also serves plain status filters via the leftmost
      // prefix, and additionally the sweep crons' status + time-window scans.
      `CREATE INDEX IF NOT EXISTS "idx_orders_status_created_at" ON "orders" ("status", "created_at")`,

      // ─── order_status_history ───────────────────────────────────────────────
      `CREATE INDEX IF NOT EXISTS "idx_osh_order_id" ON "order_status_history" ("order_id")`,

      // ─── assignment_broadcasts ──────────────────────────────────────────────
      `CREATE INDEX IF NOT EXISTS "idx_ab_order_type" ON "assignment_broadcasts" ("order_id", "target_type")`,
      `CREATE INDEX IF NOT EXISTS "idx_ab_status_expires" ON "assignment_broadcasts" ("status", "expires_at")`,
      `CREATE INDEX IF NOT EXISTS "idx_ab_target" ON "assignment_broadcasts" ("target_id", "target_type")`,

      // ─── ledger tables (wallet history) ─────────────────────────────────────
      `CREATE INDEX IF NOT EXISTS "idx_ledger_wallet_created" ON "ledger_entries" ("wallet_id", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "idx_cle_wallet_created" ON "company_ledger_entries" ("company_wallet_id", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "idx_vle_wallet_created" ON "vendor_ledger_entries" ("wallet_id", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "idx_rple_wallet_created" ON "rep_pseudo_ledger_entries" ("wallet_id", "created_at")`,

      // ─── reps / vendors area_ids (JSONB containment for broadcast scoring) ───
      `CREATE INDEX IF NOT EXISTS "idx_reps_area_ids" ON "reps" USING GIN ("area_ids" jsonb_path_ops)`,
      `CREATE INDEX IF NOT EXISTS "idx_vendors_area_ids" ON "vendors" USING GIN ("area_ids" jsonb_path_ops)`,
    ];
    for (const sql of stmts) {
      await queryRunner.query(sql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const names = [
      'idx_orders_customer_id',
      'idx_orders_rep_id',
      'idx_orders_vendor_id',
      'idx_orders_area_id',
      'idx_orders_status',
      'idx_orders_status_created_at',
      'idx_osh_order_id',
      'idx_ab_order_type',
      'idx_ab_status_expires',
      'idx_ab_target',
      'idx_ledger_wallet_created',
      'idx_cle_wallet_created',
      'idx_vle_wallet_created',
      'idx_rple_wallet_created',
      'idx_reps_area_ids',
      'idx_vendors_area_ids',
    ];
    for (const n of names) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${n}"`);
    }
  }
}
