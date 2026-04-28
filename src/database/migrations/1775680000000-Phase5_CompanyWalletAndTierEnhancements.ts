import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase5CompanyWalletAndTierEnhancements1775680000000 implements MigrationInterface {
  name = 'Phase5CompanyWalletAndTierEnhancements1775680000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Tier: rename monthly_points → points_per_cycle ───────────────────────
    await queryRunner.query(`
      ALTER TABLE "tiers"
      RENAME COLUMN "monthly_points" TO "points_per_cycle"
    `);

    // ── 2. Tier: change points_per_cycle to bigint and set default ───────────────
    await queryRunner.query(`
      ALTER TABLE "tiers"
      ALTER COLUMN "points_per_cycle" TYPE bigint USING "points_per_cycle"::bigint,
      ALTER COLUMN "points_per_cycle" SET DEFAULT 0
    `);

    // ── 3. Tier: add duration column ─────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "tiers"
      ADD COLUMN "duration" varchar(20) NOT NULL DEFAULT 'monthly'
    `);

    // ── 4. Tier: add spending_cap_per_cycle column ───────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "tiers"
      ADD COLUMN "spending_cap_per_cycle" bigint NOT NULL DEFAULT 0
    `);

    // ── 5. Tier: add pending_changes column ──────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "tiers"
      ADD COLUMN "pending_changes" jsonb NULL
    `);

    // ── 6. Tier: add pending_effective_from column ───────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "tiers"
      ADD COLUMN "pending_effective_from" timestamp NULL
    `);

    // ── 7. CompanyEmployee: add tracking_id ──────────────────────────────────────
    // First add as nullable
    await queryRunner.query(`
      ALTER TABLE "company_employees"
      ADD COLUMN "tracking_id" varchar(20) NULL
    `);

    // Backfill existing rows with generated IDs
    await queryRunner.query(`
      UPDATE company_employees
      SET tracking_id = 'WM-EMP-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 6))
      WHERE tracking_id IS NULL
    `);

    // Set NOT NULL and add unique constraint
    await queryRunner.query(`
      ALTER TABLE "company_employees"
      ALTER COLUMN "tracking_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "company_employees"
      ADD CONSTRAINT "UQ_company_employees_tracking_id" UNIQUE ("tracking_id")
    `);

    // ── 8. Companies: add awaiting_approval to activation_status enum ────────────
    // For varchar columns we don't need to alter enum type — just ensure the value is valid
    // The activation_status column is varchar(50) so this is already supported

    // ── 9. Create company_wallets table ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "company_wallet_status_enum" AS ENUM ('active', 'frozen')
    `);

    await queryRunner.query(`
      CREATE TABLE "company_wallets" (
        "id"          uuid                NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  timestamp           NOT NULL DEFAULT now(),
        "updated_at"  timestamp           NOT NULL DEFAULT now(),
        "company_id"  uuid                NOT NULL,
        "wp_balance"  bigint              NOT NULL DEFAULT 0,
        "status"      "company_wallet_status_enum" NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_company_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_company_wallets_company_id" UNIQUE ("company_id"),
        CONSTRAINT "FK_company_wallets_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    // ── 10. Create company_ledger_entries table ───────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "company_ledger_type_enum" AS ENUM ('credit', 'debit')
    `);

    await queryRunner.query(`
      CREATE TYPE "company_ledger_source_enum" AS ENUM (
        'topup',
        'benefit_allocation',
        'benefit_return',
        'gift_card_creation',
        'gift_card_revocation',
        'admin_credit',
        'admin_debit'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "company_ledger_entries" (
        "id"                  uuid                          NOT NULL DEFAULT uuid_generate_v4(),
        "company_wallet_id"   uuid                          NOT NULL,
        "company_id"          uuid                          NOT NULL,
        "type"                "company_ledger_type_enum"    NOT NULL,
        "amount"              bigint                        NOT NULL,
        "balance_before"      bigint                        NOT NULL,
        "balance_after"       bigint                        NOT NULL,
        "source"              "company_ledger_source_enum"  NOT NULL,
        "fiat_amount_kobo"    bigint                        NULL,
        "reference"           varchar(40)                   NOT NULL,
        "description"         text                          NULL,
        "metadata"            jsonb                         NULL,
        "created_at"          timestamp                     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_company_ledger_entries_wallet"
          FOREIGN KEY ("company_wallet_id") REFERENCES "company_wallets"("id") ON DELETE CASCADE
      )
    `);

    // Index for fast per-company and per-wallet queries
    await queryRunner.query(`
      CREATE INDEX "IDX_company_ledger_entries_company_id" ON "company_ledger_entries" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_company_ledger_entries_wallet_id" ON "company_ledger_entries" ("company_wallet_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_company_ledger_entries_created_at" ON "company_ledger_entries" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop company_ledger_entries
    await queryRunner.query(`DROP TABLE IF EXISTS "company_ledger_entries"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "company_ledger_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "company_ledger_type_enum"`);

    // Drop company_wallets
    await queryRunner.query(`DROP TABLE IF EXISTS "company_wallets"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "company_wallet_status_enum"`);

    // Revert company_employees tracking_id
    await queryRunner.query(`ALTER TABLE "company_employees" DROP CONSTRAINT IF EXISTS "UQ_company_employees_tracking_id"`);
    await queryRunner.query(`ALTER TABLE "company_employees" DROP COLUMN IF EXISTS "tracking_id"`);

    // Revert tier columns
    await queryRunner.query(`ALTER TABLE "tiers" DROP COLUMN IF EXISTS "pending_effective_from"`);
    await queryRunner.query(`ALTER TABLE "tiers" DROP COLUMN IF EXISTS "pending_changes"`);
    await queryRunner.query(`ALTER TABLE "tiers" DROP COLUMN IF EXISTS "spending_cap_per_cycle"`);
    await queryRunner.query(`ALTER TABLE "tiers" DROP COLUMN IF EXISTS "duration"`);
    await queryRunner.query(`ALTER TABLE "tiers" RENAME COLUMN "points_per_cycle" TO "monthly_points"`);
    await queryRunner.query(`ALTER TABLE "tiers" ALTER COLUMN "monthly_points" TYPE int USING "monthly_points"::int`);
  }
}
