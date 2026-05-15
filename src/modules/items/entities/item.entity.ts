import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ItemType {
  BOOK = 'book',
  MAGAZINE = 'magazine',
  DVD = 'dvd',
  OTHER = 'other',
}

@Entity({ name: 'items' })
export class Item {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255 })
  author!: string;

  @Column({ type: 'enum', enum: ItemType, default: ItemType.BOOK })
  type!: ItemType;

  @Index({ unique: true, sparse: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  isbn!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int', default: 1 })
  totalCopies!: number;

  @Column({ type: 'int', default: 1 })
  availableCopies!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  get isAvailable(): boolean {
    return this.availableCopies > 0;
  }
}
