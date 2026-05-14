import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateLoanDto {
  @ApiProperty({ description: 'UUID del item a prestar' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({
    description: 'UUID del usuario (solo admin/librarian pueden prestar en nombre de otro)',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
