import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLostStatusAndItemType1747180800001 implements MigrationInterface {
  name = 'AddLostStatusAndItemType1747180800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ALTER TYPE inside a transaction requires PostgreSQL 12+
    await queryRunner.query(`ALTER TYPE "loans_status_enum" ADD VALUE IF NOT EXISTS 'lost'`);

    await queryRunner.query(`
      CREATE TYPE "items_type_enum" AS ENUM ('book', 'magazine', 'dvd', 'other')
    `);

    await queryRunner.query(`
      ALTER TABLE "items"
        ADD COLUMN "type" "items_type_enum" NOT NULL DEFAULT 'book'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE "items_type_enum"`);
    // PostgreSQL no soporta DROP VALUE en enums; se deja el valor 'lost' en el tipo
  }
}
