import { MigrationInterface, QueryRunner } from 'typeorm';

/** In-house live support chat: one conversation per user + their messages. */
export class SupportChat1784900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_conversations" (
        "id"                   UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"              UUID          NOT NULL,
        "user_role"            VARCHAR(30)   NOT NULL DEFAULT 'user',
        "status"               VARCHAR(20)   NOT NULL DEFAULT 'open',
        "assigned_agent_id"    UUID          NULL,
        "last_message_at"      TIMESTAMPTZ   NULL,
        "last_message_preview" VARCHAR(300)  NULL,
        "unread_for_user"      INTEGER       NOT NULL DEFAULT 0,
        "unread_for_agent"     INTEGER       NOT NULL DEFAULT 0,
        "created_at"           TIMESTAMP     NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMP     NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_support_conversations"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_support_conversations_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_support_conversations_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_support_conversations_status" ON "support_conversations" ("status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_messages" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" UUID         NOT NULL,
        "sender_id"       UUID         NULL,
        "sender_type"     VARCHAR(10)  NOT NULL,
        "sender_name"     VARCHAR(255) NULL,
        "body"            TEXT         NOT NULL,
        "attachments"     JSONB        NULL,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_support_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_support_messages_conversation" FOREIGN KEY ("conversation_id")
          REFERENCES "support_conversations" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_support_messages_conv_created" ON "support_messages" ("conversation_id", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "support_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_conversations"`);
  }
}
