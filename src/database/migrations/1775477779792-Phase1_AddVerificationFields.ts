import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase1AddVerificationFields1775477779792 implements MigrationInterface {
    name = 'Phase1AddVerificationFields1775477779792'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "email_verified" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "phone_verified" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone_verified"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verified"`);
    }

}
