import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 11 — Wash & Fold bags.
 *
 * A bag is bought as a unit (no per-item selection). Price is derived:
 * P70(active everyday item prices) × allowedItemCount, cached here.
 */
export class Phase11Bags1776280000000 implements MigrationInterface {
  name = 'Phase11Bags1776280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bags" (
        "id"                    uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"            timestamp     NOT NULL DEFAULT now(),
        "updated_at"            timestamp     NOT NULL DEFAULT now(),
        "name"                  varchar(160)  NOT NULL,
        "slug"                  varchar(200)  NOT NULL,
        "description"           varchar(1000) NULL,
        "allowed_item_count"    int           NOT NULL,
        "eligible_item_ids"     jsonb         NOT NULL DEFAULT '[]',
        "eligible_category_ids" jsonb         NOT NULL DEFAULT '[]',
        "price_ngn"             decimal(12,2) NULL,
        "price_wp"              bigint        NULL,
        "price_computed_at"     timestamptz   NULL,
        "is_active"             boolean       NOT NULL DEFAULT true,
        "sort_order"            int           NOT NULL DEFAULT 100,
        "created_by"            uuid          NULL,
        "updated_by"            uuid          NULL,
        CONSTRAINT "PK_bags" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bags_slug" UNIQUE ("slug")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bags"`);
  }
}
