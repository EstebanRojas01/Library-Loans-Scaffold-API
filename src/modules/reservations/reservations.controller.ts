import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { FindReservationsDto } from './dto/find-reservations.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateReservationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reservationsService.create(dto, actor);
  }

  @Get()
  findAll(@Query() query: FindReservationsDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reservationsService.findAll(query, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.reservationsService.cancel(id, actor);
  }
}
