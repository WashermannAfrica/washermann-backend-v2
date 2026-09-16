import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-device push: one row per (user, device FCM token). Replaces the single
 * users.fcm_token column as the source of truth for push fan-out. Existing
 * users.fcm_token values are backfilled so no one loses push on deploy. The old
 * column is left in place (legacy/compat) and can be dropped in a later migration.
 */
export class DeviceTokens1784700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_tokens" (
        "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"      UUID          NOT NULL,
        "token"        VARCHAR(1000) NOT NULL,
        "platform"     VARCHAR(20)   NULL,
        "last_seen_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "created_at"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_device_tokens"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_device_tokens_token" UNIQUE ("token"),
        CONSTRAINT "FK_device_tokens_user"  FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_device_tokens_user_id" ON "device_tokens" ("user_id")`);

    // Backfill from the legacy single-token column.
    await queryRunner.query(`
      INSERT INTO "device_tokens" ("user_id", "token")
      SELECT "id", "fcm_token" FROM "users"
      WHERE "fcm_token" IS NOT NULL AND "fcm_token" <> ''
      ON CONFLICT ("token") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "device_tokens"`);
  }
}
