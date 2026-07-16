import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 18 — WashPoint Monetary Policy rate engine: singleton rate_config and the
 * immutable rate_epochs log.
 */
export class Phase18RateEngine1776980000000 implements MigrationInterface {
  name = 'Phase18RateEngine1776980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rate_config" (
        "id"                  uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"          timestamp     NOT NULL DEFAULT now(),
        "updated_at"          timestamp     NOT NULL DEFAULT now(),
        "v_base"              decimal(12,4) NOT NULL DEFAULT 6.86,
        "current_v"           decimal(12,4) NOT NULL DEFAULT 6.86,
        "last_smoothed_index" decimal(18,8) NOT NULL DEFAULT 1,
        "alpha"               decimal(6,4)  NOT NULL DEFAULT 0.2,
        "cap_pct"             decimal(6,2)  NOT NULL DEFAULT 5,
        "deadband_pct"        decimal(6,2)  NOT NULL DEFAULT 1,
        "step_naira"          decimal(8,4)  NOT NULL DEFAULT 0.005,
        "buy_spread"          decimal(8,4)  NOT NULL DEFAULT 0,
        "payout_spread"       decimal(8,4)  NOT NULL DEFAULT 0,
        "formula_version"     int           NOT NULL DEFAULT 1,
        "weights"             jsonb         NOT NULL DEFAULT '{"fx":0.4,"diesel":0.2,"vendor":0.4}',
        "baselines"           jsonb         NOT NULL DEFAULT '{"fx":1400,"diesel":1300,"vendor":4500}',
        "last_prompted_at"    timestamptz   NULL,
        "last_approved_at"    timestamptz   NULL,
        "updated_by"          uuid          NULL,
        CONSTRAINT "PK_rate_config" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rate_epochs" (
        "id"                          uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"                  timestamp     NOT NULL DEFAULT now(),
        "updated_at"                  timestamp     NOT NULL DEFAULT now(),
        "formula_version"             int           NOT NULL,
        "trigger"                     varchar(12)   NOT NULL,
        "inputs"                      jsonb         NOT NULL,
        "baselines"                   jsonb         NOT NULL,
        "weights"                     jsonb         NOT NULL,
        "factors"                     jsonb         NOT NULL,
        "cost_index"                  decimal(18,8) NOT NULL,
        "prev_smoothed_index"         decimal(18,8) NOT NULL,
        "smoothed_index"              decimal(18,8) NOT NULL,
        "v_base"                      decimal(12,4) NOT NULL,
        "prev_v"                      decimal(12,4) NOT NULL,
        "target_v"                    decimal(12,4) NOT NULL,
        "v_capped"                    decimal(12,4) NOT NULL,
        "v_new"                       decimal(12,4) NOT NULL,
        "v_published"                 decimal(12,4) NOT NULL,
        "cap_applied"                 boolean       NOT NULL,
        "deadband_held"               boolean       NOT NULL,
        "buy_spread"                  decimal(8,4)  NOT NULL,
        "payout_spread"               decimal(8,4)  NOT NULL,
        "points_per_unit"             decimal(12,6) NOT NULL,
        "payout_rate"                 decimal(12,4) NOT NULL,
        "status"                      varchar(12)   NOT NULL DEFAULT 'proposed',
        "proposed_by"                 uuid          NULL,
        "decided_by"                  uuid          NULL,
        "decided_at"                  timestamptz   NULL,
        "note"                        text          NULL,
        "applied_conversion_rate_id"  uuid          NULL,
        "hash"                        varchar(64)   NOT NULL,
        CONSTRAINT "PK_rate_epochs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_rate_epochs_status" ON "rate_epochs" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_epochs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_config"`);
  }
}
