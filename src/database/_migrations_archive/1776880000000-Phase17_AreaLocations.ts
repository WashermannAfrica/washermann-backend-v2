import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 17 — Area locations (towns) + target users + deactivation reason.
 */
export class Phase17AreaLocations1776880000000 implements MigrationInterface {
  name = 'Phase17AreaLocations1776880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "areas" ADD COLUMN IF NOT EXISTS "target_users" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "areas" ADD COLUMN IF NOT EXISTS "deactivation_reason" varchar(1000)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "area_locations" (
        "id"         uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamp    NOT NULL DEFAULT now(),
        "updated_at" timestamp    NOT NULL DEFAULT now(),
        "area_id"    uuid         NOT NULL,
        "name"       varchar(150) NOT NULL,
        "is_active"  boolean      NOT NULL DEFAULT true,
        CONSTRAINT "PK_area_locations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_area_locations_area" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_area_locations_area" ON "area_locations" ("area_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "area_locations"`);
    await queryRunner.query(`ALTER TABLE "areas" DROP COLUMN IF EXISTS "deactivation_reason"`);
    await queryRunner.query(`ALTER TABLE "areas" DROP COLUMN IF EXISTS "target_users"`);
  }
}
