import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LoansService } from './loans.service';
import { Loan } from './entities/loan.entity';
import { LoanStatus } from './enums/loan-status.enum';
import { ItemsService } from '../items/items.service';
import { UsersService } from '../users/users.service';
import { ReservationsService } from '../reservations/reservations.service';
import { UserRole } from '../users/entities/user.entity';
import { ItemType } from '../items/entities/item.entity';

const ACTOR = { id: 'user-1', email: 'test@test.com', role: UserRole.MEMBER };

const ITEM = {
  id: 'item-1',
  code: 'BK-001',
  title: 'Clean Code',
  author: 'Martin',
  type: ItemType.BOOK,
  isbn: null,
  description: null,
  totalCopies: 1,
  availableCopies: 1,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeDueAt(daysFromNow = 7): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

describe('LoansService', () => {
  let service: LoansService;
  let loansRepo: { count: jest.Mock; create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let itemsService: {
    findById: jest.Mock;
    decrementAvailable: jest.Mock;
    incrementAvailable: jest.Mock;
  };
  let usersService: { findById: jest.Mock };
  let reservationsService: {
    getBlockingReservations: jest.Mock;
    consumeReservation: jest.Mock;
    fulfillFirst: jest.Mock;
  };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    loansRepo = {
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    itemsService = {
      findById: jest.fn(),
      decrementAvailable: jest.fn(),
      incrementAvailable: jest.fn(),
    };
    usersService = { findById: jest.fn() };
    reservationsService = {
      getBlockingReservations: jest.fn().mockResolvedValue([]),
      consumeReservation: jest.fn().mockResolvedValue(undefined),
      fulfillFirst: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn((key: string, def?: unknown) => {
        const map: Record<string, unknown> = {
          'loans.maxActivePerUser': 3,
          'loans.maxLoanDays': 30,
          'loans.dailyFineRate': 0.5,
        };
        return map[key] ?? def;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getRepositoryToken(Loan), useValue: loansRepo },
        { provide: ItemsService, useValue: itemsService },
        { provide: UsersService, useValue: usersService },
        { provide: ReservationsService, useValue: reservationsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<LoansService>(LoansService);
  });

  it('crea un préstamo exitosamente', async () => {
    usersService.findById.mockResolvedValue({ id: ACTOR.id, isActive: true });
    loansRepo.count.mockResolvedValue(0);
    loansRepo.findOne.mockResolvedValue(null); // R2: item disponible
    itemsService.findById.mockResolvedValue({ ...ITEM });

    const saved = { id: 'loan-1', status: LoanStatus.ACTIVE };
    loansRepo.create.mockReturnValue(saved);
    loansRepo.save.mockResolvedValue(saved);

    const result = await service.create({ itemId: ITEM.id, dueAt: makeDueAt(7) }, ACTOR);

    expect(result.status).toBe(LoanStatus.ACTIVE);
  });

  it('lanza ConflictException cuando item ya tiene préstamo activo (R2)', async () => {
    usersService.findById.mockResolvedValue({ id: ACTOR.id, isActive: true });
    loansRepo.count.mockResolvedValue(0);
    loansRepo.findOne.mockResolvedValue({ id: 'blocking-loan', status: LoanStatus.ACTIVE });

    await expect(
      service.create({ itemId: ITEM.id, dueAt: makeDueAt(7) }, ACTOR),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(itemsService.findById).not.toHaveBeenCalled();
  });

  it('lanza ConflictException cuando usuario ya tiene 3 préstamos activos (R3)', async () => {
    usersService.findById.mockResolvedValue({ id: ACTOR.id, isActive: true });
    loansRepo.count.mockResolvedValue(3);

    await expect(
      service.create({ itemId: ITEM.id, dueAt: makeDueAt(7) }, ACTOR),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(itemsService.findById).not.toHaveBeenCalled();
  });

  it('calcula multa correctamente con Math.ceil (R4)', async () => {
    const dueAt = new Date(Date.now() - 4.9 * 24 * 60 * 60 * 1000); // ~4.9 días → ceil = 5
    const loan = {
      id: 'loan-1',
      userId: ACTOR.id,
      itemId: ITEM.id,
      status: LoanStatus.ACTIVE,
      dueAt,
      returnedAt: null,
      fineAmount: 0,
    };

    loansRepo.findOne.mockResolvedValue(loan);
    loansRepo.save.mockImplementation(async (l: Partial<Loan>) => l);

    const result = await service.returnLoan('loan-1', ACTOR);

    // 5 días × 0.50 = 2.50
    expect(result.fineAmount).toBe(2.5);
    expect(result.status).toBe(LoanStatus.RETURNED);
  });
});
