import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, destroyApp, truncateAll } from './helpers/test-app.factory';
import { createUserWithRole } from './helpers/auth.helper';
import { UserRole } from '../src/modules/users/entities/user.entity';
import { Item, ItemType } from '../src/modules/items/entities/item.entity';
import { Loan } from '../src/modules/loans/entities/loan.entity';
import { LoanStatus } from '../src/modules/loans/enums/loan-status.enum';

describe('Loans (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await destroyApp(app);
  });

  beforeEach(async () => {
    await truncateAll(app);
  });

  it('flujo completo: register → login → POST /items → POST /loans → PATCH return con fineAmount', async () => {
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);

    // POST /items
    const itemRes = await request(app.getHttpServer())
      .post('/api/items')
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .send({ code: 'BK-001', title: 'El Quijote', type: 'book' })
      .expect(201);

    expect(itemRes.body.id).toBeDefined();

    // verificar isAvailable via GET
    const itemDetail = await request(app.getHttpServer())
      .get(`/api/items/${itemRes.body.id}`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);
    expect(itemDetail.body.isAvailable).toBe(true);

    // POST /loans
    const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const loanRes = await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .send({ itemId: itemRes.body.id, dueAt })
      .expect(201);

    expect(loanRes.body.status).toBe('active');
    const loanId = loanRes.body.id as string;

    // Simular retraso: setear dueAt 4.9 días atrás → Math.ceil(4.9) = 5 días → 2.50 USD
    const ds = app.get(DataSource);
    const pastDueAt = new Date(Date.now() - 4.9 * 24 * 60 * 60 * 1000);
    await ds.getRepository(Loan).update(loanId, { dueAt: pastDueAt });

    // PATCH /loans/:id/return
    const returnRes = await request(app.getHttpServer())
      .patch(`/api/loans/${loanId}/return`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);

    expect(returnRes.body.status).toBe('returned');
    expect(returnRes.body.fineAmount).toBeDefined();
    expect(Number(returnRes.body.fineAmount)).toBe(2.5);
  });

  describe('matriz FSM de Loan', () => {
    async function seedLoanWithStatus(status: LoanStatus, userId: string): Promise<string> {
      const ds = app.get(DataSource);

      const itemRepo = ds.getRepository(Item);
      const item = await itemRepo.save(
        itemRepo.create({
          code: `FSM-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          title: 'FSM Test Item',
          type: ItemType.BOOK,
          isActive: true,
          totalCopies: 1,
          availableCopies: 1,
        }),
      );

      const loanRepo = ds.getRepository(Loan);
      const loan = await loanRepo.save(
        loanRepo.create({
          userId,
          itemId: item.id,
          loanedAt: new Date(),
          dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status,
          fineAmount: 0,
        }),
      );
      return loan.id;
    }

    const invalidTransitions: ReadonlyArray<[LoanStatus, string]> = [
      [LoanStatus.RETURNED, 'return'],
      [LoanStatus.RETURNED, 'mark-lost'],
      [LoanStatus.LOST, 'return'],
    ];

    const validTransitions: ReadonlyArray<[LoanStatus, string, string]> = [
      [LoanStatus.ACTIVE, 'return', 'returned'],
      [LoanStatus.ACTIVE, 'mark-lost', 'lost'],
    ];

    it.each(invalidTransitions)(
      'rechaza transición inválida desde %s via /%s → 400',
      async (fromStatus, action) => {
        const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
        const loanId = await seedLoanWithStatus(fromStatus, librarian.user.id);

        await request(app.getHttpServer())
          .patch(`/api/loans/${loanId}/${action}`)
          .set('Authorization', `Bearer ${librarian.accessToken}`)
          .expect(400);
      },
    );

    it.each(validTransitions)(
      'acepta transición válida desde %s via /%s → 200 con status %s',
      async (fromStatus, action, expectedStatus) => {
        const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
        const loanId = await seedLoanWithStatus(fromStatus, librarian.user.id);

        const res = await request(app.getHttpServer())
          .patch(`/api/loans/${loanId}/${action}`)
          .set('Authorization', `Bearer ${librarian.accessToken}`)
          .expect(200);

        expect(res.body.status).toBe(expectedStatus);
      },
    );
  });
});
