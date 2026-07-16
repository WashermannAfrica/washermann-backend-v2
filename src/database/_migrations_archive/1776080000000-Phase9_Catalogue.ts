import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 9 — Item Catalogue.
 *
 * Categories → sub-categories → items (the canonical priced unit), plus the
 * vendor item-suggestion moderation queue. Items carry cached, derived prices
 * (filled by the P70 engine in a later phase).
 */
export class Phase9Catalogue1776080000000 implements MigrationInterface {
  name = 'Phase9Catalogue1776080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "catalogue_categories" (
        "id"          uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  timestamp     NOT NULL DEFAULT now(),
        "updated_at"  timestamp     NOT NULL DEFAULT now(),
        "name"        varchar(160)  NOT NULL,
        "slug"        varchar(160)  NOT NULL,
        "description" varchar(1000) NULL,
        "svg_icon"    text          NULL,
        "sort_order"  int           NOT NULL DEFAULT 100,
        "is_active"   boolean       NOT NULL DEFAULT true,
        "source"      varchar(20)   NOT NULL DEFAULT 'admin',
        "created_by"  uuid          NULL,
        "updated_by"  uuid          NULL,
        CONSTRAINT "PK_catalogue_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_catalogue_categories_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "catalogue_subcategories" (
        "id"          uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  timestamp     NOT NULL DEFAULT now(),
        "updated_at"  timestamp     NOT NULL DEFAULT now(),
        "category_id" uuid          NOT NULL,
        "name"        varchar(160)  NOT NULL,
        "slug"        varchar(200)  NOT NULL,
        "sort_order"  int           NOT NULL DEFAULT 100,
        "is_active"   boolean       NOT NULL DEFAULT true,
        "source"      varchar(20)   NOT NULL DEFAULT 'admin',
        "created_by"  uuid          NULL,
        "updated_by"  uuid          NULL,
        CONSTRAINT "PK_catalogue_subcategories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_catalogue_subcategories_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_catalogue_subcategories_category"
          FOREIGN KEY ("category_id") REFERENCES "catalogue_categories"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_catalogue_subcategories_category" ON "catalogue_subcategories" ("category_id")`);

    await queryRunner.query(`
      CREATE TABLE "catalogue_items" (
        "id"                   uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"           timestamp     NOT NULL DEFAULT now(),
        "updated_at"           timestamp     NOT NULL DEFAULT now(),
        "category_id"          uuid          NOT NULL,
        "subcategory_id"       uuid          NULL,
        "name"                 varchar(200)  NOT NULL,
        "slug"                 varchar(240)  NOT NULL,
        "svg_icon"             text          NULL,
        "is_everyday"          boolean       NOT NULL DEFAULT false,
        "is_active"            boolean       NOT NULL DEFAULT true,
        "is_available"         boolean       NOT NULL DEFAULT false,
        "price_ngn"            decimal(12,2) NULL,
        "price_wp"             bigint        NULL,
        "price_computed_at"    timestamptz   NULL,
        "source"               varchar(30)   NOT NULL DEFAULT 'admin',
        "origin_suggestion_id" uuid          NULL,
        "sort_order"           int           NOT NULL DEFAULT 100,
        "created_by"           uuid          NULL,
        "updated_by"           uuid          NULL,
        CONSTRAINT "PK_catalogue_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_catalogue_items_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_catalogue_items_category"
          FOREIGN KEY ("category_id") REFERENCES "catalogue_categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_catalogue_items_subcategory"
          FOREIGN KEY ("subcategory_id") REFERENCES "catalogue_subcategories"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_catalogue_items_category" ON "catalogue_items" ("category_id")`);

    await queryRunner.query(`
      CREATE TABLE "vendor_item_suggestions" (
        "id"                    uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"            timestamp     NOT NULL DEFAULT now(),
        "updated_at"            timestamp     NOT NULL DEFAULT now(),
        "source"                varchar(20)   NOT NULL DEFAULT 'vendor',
        "vendor_id"             uuid          NULL,
        "raw_text"              varchar(300)  NOT NULL,
        "normalized_text"       varchar(300)  NOT NULL,
        "proposed_price_naira"  decimal(12,2) NULL,
        "suggested_category_id" uuid          NULL,
        "status"                varchar(20)   NOT NULL DEFAULT 'pending',
        "resolved_item_id"      uuid          NULL,
        "reviewer_id"           uuid          NULL,
        "review_notes"          varchar(1000) NULL,
        "reviewed_at"           timestamptz   NULL,
        CONSTRAINT "PK_vendor_item_suggestions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_vendor_item_suggestions_status" ON "vendor_item_suggestions" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_vendor_item_suggestions_normalized" ON "vendor_item_suggestions" ("normalized_text")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_item_suggestions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "catalogue_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "catalogue_subcategories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "catalogue_categories"`);
  }
}
