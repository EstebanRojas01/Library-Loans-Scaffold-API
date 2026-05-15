import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { FindItemsDto } from './dto/find-items.dto';
import { PaginatedResult } from '../users/users.service';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemsRepo: Repository<Item>,
  ) {}

  async create(dto: CreateItemDto): Promise<Item> {
    if (dto.isbn) {
      const existing = await this.itemsRepo.findOne({ where: { isbn: dto.isbn } });
      if (existing) {
        throw new ConflictException(`Item con ISBN ${dto.isbn} ya existe`);
      }
    }
    const copies = dto.totalCopies ?? 1;
    const item = this.itemsRepo.create({
      title: dto.title,
      author: dto.author,
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
        search: `%${search.toLowerCase()}%`,
      });
    }
    if (type) {
      qb.andWhere('i.type = :type', { type });
    }
    if (available !== undefined) {
      if (available) {
        qb.andWhere('i.availableCopies > 0');
      } else {
        qb.andWhere('i.availableCopies = 0');
      }
    }

    qb.orderBy('i.title', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: string): Promise<Item> {
    const item = await this.itemsRepo.findOne({ where: { id, isActive: true } });
    if (!item) {
      throw new NotFoundException(`Item ${id} no encontrado`);
    }
    return item;
  }

  async update(id: string, dto: UpdateItemDto): Promise<Item> {
    const item = await this.findById(id);

    if (dto.totalCopies !== undefined) {
      const diff = dto.totalCopies - item.totalCopies;
      const newAvailable = item.availableCopies + diff;
      if (newAvailable < 0) {
        throw new BadRequestException(
          'No se puede reducir totalCopies por debajo de los préstamos activos',
        );
      }
      item.availableCopies = newAvailable;
    }

    Object.assign(item, dto);
    return this.itemsRepo.save(item);
  }

  async softDelete(id: string): Promise<Item> {
    const item = await this.findById(id);
    item.isActive = false;
    return this.itemsRepo.save(item);
  }

  async decrementAvailable(id: string): Promise<void> {
    const item = await this.itemsRepo.findOne({ where: { id } });
    if (!item || item.availableCopies <= 0) {
      throw new ConflictException('No hay copias disponibles de este item');
    }
    await this.itemsRepo.decrement({ id }, 'availableCopies', 1);
  }

  async incrementAvailable(id: string): Promise<void> {
    await this.itemsRepo.increment({ id }, 'availableCopies', 1);
  }
}
