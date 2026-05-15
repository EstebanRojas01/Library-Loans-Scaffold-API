import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLostStatusAndItemType1747180800001 implements MigrationInterface {
  name = 'AddLostStatusAndItemType1747180800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "items_type_enum" AS ENUM ('book', 'magazine', 'equipment')
    `);

    await queryRunner.query(`
      ALTER TABLE "items"
        ADD COLUMN "type" "items_type_enum" NOT NULL DEFAULT 'book'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE "items_type_enum"`);
  }
}
