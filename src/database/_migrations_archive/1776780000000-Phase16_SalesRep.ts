import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 16 — Sales-rep program: applications, profiles, onboarding tutorial +
 * assessment (questions, attempts), and cash payouts.
 */
export class Phase16SalesRep1776780000000 implements MigrationInterface {
  name = 'Phase16SalesRep1776780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sales_rep_applications" (
        "id"                   uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"           timestamp    NOT NULL DEFAULT now(),
        "updated_at"           timestamp    NOT NULL DEFAULT now(),
        "full_name"            varchar(200) NOT NULL,
        "phone"                varchar(30)  NOT NULL,
        "email"                varchar(320) NOT NULL,
        "area_of_lagos"        varchar(100) NOT NULL,
        "address"              varchar(500) NOT NULL,
        "has_sales_experience" boolean      NOT NULL DEFAULT false,
        "why_join"             text         NULL,
        "status"               varchar(20)  NOT NULL DEFAULT 'new',
        "reviewed_by"          uuid         NULL,
        "reviewed_at"          timestamptz  NULL,
        "rejection_reason"     text         NULL,
        "user_id"              uuid         NULL,
        CONSTRAINT "PK_sales_rep_applications" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sales_reps" (
        "id"                  uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"          timestamp    NOT NULL DEFAULT now(),
        "updated_at"          timestamp    NOT NULL DEFAULT now(),
        "user_id"             uuid         NOT NULL,
        "application_id"      uuid         NULL,
        "status"              varchar(20)  NOT NULL DEFAULT 'onboarding',
        "assessment_passed"   boolean      NOT NULL DEFAULT false,
        "best_score_pct"      decimal(5,2) NOT NULL DEFAULT 0,
        "passed_at"           timestamptz  NULL,
        "upgraded_to_rep_at"  timestamptz  NULL,
        "bank_code"           varchar(20)  NULL,
        "account_number"      varchar(20)  NULL,
        "account_name"        varchar(255) NULL,
        CONSTRAINT "PK_sales_reps" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sales_reps_user" UNIQUE ("user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tutorial_steps" (
        "id"          uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  timestamp    NOT NULL DEFAULT now(),
        "updated_at"  timestamp    NOT NULL DEFAULT now(),
        "order_index" int          NOT NULL DEFAULT 0,
        "title"       varchar(255) NOT NULL,
        "body"        text         NOT NULL,
        "active"      boolean      NOT NULL DEFAULT true,
        CONSTRAINT "PK_tutorial_steps" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "assessment_questions" (
        "id"            uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"    timestamp NOT NULL DEFAULT now(),
        "updated_at"    timestamp NOT NULL DEFAULT now(),
        "prompt"        text      NOT NULL,
        "options"       jsonb     NOT NULL,
        "correct_index" int       NOT NULL,
        "active"        boolean   NOT NULL DEFAULT true,
        CONSTRAINT "PK_assessment_questions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "assessment_attempts" (
        "id"                uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"        timestamp    NOT NULL DEFAULT now(),
        "updated_at"        timestamp    NOT NULL DEFAULT now(),
        "sales_rep_user_id" uuid         NOT NULL,
        "score"             int          NOT NULL,
        "total_questions"   int          NOT NULL,
        "score_pct"         decimal(5,2) NOT NULL,
        "passed"            boolean      NOT NULL,
        "answers"           jsonb        NOT NULL,
        CONSTRAINT "PK_assessment_attempts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_assessment_attempts_user" ON "assessment_attempts" ("sales_rep_user_id")`);

    await queryRunner.query(`
      CREATE TABLE "sales_rep_payouts" (
        "id"                uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"        timestamp     NOT NULL DEFAULT now(),
        "updated_at"        timestamp     NOT NULL DEFAULT now(),
        "sales_rep_user_id" uuid          NOT NULL,
        "amount_naira"      decimal(12,2) NOT NULL,
        "referral_ids"      jsonb         NOT NULL,
        "status"            varchar(20)   NOT NULL DEFAULT 'pending',
        "bank_code"         varchar(20)   NOT NULL,
        "account_number"    varchar(20)   NOT NULL,
        "account_name"      varchar(255)  NOT NULL,
        "approved_by"       uuid          NULL,
        "approved_at"       timestamptz   NULL,
        "completed_at"      timestamptz   NULL,
        "failure_reason"    text          NULL,
        "reference"         varchar(100)  NULL,
        CONSTRAINT "PK_sales_rep_payouts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sales_rep_payouts_user" ON "sales_rep_payouts" ("sales_rep_user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_sales_rep_payouts_status" ON "sales_rep_payouts" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_rep_payouts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "assessment_attempts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "assessment_questions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tutorial_steps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_reps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_rep_applications"`);
  }
}
