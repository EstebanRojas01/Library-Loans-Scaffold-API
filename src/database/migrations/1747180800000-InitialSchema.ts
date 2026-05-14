import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1747180800000 implements MigrationInterface {
  name = 'InitialSchema1747180800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('admin', 'librarian', 'member')
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"           UUID NOT NULL DEFAULT uuid_generate_v4(),
        "email"        VARCHAR(255) NOT NULL,
        "passwordHash" VARCHAR(255) NOT NULL,
        "firstName"    VARCHAR(100) NOT NULL,
        "lastName"     VARCHAR(100) NOT NULL,
        "role"         "users_role_enum" NOT NULL DEFAULT 'member',
        "isActive"     BOOLEAN NOT NULL DEFAULT true,
        "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"        UUID NOT NULL DEFAULT uuid_generate_v4(),
        "userId"    UUID NOT NULL,
        "token"     VARCHAR(512) NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "revokedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_refresh_tokens_token" ON "refresh_tokens" ("token")
    `);

    await queryRunner.query(`
      CREATE TABLE "items" (
        "id"               UUID NOT NULL DEFAULT uuid_generate_v4(),
        "title"            VARCHAR(255) NOT NULL,
        "author"           VARCHAR(255) NOT NULL,
        "isbn"             VARCHAR(20),
        "description"      TEXT,
        "totalCopies"      INTEGER NOT NULL DEFAULT 1,
        "availableCopies"  INTEGER NOT NULL DEFAULT 1,
        "isActive"         BOOLEAN NOT NULL DEFAULT true,
        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_items_isbn" ON "items" ("isbn") WHERE "isbn" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TYPE "loans_status_enum" AS ENUM ('active', 'returned', 'overdue')
    `);

    await queryRunner.query(`
      CREATE TABLE "loans" (
        "id"          UUID NOT NULL DEFAULT uuid_generate_v4(),
        "userId"      UUID NOT NULL,
        "itemId"      UUID NOT NULL,
        "loanedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "dueAt"       TIMESTAMPTZ NOT NULL,
        "returnedAt"  TIMESTAMPTZ,
        "status"      "loans_status_enum" NOT NULL DEFAULT 'active',
        "fineAmount"  DECIMAL(10,2),
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loans" PRIMARY KEY ("id"),
        CONSTRAINT "FK_loans_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_loans_item"
          FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_loans_userId" ON "loans" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_loans_itemId" ON "loans" ("itemId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "loans"`);
    await queryRunner.query(`DROP TYPE "loans_status_enum"`);
    await queryRunner.query(`DROP TABLE "items"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}
