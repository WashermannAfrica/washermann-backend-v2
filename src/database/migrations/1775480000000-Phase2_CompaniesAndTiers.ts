import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2CompaniesAndTiers1775480000000 implements MigrationInterface {
  name = 'Phase2CompaniesAndTiers1775480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── companies ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id"            UUID NOT NULL DEFAULT uuid_generate_v4(),
        "name"          VARCHAR(255) NOT NULL,
        "contact_email" VARCHAR(255),
        "contact_phone" VARCHAR(50),
        "status"        VARCHAR(50) NOT NULL DEFAULT 'active',
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_companies" PRIMARY KEY ("id")
      )
    `);

    // ── tiers ──────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "tiers" (
        "id"                  UUID NOT NULL DEFAULT uuid_generate_v4(),
        "company_id"          UUID NOT NULL,
        "name"                VARCHAR(255) NOT NULL,
        "monthly_points"      INTEGER NOT NULL,
        "monthly_order_limit" INTEGER NOT NULL,
        "item_limit"          INTEGER NOT NULL,
        "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tiers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tiers_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    // ── company_employees ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "company_employees" (
        "id"                UUID NOT NULL DEFAULT uuid_generate_v4(),
        "company_id"        UUID NOT NULL,
        "user_id"           UUID NOT NULL,
        "tier_id"           UUID,
        "assignment_status" VARCHAR(50) NOT NULL DEFAULT 'active',
        "assigned_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_employees" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_company_employees_company_user" UNIQUE ("company_id", "user_id"),
        CONSTRAINT "FK_company_employees_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_company_employees_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_company_employees_tier" FOREIGN KEY ("tier_id")
          REFERENCES "tiers"("id") ON DELETE SET NULL
      )
    `);

    // ── company_admins ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "company_admins" (
        "id"         UUID NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" UUID NOT NULL,
        "user_id"    UUID NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_admins" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_company_admins_company_user" UNIQUE ("company_id", "user_id"),
        CONSTRAINT "FK_company_admins_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_company_admins_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "company_admins"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "company_employees"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tiers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "companies"`);
  }
}
