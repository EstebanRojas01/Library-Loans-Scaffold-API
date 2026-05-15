import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservations1747180800002 implements MigrationInterface {
  name = 'AddReservations1747180800002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id"          UUID NOT NULL DEFAULT uuid_generate_v4(),
        "userId"      UUID NOT NULL,
        "itemId"      UUID NOT NULL,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "fulfilledAt" TIMESTAMPTZ,
        "cancelledAt" TIMESTAMPTZ,
        "expiresAt"   TIMESTAMPTZ,
        CONSTRAINT "PK_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reservations_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_reservations_item"
          FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reservations_itemId_userId" ON "reservations" ("itemId", "userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reservations_userId" ON "reservations" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_reservations_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_reservations_itemId_userId"`);
    await queryRunner.query(`DROP TABLE "reservations"`);
  }
}
