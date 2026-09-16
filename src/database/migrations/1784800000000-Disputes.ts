import { MigrationInterface, QueryRunner } from 'typeorm';

/** Order disputes + their resolution timeline. */
export class Disputes1784800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "disputes" (
        "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        "reference"             VARCHAR(20)   NOT NULL,
        "order_id"              UUID          NOT NULL,
        "raised_by_user_id"     UUID          NOT NULL,
        "issue_type"            VARCHAR(40)   NOT NULL,
        "description"           TEXT          NOT NULL,
        "affected_items"        JSONB         NOT NULL DEFAULT '[]',
        "preferred_resolutions" JSONB         NOT NULL DEFAULT '[]',
        "evidence_urls"         JSONB         NOT NULL DEFAULT '[]',
        "status"                VARCHAR(20)   NOT NULL DEFAULT 'reported',
        "resolution_outcome"    VARCHAR(20)   NULL,
        "resolution_note"       TEXT          NULL,
        "refunded_wp"           BIGINT        NULL,
        "resolved_by_user_id"   UUID          NULL,
        "resolved_at"           TIMESTAMPTZ   NULL,
        "created_at"            TIMESTAMP     NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMP     NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_disputes"        PRIMARY KEY ("id"),
        CONSTRAINT "UQ_disputes_reference" UNIQUE ("reference"),
        CONSTRAINT "FK_disputes_order"  FOREIGN KEY ("order_id")
          REFERENCES "orders" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_disputes_user"   FOREIGN KEY ("raised_by_user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    for (const col of ['raised_by_user_id', 'order_id', 'status']) {
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_disputes_${col}" ON "disputes" ("${col}")`);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dispute_events" (
        "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "dispute_id" UUID         NOT NULL,
        "status"     VARCHAR(20)  NOT NULL,
        "note"       VARCHAR(1000) NULL,
        "actor_role" VARCHAR(30)  NULL,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_dispute_events"  PRIMARY KEY ("id"),
        CONSTRAINT "FK_dispute_events_dispute" FOREIGN KEY ("dispute_id")
          REFERENCES "disputes" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dispute_events_dispute_id" ON "dispute_events" ("dispute_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dispute_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "disputes"`);
  }
}
