import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase7MarketingWaitlistAndWashReps1775880000000 implements MigrationInterface {
  name = 'Phase7MarketingWaitlistAndWashReps1775880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Waitlist signups ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "waitlist_signups" (
        "id"         uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamp    NOT NULL DEFAULT now(),
        "updated_at" timestamp    NOT NULL DEFAULT now(),
        "email"      varchar(320) NOT NULL,
        "name"       varchar(200) NOT NULL,
        "segment"    varchar(20)  NOT NULL DEFAULT 'individual',
        "source"     varchar(20)  NOT NULL DEFAULT 'waitlist',
        CONSTRAINT "PK_waitlist_signups" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_waitlist_signups_email" ON "waitlist_signups" ("email")`,
    );

    // ─── Wash Rep applications ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "wash_rep_applications" (
        "id"                uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"        timestamp    NOT NULL DEFAULT now(),
        "updated_at"        timestamp    NOT NULL DEFAULT now(),
        "full_name"         varchar(200) NOT NULL,
        "phone"             varchar(30)  NOT NULL,
        "email"             varchar(320) NOT NULL,
        "area_of_lagos"     varchar(100) NOT NULL,
        "address"           varchar(500) NOT NULL,
        "worked_logistics"  boolean      NOT NULL,
        "worked_laundromat" boolean      NOT NULL,
        "status"            varchar(20)  NOT NULL DEFAULT 'new',
        CONSTRAINT "PK_wash_rep_applications" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "wash_rep_applications"`);
    await queryRunner.query(`DROP INDEX "UQ_waitlist_signups_email"`);
    await queryRunner.query(`DROP TABLE "waitlist_signups"`);
  }
}
