import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fixes an inconsistent constraint on `teams.owner_id`.
 *
 * The column is `NOT NULL` (a team must always have an owner), but the FK was
 * created `ON DELETE SET NULL` — so deleting a user who owns a team would try to
 * NULL a NOT-NULL column and error. Repoint the FK to `ON DELETE RESTRICT`:
 * a user who still owns a team cannot be deleted (transfer ownership first),
 * which is the correct invariant.
 *
 * Idempotent: drops the constraint if present, then recreates it.
 */
export class TeamsOwnerFkRestrict1784400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "FK_teams_owner"
    `);
    await queryRunner.query(`
      ALTER TABLE "teams"
        ADD CONSTRAINT "FK_teams_owner"
        FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "FK_teams_owner"
    `);
    await queryRunner.query(`
      ALTER TABLE "teams"
        ADD CONSTRAINT "FK_teams_owner"
        FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE SET NULL
    `);
  }
}
