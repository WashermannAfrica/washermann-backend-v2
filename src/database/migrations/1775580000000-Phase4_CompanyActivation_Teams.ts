import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase4CompanyActivationTeams1775580000000
  implements MigrationInterface
{
  name = 'Phase4CompanyActivationTeams1775580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── companies: add owner_email, activation_status, and full profile ──────────

    await queryRunner.query(`
      ALTER TABLE "companies"
        ADD COLUMN "owner_email"        VARCHAR(255)  NOT NULL DEFAULT '',
        ADD COLUMN "activation_status"  VARCHAR(50)   NOT NULL DEFAULT 'pending',
        ADD COLUMN "phone"              VARCHAR(50)   NULL,
        ADD COLUMN "industry"           VARCHAR(100)  NULL,
        ADD COLUMN "address"            TEXT          NULL,
        ADD COLUMN "website"            VARCHAR(255)  NULL,
        ADD COLUMN "number_of_workers"  INTEGER       NULL,
        ADD COLUMN "description"        TEXT          NULL
    `);

    // owner_email must be unique going forward
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_companies_owner_email"
        ON "companies" ("owner_email")
        WHERE "owner_email" != ''
    `);

    // ─── company_admins: add company_role ─────────────────────────────────────────

    await queryRunner.query(`
      ALTER TABLE "company_admins"
        ADD COLUMN "company_role" VARCHAR(20) NOT NULL DEFAULT 'admin'
    `);

    // ─── teams ────────────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "teams" (
        "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"         VARCHAR(255)  NOT NULL,
        "description"  TEXT          NULL,
        "owner_id"     UUID          NOT NULL,
        "industry"     VARCHAR(100)  NULL,
        "address"      TEXT          NULL,
        "website"      VARCHAR(255)  NULL,
        "member_count" INTEGER       NULL,
        "is_active"    BOOLEAN       NOT NULL DEFAULT TRUE,
        "created_at"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_teams" PRIMARY KEY ("id"),
        CONSTRAINT "FK_teams_owner" FOREIGN KEY ("owner_id")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_teams_owner_id" ON "teams" ("owner_id")
    `);

    // ─── team_members ─────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "team_members" (
        "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "team_id"    UUID         NOT NULL,
        "user_id"    UUID         NOT NULL,
        "role"       VARCHAR(20)  NOT NULL DEFAULT 'member',
        "is_active"  BOOLEAN      NOT NULL DEFAULT TRUE,
        "joined_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_team_members"           PRIMARY KEY ("id"),
        CONSTRAINT "UQ_team_members_team_user" UNIQUE ("team_id", "user_id"),
        CONSTRAINT "FK_team_members_team"      FOREIGN KEY ("team_id")
          REFERENCES "teams" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_team_members_user"      FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_team_members_role"     CHECK ("role" IN ('owner','admin','member'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_team_members_team_id" ON "team_members" ("team_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_team_members_user_id" ON "team_members" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "team_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "teams"`);

    await queryRunner.query(`
      ALTER TABLE "company_admins" DROP COLUMN IF EXISTS "company_role"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_companies_owner_email"`);
    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP COLUMN IF EXISTS "description",
        DROP COLUMN IF EXISTS "number_of_workers",
        DROP COLUMN IF EXISTS "website",
        DROP COLUMN IF EXISTS "address",
        DROP COLUMN IF EXISTS "industry",
        DROP COLUMN IF EXISTS "phone",
        DROP COLUMN IF EXISTS "activation_status",
        DROP COLUMN IF EXISTS "owner_email"
    `);
  }
}
