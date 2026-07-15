import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase6VaultsGiftCardsAndStaffRoles1775780000000 implements MigrationInterface {
  name = 'Phase6VaultsGiftCardsAndStaffRoles1775780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add vault_id and company_id to paystack_transactions
    await queryRunner.query(`ALTER TABLE "paystack_transactions" ADD COLUMN "vault_id" uuid NULL`);
    await queryRunner.query(`ALTER TABLE "paystack_transactions" ADD COLUMN "company_id" uuid NULL`);

    // 2. Add vault_id to ledger_entries
    await queryRunner.query(`ALTER TABLE "ledger_entries" ADD COLUMN "vault_id" uuid NULL`);

    // 3. Add DISPUTE_RESOLVER and FINANCE to roles enum
    // roles column is simple-array (varchar), no enum type to alter

    // 4. Add GIFT_CARD to ledger_source enum (only where that enum exists).
    // ledger_entries.source is a VARCHAR on fresh schemas, so this type may not
    // exist — guard it so the migration is safe on both old and new databases.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_source_enum') THEN
          ALTER TYPE "ledger_source_enum" ADD VALUE IF NOT EXISTS 'gift_card';
        END IF;
      END $$;
    `);

    // 5. Create vaults table
    await queryRunner.query(`
      CREATE TYPE "vault_purpose_enum" AS ENUM ('general', 'gift_cards', 'coupons', 'custom')
    `);
    await queryRunner.query(`
      CREATE TYPE "vault_status_enum" AS ENUM ('active', 'exhausted', 'deactivated')
    `);
    await queryRunner.query(`
      CREATE TABLE "vaults" (
        "id"                        uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"                timestamp     NOT NULL DEFAULT now(),
        "updated_at"                timestamp     NOT NULL DEFAULT now(),
        "name"                      varchar(255)  NOT NULL,
        "purpose"                   "vault_purpose_enum" NOT NULL DEFAULT 'general',
        "total_points"              bigint        NOT NULL DEFAULT 0,
        "used_points"               bigint        NOT NULL DEFAULT 0,
        "conversion_rate_id"        uuid          NULL,
        "conversion_rate_snapshot"  decimal(10,4) NULL,
        "status"                    "vault_status_enum" NOT NULL DEFAULT 'active',
        "is_default"                boolean       NOT NULL DEFAULT false,
        "sequence_order"            int           NULL,
        "auto_create_on_threshold"  boolean       NOT NULL DEFAULT false,
        "auto_create_threshold"     bigint        NULL,
        "auto_create_use_same_rate" boolean       NOT NULL DEFAULT true,
        "next_vault_id"             uuid          NULL,
        "notes"                     text          NULL,
        "created_by"                uuid          NULL,
        "deactivated_at"            timestamp     NULL,
        "deactivated_by"            uuid          NULL,
        CONSTRAINT "PK_vaults" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_vaults_status_is_default" ON "vaults" ("status", "is_default")`);
    await queryRunner.query(`CREATE INDEX "IDX_vaults_sequence_order" ON "vaults" ("sequence_order")`);

    // 6. Create gift_cards table
    await queryRunner.query(`
      CREATE TYPE "gift_card_creator_type_enum" AS ENUM ('admin', 'company')
    `);
    await queryRunner.query(`
      CREATE TYPE "gift_card_source_type_enum" AS ENUM ('vault', 'company_wallet')
    `);
    await queryRunner.query(`
      CREATE TYPE "gift_card_status_enum" AS ENUM ('active', 'exhausted', 'revoked', 'expired')
    `);
    await queryRunner.query(`
      CREATE TABLE "gift_cards" (
        "id"                      uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"              timestamp     NOT NULL DEFAULT now(),
        "updated_at"              timestamp     NOT NULL DEFAULT now(),
        "code"                    varchar(24)   NOT NULL,
        "creator_type"            "gift_card_creator_type_enum" NOT NULL,
        "creator_id"              uuid          NOT NULL,
        "source_type"             "gift_card_source_type_enum" NOT NULL,
        "source_id"               uuid          NOT NULL,
        "wp_value_per_use"        bigint        NOT NULL,
        "max_usages"              int           NOT NULL DEFAULT 1,
        "used_count"              int           NOT NULL DEFAULT 0,
        "total_wp_debited"        bigint        NOT NULL,
        "qualification_criteria"  jsonb         NULL,
        "is_public"               boolean       NOT NULL DEFAULT true,
        "expires_at"              timestamp     NULL,
        "status"                  "gift_card_status_enum" NOT NULL DEFAULT 'active',
        "revoked_at"              timestamp     NULL,
        "revoked_by"              uuid          NULL,
        "refunded_wp"             bigint        NULL,
        CONSTRAINT "PK_gift_cards" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gift_cards_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_gift_cards_code" ON "gift_cards" ("code")`);
    await queryRunner.query(`CREATE INDEX "IDX_gift_cards_creator" ON "gift_cards" ("creator_type", "creator_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_gift_cards_status" ON "gift_cards" ("status")`);

    // 7. Create gift_card_redemptions table
    await queryRunner.query(`
      CREATE TABLE "gift_card_redemptions" (
        "id"           uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "gift_card_id" uuid      NOT NULL,
        "redeemed_by"  uuid      NOT NULL,
        "wp_credited"  bigint    NOT NULL,
        "redeemed_at"  timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gift_card_redemptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_gift_card_redemptions_gift_card"
          FOREIGN KEY ("gift_card_id") REFERENCES "gift_cards"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_gift_card_redemptions_gift_card_id" ON "gift_card_redemptions" ("gift_card_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_gift_card_redemptions_redeemed_by" ON "gift_card_redemptions" ("redeemed_by")`);
    // Unique: one redemption per user per gift card
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_gift_card_redemptions_user_card" ON "gift_card_redemptions" ("gift_card_id", "redeemed_by")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "gift_card_redemptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gift_cards"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "gift_card_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "gift_card_source_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "gift_card_creator_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vaults"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "vault_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "vault_purpose_enum"`);
    await queryRunner.query(`ALTER TABLE "ledger_entries" DROP COLUMN IF EXISTS "vault_id"`);
    await queryRunner.query(`ALTER TABLE "paystack_transactions" DROP COLUMN IF EXISTS "company_id"`);
    await queryRunner.query(`ALTER TABLE "paystack_transactions" DROP COLUMN IF EXISTS "vault_id"`);
  }
}
