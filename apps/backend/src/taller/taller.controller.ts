import { Publico } from '../personal/acceso.decorator';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { TallerService } from './services/taller.service';
import { CreateTallerDto } from './dto/create-taller.dto';
import { UpdateTallerDto } from './dto/update-taller.dto';

@Controller('taller')
export class TallerController {
  constructor(private readonly tallerService: TallerService) {}

  @Post()
  create(@Body() createTallerDto: CreateTallerDto) {
    return this.tallerService.createTaller(createTallerDto);
  }

  @Publico()
  @Get()
  findAll(@Query('congresoId', new ParseUUIDPipe({ optional: true })) congresoId?: string) {
    return this.tallerService.findAllTalleres(congresoId);
  }

  @Publico()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tallerService.findOneTaller(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTallerDto: UpdateTallerDto,
  ) {
    return this.tallerService.updateTaller(id, updateTallerDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tallerService.removeTaller(id);
  }
}
