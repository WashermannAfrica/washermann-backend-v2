import { MigrationInterface, QueryRunner } from 'typeorm';

export class PolicyAcceptances1785100000000 implements MigrationInterface {
  name = 'PolicyAcceptances1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "policy_acceptances" (
        "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"        UUID          NOT NULL,
        "policy_id"      UUID          NOT NULL,
        "policy_key"     VARCHAR(80)   NOT NULL,
        "version_id"     UUID          NOT NULL,
        "version_number" INT           NOT NULL,
        "content_hash"   VARCHAR(64)   NOT NULL,
        "method"         VARCHAR(16)   NOT NULL,
        "ip_address"     VARCHAR(64),
        "user_agent"     VARCHAR(300),
        "created_at"     TIMESTAMP     NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMP     NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_policy_acceptances" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_policy_acceptances_user" ON "policy_acceptances" ("user_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_policy_acceptances_user_key" ON "policy_acceptances" ("user_id", "policy_key");`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_policy_acceptances_user_version" ON "policy_acceptances" ("user_id", "version_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "policy_acceptances";`);
  }
}
