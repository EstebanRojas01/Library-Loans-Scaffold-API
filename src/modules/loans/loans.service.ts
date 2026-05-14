import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Loan } from './entities/loan.entity';
import { LoanStatus, ALLOWED_TRANSITIONS } from './enums/loan-status.enum';
import { CreateLoanDto } from './dto/create-loan.dto';
import { FindLoansDto } from './dto/find-loans.dto';
import { ItemsService } from '../items/items.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../users/users.service';

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan)
    private readonly loansRepo: Repository<Loan>,
    private readonly itemsService: ItemsService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateLoanDto, actor: AuthenticatedUser): Promise<Loan> {
    const targetUserId =
      (actor.role === UserRole.ADMIN || actor.role === UserRole.LIBRARIAN) && dto.userId
        ? dto.userId
        : actor.id;

    await this.usersService.findById(targetUserId);

    const maxActive = this.configService.get<number>('loans.maxActivePerUser', 3);
    const activeCount = await this.loansRepo.count({
      where: [
        { userId: targetUserId, status: LoanStatus.ACTIVE },
        { userId: targetUserId, status: LoanStatus.OVERDUE },
      ],
    });
    if (activeCount >= maxActive) {
      throw new BadRequestException(
        `El usuario ya tiene ${activeCount} préstamos activos (máximo: ${maxActive})`,
      );
    }

    await this.itemsService.decrementAvailable(dto.itemId);

    const maxLoanDays = this.configService.get<number>('loans.maxLoanDays', 30);
    const loanedAt = new Date();
    const dueAt = new Date(loanedAt.getTime() + maxLoanDays * 24 * 60 * 60 * 1000);

    const loan = this.loansRepo.create({
      userId: targetUserId,
      itemId: dto.itemId,
      loanedAt,
      dueAt,
      status: LoanStatus.ACTIVE,
      returnedAt: null,
      fineAmount: null,
    });

    return this.loansRepo.save(loan);
  }

  async findAll(query: FindLoansDto, actor: AuthenticatedUser): Promise<PaginatedResult<Loan>> {
    const { page, limit, status, itemId } = query;
    const qb = this.loansRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.item', 'item')
      .leftJoinAndSelect('l.user', 'user');

    if (actor.role === UserRole.MEMBER) {
      qb.andWhere('l.userId = :userId', { userId: actor.id });
    } else if (query.userId) {
      qb.andWhere('l.userId = :userId', { userId: query.userId });
    }

    if (itemId) {
      qb.andWhere('l.itemId = :itemId', { itemId });
    }
    if (status) {
      qb.andWhere('l.status = :status', { status });
    }

    qb.orderBy('l.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: string, actor: AuthenticatedUser): Promise<Loan> {
    const loan = await this.loansRepo.findOne({
      where: { id },
      relations: ['item', 'user'],
    });
    if (!loan) {
      throw new NotFoundException(`Préstamo ${id} no encontrado`);
    }
    if (actor.role === UserRole.MEMBER && loan.userId !== actor.id) {
      throw new ForbiddenException('Acceso denegado');
    }
    return loan;
  }

  async returnLoan(id: string, actor: AuthenticatedUser): Promise<Loan> {
    const loan = await this.findById(id, actor);

    if (actor.role === UserRole.MEMBER && loan.userId !== actor.id) {
      throw new ForbiddenException('Solo puede devolver sus propios préstamos');
    }

    this.assertTransition(loan.status, LoanStatus.RETURNED);

    const returnedAt = new Date();
    loan.returnedAt = returnedAt;
    loan.status = LoanStatus.RETURNED;

    if (returnedAt > loan.dueAt) {
      const dailyFine = this.configService.get<number>('loans.dailyFineRate', 0.5);
      const overdueDays = Math.ceil(
        (returnedAt.getTime() - loan.dueAt.getTime()) / (24 * 60 * 60 * 1000),
      );
      loan.fineAmount = parseFloat((overdueDays * dailyFine).toFixed(2));
    }

    await this.itemsService.incrementAvailable(loan.itemId);
    return this.loansRepo.save(loan);
  }

  async markOverdue(id: string): Promise<Loan> {
    const loan = await this.loansRepo.findOne({ where: { id } });
    if (!loan) {
      throw new NotFoundException(`Préstamo ${id} no encontrado`);
    }
    this.assertTransition(loan.status, LoanStatus.OVERDUE);
    loan.status = LoanStatus.OVERDUE;
    return this.loansRepo.save(loan);
  }

  async markAllOverdue(): Promise<number> {
    const now = new Date();
    const result = await this.loansRepo
      .createQueryBuilder()
      .update(Loan)
      .set({ status: LoanStatus.OVERDUE })
      .where('status = :status', { status: LoanStatus.ACTIVE })
      .andWhere('dueAt < :now', { now })
      .execute();
    return result.affected ?? 0;
  }

  private assertTransition(current: LoanStatus, next: LoanStatus): void {
    const allowed = ALLOWED_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Transición inválida: ${current} → ${next}. Permitidas: ${allowed.join(', ') || 'ninguna'}`,
      );
    }
  }
}
