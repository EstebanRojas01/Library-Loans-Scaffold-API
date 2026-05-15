import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Item } from '../../items/entities/item.entity';

@Entity({ name: 'reservations' })
@Index(['itemId', 'userId'])
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Index()
  @Column({ type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => Item, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'itemId' })
  item?: Item;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fulfilledAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;
}
