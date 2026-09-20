import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase3FinancialFoundation1775490000000 implements MigrationInterface {
  name = 'Phase3FinancialFoundation1775490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── conversion_rates ───────────────────────────────────────────────────────
    // Append-only; no UPDATE/DELETE. Active rate = most recent effective_from <= NOW().
    await queryRunner.query(`
      CREATE TABLE "conversion_rates" (
        "id"              UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "currency"        VARCHAR(10) NOT NULL,
        "points_per_unit" DECIMAL(10,4) NOT NULL,
        "effective_from"  TIMESTAMPTZ NOT NULL,
        "created_by"      UUID        REFERENCES "users"("id") ON DELETE SET NULL,
        "notes"           VARCHAR(500),
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversion_rates" PRIMARY KEY ("id")
      )
    `);

    // Index: fast "current rate" lookups per currency
    await queryRunner.query(`
      CREATE INDEX "IDX_conversion_rates_currency_effective"
        ON "conversion_rates" ("currency", "effective_from" DESC)
    `);

    // ── wallets ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id"         UUID    NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    UUID    NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "balance"    BIGINT  NOT NULL DEFAULT 0 CHECK ("balance" >= 0),
        "is_active"  BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_user"  UNIQUE ("user_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_wallets_user_id" ON "wallets" ("user_id")
    `);

    // ── ledger_entries ─────────────────────────────────────────────────────────
    // Immutable — no updated_at column by design.
    await queryRunner.query(`
      CREATE TABLE "ledger_entries" (
        "id"                       UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "wallet_id"                UUID        NOT NULL REFERENCES "wallets"("id") ON DELETE CASCADE,
        "user_id"                  UUID        NOT NULL REFERENCES "users"("id")   ON DELETE CASCADE,
        "type"                     VARCHAR(10) NOT NULL CHECK ("type" IN ('credit','debit')),
        "amount"                   BIGINT      NOT NULL CHECK ("amount" > 0),
        "balance_before"           BIGINT      NOT NULL,
        "balance_after"            BIGINT      NOT NULL,
        "source"                   VARCHAR(50) NOT NULL,
        "conversion_rate_id"       UUID        REFERENCES "conversion_rates"("id") ON DELETE SET NULL,
        "conversion_rate_snapshot" DECIMAL(10,4),
        "fiat_amount_kobo"         BIGINT,
        "fiat_currency"            VARCHAR(10),
        "reference"                VARCHAR(255),
        "description"              VARCHAR(500) NOT NULL,
        "metadata"                 JSONB,
        "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ledger_entries" PRIMARY KEY ("id")
      )
    `);

    // Indexes: per-wallet pagination (most common) + per-user query
    await queryRunner.query(`
      CREATE INDEX "IDX_ledger_wallet_created"
        ON "ledger_entries" ("wallet_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ledger_user_created"
        ON "ledger_entries" ("user_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ledger_reference"
        ON "ledger_entries" ("reference")
        WHERE "reference" IS NOT NULL
    `);

    // ── paystack_transactions ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "paystack_transactions" (
        "id"                       UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"                  UUID         NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "reference"                VARCHAR(100) NOT NULL,
        "amount_kobo"              BIGINT       NOT NULL CHECK ("amount_kobo" > 0),
        "currency"                 VARCHAR(10)  NOT NULL DEFAULT 'NGN',
        "conversion_rate_id"       UUID         REFERENCES "conversion_rates"("id") ON DELETE SET NULL,
        "conversion_rate_snapshot" DECIMAL(10,4),
        "wash_points_credited"     BIGINT,
        "status"                   VARCHAR(20)  NOT NULL DEFAULT 'pending',
        "channel"                  VARCHAR(50),
        "paystack_reference"       VARCHAR(255),
        "metadata"                 JSONB,
        "webhook_data"             JSONB,
        "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"               TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_paystack_transactions"        PRIMARY KEY ("id"),
        CONSTRAINT "UQ_paystack_transactions_ref"    UNIQUE ("reference")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_paystack_tx_user_id"  ON "paystack_transactions" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_paystack_tx_status"   ON "paystack_transactions" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "paystack_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversion_rates"`);
  }
}
