import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vendor self-registration support.
 *
 * Public signup creates the Vendor row before KYC, so business_name is not yet
 * known at creation time. Relax the NOT NULL constraint; it is filled in during
 * the KYC "Personal Information" step (PATCH /vendors/me/profile).
 */
export class Phase8VendorSelfRegistration1775980000000 implements MigrationInterface {
  name = 'Phase8VendorSelfRegistration1775980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendors" ALTER COLUMN "business_name" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Backfill any nulls before restoring the constraint so the migration is reversible.
    await queryRunner.query(
      `UPDATE "vendors" SET "business_name" = 'Unnamed Business' WHERE "business_name" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendors" ALTER COLUMN "business_name" SET NOT NULL`,
    );
  }
}
