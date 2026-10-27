import { AccesoPropio, Publico } from '../personal/acceso.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseArrayPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { UtvmService } from './utvm.service';
import { CreateUtvmDto } from './dto/create-utvm.dto';
import { UpdateUtvmDto } from './dto/update-utvm.dto';
import { EnviarQrAccesoDto } from '../participante-qr/dto/enviar-qr-acceso.dto';

@Controller('utvm')
export class UtvmController {
  constructor(private readonly utvmService: UtvmService) {}

  @Publico()
  @Post()
  create(@Body() createUtvmDto: CreateUtvmDto) {
    return this.utvmService.create(createUtvmDto);
  }

  @Publico()
  @Post('multiple')
  createMany(
    @Body(
      new ParseArrayPipe({
        items: CreateUtvmDto,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    participantes: CreateUtvmDto[],
  ) {
    return this.utvmService.createMany(participantes);
  }

  @Post(':id/qr-acceso/enviar')
  enviarQrAcceso(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnviarQrAccesoDto,
  ) {
    return this.utvmService.enviarQrAcceso(id, dto);
  }

  @AccesoPropio({ tipo: 'UTVM', idParam: 'id' })
  @Post(':id/qr-acceso/enviar-automatico')
  enviarQrAccesoAutomatico(@Param('id', ParseIntPipe) id: number) {
    return this.utvmService.enviarQrAccesoAutomatico(id);
  }

  @Get()
  findAll() {
    return this.utvmService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.utvmService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUtvmDto: UpdateUtvmDto) {
    return this.utvmService.update(+id, updateUtvmDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.utvmService.remove(+id);
  }

  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.utvmService.restore(+id);
  }
}
