import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 22 — Assignment scoring signals + config.
 * - reps/vendors gain the tracked signals the composite scorer reads
 *   (recency, accept latency, on-time delivery counters).
 * - orders gain a delivery_deadline (SLA) so on-time is measurable.
 * - platform_config gains the turnaround hours + tunable scoring weights.
 */
export class Phase22AssignmentScoring1777020000000 implements MigrationInterface {
  name = 'Phase22AssignmentScoring1777020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reps" ADD COLUMN IF NOT EXISTS "last_assigned_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "reps" ADD COLUMN IF NOT EXISTS "avg_accept_latency_sec" double precision`);
    await queryRunner.query(`ALTER TABLE "reps" ADD COLUMN IF NOT EXISTS "accept_count" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "reps" ADD COLUMN IF NOT EXISTS "on_time_deliveries" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "reps" ADD COLUMN IF NOT EXISTS "total_deliveries" int NOT NULL DEFAULT 0`);

    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "last_assigned_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "avg_accept_latency_sec" double precision`);
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "accept_count" int NOT NULL DEFAULT 0`);

    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_deadline" timestamptz`);

    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "order_turnaround_hours" int NOT NULL DEFAULT 48`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "assignment_scoring" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "assignment_scoring"`);
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "order_turnaround_hours"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_deadline"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "accept_count"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "avg_accept_latency_sec"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "last_assigned_at"`);
    await queryRunner.query(`ALTER TABLE "reps" DROP COLUMN IF EXISTS "total_deliveries"`);
    await queryRunner.query(`ALTER TABLE "reps" DROP COLUMN IF EXISTS "on_time_deliveries"`);
    await queryRunner.query(`ALTER TABLE "reps" DROP COLUMN IF EXISTS "accept_count"`);
    await queryRunner.query(`ALTER TABLE "reps" DROP COLUMN IF EXISTS "avg_accept_latency_sec"`);
    await queryRunner.query(`ALTER TABLE "reps" DROP COLUMN IF EXISTS "last_assigned_at"`);
  }
}
