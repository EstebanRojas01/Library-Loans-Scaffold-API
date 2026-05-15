import {
  BadRequestException,
  ConflictException,
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
import { ReservationsService } from '../reservations/reservations.service';
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
    private readonly reservationsService: ReservationsService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateLoanDto, actor: AuthenticatedUser): Promise<Loan> {
    const targetUserId =
      (actor.role === UserRole.ADMIN || actor.role === UserRole.LIBRARIAN) && dto.userId
        ? dto.userId
        : actor.id;

    await this.usersService.findById(targetUserId);

    // R1: dueAt debe ser posterior a ahora y no superar 30 días
    const loanedAt = new Date();
    const dueAt = new Date(dto.dueAt);
    const maxLoanDays = this.configService.get<number>('loans.maxLoanDays', 30);
    const maxDueAt = new Date(loanedAt.getTime() + maxLoanDays * 24 * 60 * 60 * 1000);

    if (dueAt <= loanedAt) {
      throw new BadRequestException('dueAt debe ser posterior a la fecha actual');
    }
    if (dueAt > maxDueAt) {
      throw new BadRequestException(`dueAt no puede superar ${maxLoanDays} días desde hoy`);
    }

    // R3: máximo préstamos activos/vencidos por usuario
    const maxActive = this.configService.get<number>('loans.maxActivePerUser', 3);
    const activeCount = await this.loansRepo.count({
      where: [
        { userId: targetUserId, status: LoanStatus.ACTIVE },
        { userId: targetUserId, status: LoanStatus.OVERDUE },
      ],
    });
    if (activeCount >= maxActive) {
      throw new ConflictException(
        `El usuario ya tiene ${activeCount} préstamos activos (máximo: ${maxActive})`,
      );
    }

    // R2: item disponible — no debe tener préstamo activo u overdue
    const existingLoan = await this.loansRepo.findOne({
      where: [
        { itemId: dto.itemId, status: LoanStatus.ACTIVE },
        { itemId: dto.itemId, status: LoanStatus.OVERDUE },
      ],
    });
    if (existingLoan) {
      throw new ConflictException(`El item ya está prestado (loanId: ${existingLoan.id})`);
    }

    await this.itemsService.findById(dto.itemId);

    // R-B1.4: si hay reservas activas, solo el primero de la cola puede tomar el préstamo
    const blocking = await this.reservationsService.getBlockingReservations(dto.itemId);
    if (blocking.length > 0 && blocking[0].userId !== targetUserId) {
      throw new ForbiddenException(
        `El item tiene una reserva activa de otro usuario (reservationId: ${blocking[0].id})`,
      );
    }
    if (blocking.length > 0 && blocking[0].userId === targetUserId) {
      await this.reservationsService.consumeReservation(dto.itemId, targetUserId);
    }

    const loan = this.loansRepo.create({
      userId: targetUserId,
      itemId: dto.itemId,
      loanedAt,
      dueAt,
      status: LoanStatus.ACTIVE,
      returnedAt: null,
      fineAmount: 0,
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

    const dailyFine = this.configService.get<number>('loans.dailyFineRate', 0.5);
    const overdueDays = Math.max(
      0,
      Math.ceil((returnedAt.getTime() - loan.dueAt.getTime()) / (24 * 60 * 60 * 1000)),
    );
    loan.fineAmount = parseFloat((overdueDays * dailyFine).toFixed(2));

    const returned = await this.loansRepo.save(loan);

    // R-B1.2: notificar al primer usuario en cola de reservas
    await this.reservationsService.fulfillFirst(returned.itemId);

    return returned;
  }

  async markLost(id: string, actor: AuthenticatedUser): Promise<Loan> {
    const loan = await this.findById(id, actor);
    this.assertTransition(loan.status, LoanStatus.LOST);
    loan.status = LoanStatus.LOST;
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
