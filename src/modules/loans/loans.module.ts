import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loan } from './entities/loan.entity';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { ItemsModule } from '../items/items.module';
import { UsersModule } from '../users/users.module';
import { ReservationsModule } from '../reservations/reservations.module';

@Module({
  imports: [TypeOrmModule.forFeature([Loan]), ItemsModule, UsersModule, ReservationsModule],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
