import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 20 — Geofencing.
 * - area_locations become circle geofences (center + radius km, nullable for legacy rows).
 * - orders record the resolved location + whether the pickup point was inside coverage.
 * - coverage_gaps logs every point that fell outside all geofences (demand signal).
 */
export class Phase20Geofencing1777000000000 implements MigrationInterface {
  name = 'Phase20Geofencing1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "area_locations" ADD COLUMN IF NOT EXISTS "center_lat" double precision`);
    await queryRunner.query(`ALTER TABLE "area_locations" ADD COLUMN IF NOT EXISTS "center_lng" double precision`);
    await queryRunner.query(`ALTER TABLE "area_locations" ADD COLUMN IF NOT EXISTS "radius_km" double precision`);

    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "area_location_id" uuid`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coverage_matched" boolean NOT NULL DEFAULT true`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "coverage_gaps" (
        "id"               uuid             NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"       timestamp        NOT NULL DEFAULT now(),
        "updated_at"       timestamp        NOT NULL DEFAULT now(),
        "user_id"          uuid,
        "latitude"         double precision NOT NULL,
        "longitude"        double precision NOT NULL,
        "address_text"     varchar(1000),
        "fallback_area_id" uuid,
        "distance_km"      double precision,
        "source"           varchar(30)      NOT NULL,
        CONSTRAINT "PK_coverage_gaps" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_coverage_gaps_created_at" ON "coverage_gaps" ("created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "coverage_gaps"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "coverage_matched"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "area_location_id"`);
    await queryRunner.query(`ALTER TABLE "area_locations" DROP COLUMN IF EXISTS "radius_km"`);
    await queryRunner.query(`ALTER TABLE "area_locations" DROP COLUMN IF EXISTS "center_lng"`);
    await queryRunner.query(`ALTER TABLE "area_locations" DROP COLUMN IF EXISTS "center_lat"`);
  }
}
