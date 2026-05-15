import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Reservation } from './entities/reservation.entity';
import { Loan } from '../loans/entities/loan.entity';
import { LoanStatus } from '../loans/enums/loan-status.enum';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { FindReservationsDto } from './dto/find-reservations.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PaginatedResult } from '../users/users.service';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(Loan)
    private readonly loanRepo: Repository<Loan>,
  ) {}

  async create(dto: CreateReservationDto, actor: AuthenticatedUser): Promise<Reservation> {
    // Solo members pueden reservar (admin/librarian gestionan directamente)
    const activeLoans = await this.loanRepo.count({
      where: [
        { itemId: dto.itemId, status: LoanStatus.ACTIVE },
        { itemId: dto.itemId, status: LoanStatus.OVERDUE },
      ],
    });

    if (activeLoans === 0) {
      throw new BadRequestException(
        'No se puede reservar un item que está disponible — solicita el préstamo directamente',
      );
    }

    // R-B1.1: sin reserva pendiente duplicada para mismo user+item
    const existing = await this.reservationRepo.findOne({
      where: {
        userId: actor.id,
        itemId: dto.itemId,
        cancelledAt: IsNull(),
      },
    });
    if (existing) {
      throw new ConflictException('Ya tienes una reserva activa para este item');
    }

    const reservation = this.reservationRepo.create({
      userId: actor.id,
      itemId: dto.itemId,
      fulfilledAt: null,
      cancelledAt: null,
      expiresAt: null,
    });
    return this.reservationRepo.save(reservation);
  }

  async findAll(
    query: FindReservationsDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<Reservation>> {
    const { page, limit } = query;
    const qb = this.reservationRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.item', 'item')
      .leftJoinAndSelect('r.user', 'user');

    if (actor.role === UserRole.MEMBER) {
      qb.andWhere('r.userId = :userId', { userId: actor.id });
    } else {
      if (query.userId) qb.andWhere('r.userId = :userId', { userId: query.userId });
      if (query.itemId) qb.andWhere('r.itemId = :itemId', { itemId: query.itemId });
    }

    qb.orderBy('r.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async cancel(id: string, actor: AuthenticatedUser): Promise<Reservation> {
    const reservation = await this.reservationRepo.findOne({ where: { id } });
    if (!reservation) {
      throw new NotFoundException(`Reserva ${id} no encontrada`);
    }

    if (actor.role === UserRole.MEMBER && reservation.userId !== actor.id) {
      throw new ForbiddenException('Solo puedes cancelar tus propias reservas');
    }

    if (reservation.cancelledAt) {
      throw new BadRequestException('La reserva ya fue cancelada');
    }

    reservation.cancelledAt = new Date();
    return this.reservationRepo.save(reservation);
  }

  async getBlockingReservations(itemId: string): Promise<Reservation[]> {
    return this.reservationRepo
      .createQueryBuilder('r')
      .where('r.itemId = :itemId', { itemId })
      .andWhere('r.cancelledAt IS NULL')
      .andWhere('(r.fulfilledAt IS NULL OR r.expiresAt > NOW())')
      .orderBy('r.createdAt', 'ASC')
      .getMany();
  }

  async fulfillFirst(itemId: string): Promise<void> {
    const first = await this.reservationRepo.findOne({
      where: { itemId, fulfilledAt: IsNull(), cancelledAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (!first) return;

    first.fulfilledAt = new Date();
    first.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await this.reservationRepo.save(first);
  }

  async consumeReservation(itemId: string, userId: string): Promise<void> {
    const reservation = await this.reservationRepo.findOne({
      where: { itemId, userId, cancelledAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (reservation) {
      reservation.cancelledAt = new Date();
      await this.reservationRepo.save(reservation);
    }
  }
}
