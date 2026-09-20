import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 15 — Referral engine: codes, referrals, and admin reward rules.
 */
export class Phase15Referrals1776680000000 implements MigrationInterface {
  name = 'Phase15Referrals1776680000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "referral_codes" (
        "id"            uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"    timestamp   NOT NULL DEFAULT now(),
        "updated_at"    timestamp   NOT NULL DEFAULT now(),
        "code"          varchar(24) NOT NULL,
        "owner_user_id" uuid        NOT NULL,
        "owner_type"    varchar(20) NOT NULL,
        "is_active"     boolean     NOT NULL DEFAULT true,
        CONSTRAINT "PK_referral_codes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_referral_codes_code" UNIQUE ("code"),
        CONSTRAINT "UQ_referral_codes_owner" UNIQUE ("owner_user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id"               uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"       timestamp     NOT NULL DEFAULT now(),
        "updated_at"       timestamp     NOT NULL DEFAULT now(),
        "code"             varchar(24)   NOT NULL,
        "referrer_user_id" uuid          NOT NULL,
        "referrer_type"    varchar(20)   NOT NULL,
        "referred_user_id" uuid          NOT NULL,
        "referred_type"    varchar(20)   NOT NULL,
        "status"           varchar(20)   NOT NULL DEFAULT 'pending',
        "reward_kind"      varchar(10)   NULL,
        "reward_value"     decimal(12,2) NULL,
        "reward_currency"  varchar(10)   NOT NULL,
        "reward_amount"    decimal(12,2) NULL,
        "unlocked_at"      timestamptz   NULL,
        "paid_at"          timestamptz   NULL,
        CONSTRAINT "PK_referrals" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_referrals_referred" UNIQUE ("referred_user_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_referrals_referrer" ON "referrals" ("referrer_user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_referrals_status" ON "referrals" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "reward_rules" (
        "id"                    uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"            timestamp     NOT NULL DEFAULT now(),
        "updated_at"            timestamp     NOT NULL DEFAULT now(),
        "referrer_type"         varchar(20)   NOT NULL,
        "referred_type"         varchar(20)   NOT NULL,
        "kind"                  varchar(10)   NOT NULL DEFAULT 'fixed',
        "value"                 decimal(12,2) NOT NULL DEFAULT 0,
        "vendor_approval_bonus" decimal(12,2) NULL,
        "tiers"                 jsonb         NULL,
        "active"                boolean       NOT NULL DEFAULT true,
        CONSTRAINT "PK_reward_rules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reward_rules_pair" UNIQUE ("referrer_type", "referred_type")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reward_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "referrals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "referral_codes"`);
  }
}
