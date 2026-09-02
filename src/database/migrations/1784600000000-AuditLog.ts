import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Platform-wide audit log. One row per meaningful action from any application,
 * written by the global audit interceptor. Read-only for admins. Indexed on every
 * filterable dimension (app, category, action, actor, actor type, target, date).
 */
export class AuditLog1784600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
        "app"          VARCHAR(24)   NOT NULL DEFAULT 'api',
        "category"     VARCHAR(40)   NOT NULL DEFAULT 'general',
        "action"       VARCHAR(80)   NOT NULL,
        "description"  TEXT          NOT NULL,
        "actor_id"     UUID          NULL,
        "actor_type"   VARCHAR(30)   NOT NULL DEFAULT 'system',
        "actor_name"   VARCHAR(255)  NULL,
        "target_type"  VARCHAR(40)   NULL,
        "target_id"    VARCHAR(64)   NULL,
        "target_label" VARCHAR(255)  NULL,
        "method"       VARCHAR(10)   NULL,
        "path"         VARCHAR(500)  NULL,
        "status_code"  INTEGER       NULL,
        "success"      BOOLEAN       NOT NULL DEFAULT TRUE,
        "ip"           VARCHAR(64)   NULL,
        "user_agent"   VARCHAR(500)  NULL,
        "metadata"     JSONB         NULL,
        "created_at"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    for (const col of ['created_at', 'app', 'category', 'action', 'actor_id', 'actor_type', 'target_id']) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_${col}" ON "audit_logs" ("${col}")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
