import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { Loan } from '../loans/entities/loan.entity';
import { LoanStatus } from '../loans/enums/loan-status.enum';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { FindItemsDto } from './dto/find-items.dto';
import { PaginatedResult } from '../users/users.service';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemsRepo: Repository<Item>,
    @InjectRepository(Loan)
    private readonly loanRepo: Repository<Loan>,
  ) {}

  async create(dto: CreateItemDto): Promise<Item> {
    const existing = await this.itemsRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Item con código ${dto.code} ya existe`);
    }
    const copies = dto.totalCopies ?? 1;
    const item = this.itemsRepo.create({
      code: dto.code,
      title: dto.title,
      author: dto.author ?? null,
      type: dto.type,
      isbn: dto.isbn ?? null,
      description: dto.description ?? null,
      totalCopies: copies,
      availableCopies: copies,
    });
    return this.itemsRepo.save(item);
  }

  async findAll(query: FindItemsDto): Promise<PaginatedResult<Item>> {
    const { page, limit, search, type, available } = query;
    const qb = this.itemsRepo.createQueryBuilder('i').where('i.isActive = true');

    if (search) {
      qb.andWhere('(LOWER(i.title) LIKE :search OR LOWER(i.author) LIKE :search)', {
        { search: `%${search.toLowerCase()}%` },
      );
    }
    if (type) {
      qb.andWhere('i.type = :type', { type });
    }
    if (available !== undefined) {
      const sub = `(SELECT COUNT(*) FROM loans l WHERE l."itemId" = i.id AND l.status IN ('active', 'overdue'))`;
      qb.andWhere(available ? `(${sub}) = 0` : `(${sub}) > 0`);
    }

    qb.orderBy('i.title', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    if (data.length > 0) {
      const itemIds = data.map((i) => i.id);
      const occupied = await this.loanRepo.find({
        select: { itemId: true },
        where: [
          { itemId: In(itemIds), status: LoanStatus.ACTIVE },
          { itemId: In(itemIds), status: LoanStatus.OVERDUE },
        ],
      });
      const occupiedSet = new Set(occupied.map((l) => l.itemId));
      data.forEach((item) => {
        item.isAvailable = !occupiedSet.has(item.id);
      });
    }

    return { data, total, page, limit };
  }

  async findById(id: string): Promise<Item> {
    const item = await this.itemsRepo.findOne({ where: { id, isActive: true } });
    if (!item) {
      throw new NotFoundException(`Item ${id} no encontrado`);
    }
    const count = await this.loanRepo.count({
      where: [
        { itemId: id, status: LoanStatus.ACTIVE },
        { itemId: id, status: LoanStatus.OVERDUE },
      ],
    });
    item.isAvailable = count === 0;
    return item;
  }

  async update(id: string, dto: UpdateItemDto): Promise<Item> {
    const item = await this.findById(id);
    Object.assign(item, dto);
    return this.itemsRepo.save(item);
  }

  async softDelete(id: string): Promise<Item> {
    const item = await this.findById(id);
    item.isActive = false;
    return this.itemsRepo.save(item);
  }

  async decrementAvailable(id: string): Promise<void> {
    await this.itemsRepo.decrement({ id }, 'availableCopies', 1);
  }

  async incrementAvailable(id: string): Promise<void> {
    await this.itemsRepo.increment({ id }, 'availableCopies', 1);
  }
}
