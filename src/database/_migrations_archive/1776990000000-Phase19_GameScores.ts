import { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 19 — Game scores (engagement mini-game leaderboard). */
export class Phase19GameScores1776990000000 implements MigrationInterface {
  name = 'Phase19GameScores1776990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "game_scores" (
        "id"         uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamp   NOT NULL DEFAULT now(),
        "updated_at" timestamp   NOT NULL DEFAULT now(),
        "user_id"    uuid        NOT NULL,
        "game"       varchar(60) NOT NULL,
        "score"      int         NOT NULL DEFAULT 0,
        CONSTRAINT "PK_game_scores" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_game_scores_user_game" UNIQUE ("user_id", "game")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_game_scores_game" ON "game_scores" ("game")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "game_scores"`);
  }
}
