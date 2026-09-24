import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderFundingLinks1786300000000 implements MigrationInterface {
  name = 'OrderFundingLinks1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_funding_links" (
        "id"                       uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at"               timestamp NOT NULL DEFAULT now(),
        "updated_at"               timestamp NOT NULL DEFAULT now(),
        "order_id"                 uuid NOT NULL,
        "customer_id"              uuid NOT NULL,
        "token"                    varchar(64) NOT NULL,
        "purpose"                  varchar(12) NOT NULL DEFAULT 'sponsor',
        "status"                   varchar(12) NOT NULL DEFAULT 'active',
        "amount_kobo"              bigint NOT NULL,
        "wash_points_target"       bigint NOT NULL,
        "conversion_rate_snapshot" decimal(18,6),
        "conversion_rate_id"       uuid,
        "vault_id"                 uuid,
        "expires_at"               timestamp with time zone NOT NULL,
        "paid_at"                  timestamp with time zone,
        "paid_reference"           varchar(100),
        "sponsor_name"             varchar(160),
        "sponsor_message"          varchar(500),
        CONSTRAINT "PK_order_funding_links" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_order_funding_links_token" UNIQUE ("token")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_order_funding_links_order_id" ON "order_funding_links" ("order_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_order_funding_links_status" ON "order_funding_links" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_funding_links"`);
  }
}
