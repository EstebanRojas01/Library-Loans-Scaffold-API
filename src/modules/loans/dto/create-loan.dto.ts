import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateLoanDto {
  @ApiProperty({ description: 'UUID del item a prestar' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ description: 'Fecha de vencimiento (ISO 8601). Debe ser > ahora y ≤ 30 días.', example: '2026-06-14T00:00:00.000Z' })
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional({
    description: 'UUID del usuario (solo admin/librarian pueden prestar en nombre de otro)',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
