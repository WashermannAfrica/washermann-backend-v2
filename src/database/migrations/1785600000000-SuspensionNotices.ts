import { MigrationInterface, QueryRunner } from 'typeorm';

export class SuspensionNotices1785600000000 implements MigrationInterface {
  name = 'SuspensionNotices1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "suspension_notice_days" int NOT NULL DEFAULT 7`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "suspension_notices" (
        "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        "subject_type"        VARCHAR(10)   NOT NULL,
        "subject_id"          UUID          NOT NULL,
        "subject_user_id"     UUID          NOT NULL,
        "reason"              VARCHAR(1000) NOT NULL,
        "status"              VARCHAR(16)   NOT NULL DEFAULT 'notice',
        "immediate"           BOOLEAN       NOT NULL DEFAULT FALSE,
        "respond_by"          TIMESTAMPTZ,
        "response"            VARCHAR(1000),
        "responded_at"        TIMESTAMPTZ,
        "suspended_at"        TIMESTAMPTZ,
        "review_requested_at" TIMESTAMPTZ,
        "review_note"         VARCHAR(1000),
        "review_decision"     VARCHAR(12),
        "review_decided_at"   TIMESTAMPTZ,
        "reviewed_by"         UUID,
        "created_by"          UUID          NOT NULL,
        "created_at"          TIMESTAMP     NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMP     NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_suspension_notices" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_suspension_notices_subject" ON "suspension_notices" ("subject_type", "subject_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_suspension_notices_status" ON "suspension_notices" ("status");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "suspension_notices";`);
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "suspension_notice_days"`);
  }
}
