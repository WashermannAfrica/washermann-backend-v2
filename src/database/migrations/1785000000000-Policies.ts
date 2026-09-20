import { MigrationInterface, QueryRunner } from 'typeorm';

export class Policies1785000000000 implements MigrationInterface {
  name = 'Policies1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "policies" (
        "id"                 UUID          NOT NULL DEFAULT gen_random_uuid(),
        "key"                VARCHAR(80)   NOT NULL,
        "title"              VARCHAR(160)  NOT NULL,
        "description"        VARCHAR(300),
        "audiences"          TEXT          NOT NULL DEFAULT '',
        "current_version_id" UUID,
        "sort_order"         INT           NOT NULL DEFAULT 0,
        "is_active"          BOOLEAN       NOT NULL DEFAULT TRUE,
        "created_at"         TIMESTAMP     NOT NULL DEFAULT NOW(),
        "updated_at"         TIMESTAMP     NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_policies_key" UNIQUE ("key")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "policy_versions" (
        "id"                   UUID          NOT NULL DEFAULT gen_random_uuid(),
        "policy_id"            UUID          NOT NULL,
        "version_number"       INT           NOT NULL,
        "status"               VARCHAR(16)   NOT NULL DEFAULT 'draft',
        "content_markdown"     TEXT          NOT NULL,
        "content_html"         TEXT          NOT NULL,
        "content_hash"         VARCHAR(64)   NOT NULL,
        "change_summary"       VARCHAR(500),
        "effective_date"       DATE          NOT NULL,
        "requires_reconsent"   BOOLEAN       NOT NULL DEFAULT FALSE,
        "source_format"        VARCHAR(16)   NOT NULL DEFAULT 'markdown',
        "published_at"         TIMESTAMP,
        "published_by_user_id" UUID,
        "created_at"           TIMESTAMP     NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMP     NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_policy_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_policy_versions_policy" FOREIGN KEY ("policy_id")
          REFERENCES "policies" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_policy_versions_policy" ON "policy_versions" ("policy_id");`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_policy_versions_policy_number" ON "policy_versions" ("policy_id", "version_number");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_policy_versions_status" ON "policy_versions" ("status");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "policy_versions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "policies";`);
  }
}
