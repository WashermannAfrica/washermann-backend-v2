import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 13 — Bundles (catalogue-native).
 *
 * Standalone packages composed of catalogue items/categories. Base price is
 * derived (P70 of selectable item-type prices × median line quantity); an admin
 * promo (percentage or fixed) can override it, producing the effective price.
 */
export class Phase13Bundles1776480000000 implements MigrationInterface {
  name = 'Phase13Bundles1776480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bundles" (
        "id"                  uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"          timestamp     NOT NULL DEFAULT now(),
        "updated_at"          timestamp     NOT NULL DEFAULT now(),
        "name"                varchar(200)  NOT NULL,
        "slug"                varchar(240)  NOT NULL,
        "description"         varchar(1000) NULL,
        "image_url"           varchar(2000) NULL,
        "is_active"           boolean       NOT NULL DEFAULT true,
        "price_ngn"           decimal(12,2) NULL,
        "price_wp"            bigint        NULL,
        "price_computed_at"   timestamptz   NULL,
        "is_promo"            boolean       NOT NULL DEFAULT false,
        "promo_type"          varchar(20)   NULL,
        "promo_value"         decimal(12,2) NULL,
        "effective_price_ngn" decimal(12,2) NULL,
        "effective_price_wp"  bigint        NULL,
        "expires_at"          timestamptz   NULL,
        "audience"            jsonb         NULL,
        "sort_order"          int           NOT NULL DEFAULT 100,
        "created_by"          uuid          NULL,
        "updated_by"          uuid          NULL,
        CONSTRAINT "PK_bundles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bundles_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bundle_lines" (
        "id"          uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  timestamp   NOT NULL DEFAULT now(),
        "updated_at"  timestamp   NOT NULL DEFAULT now(),
        "bundle_id"   uuid        NOT NULL,
        "line_type"   varchar(20) NOT NULL,
        "item_id"     uuid        NULL,
        "category_id" uuid        NULL,
        "quantity"    int         NOT NULL DEFAULT 1,
        "sort_order"  int         NOT NULL DEFAULT 100,
        CONSTRAINT "PK_bundle_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bundle_lines_bundle"
          FOREIGN KEY ("bundle_id") REFERENCES "bundles"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_bundle_lines_bundle" ON "bundle_lines" ("bundle_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bundle_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bundles"`);
  }
}
