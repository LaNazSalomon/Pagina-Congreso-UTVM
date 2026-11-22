import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '../common/common.module';
import { Congreso } from '../congreso/entities/congreso.entity';
import { DiaEventoController } from './dia-evento.controller';
import { DiaEventoService } from './dia-evento.service';
import { DiaEvento } from './entities/dia-evento.entity';
import { PagosModule } from '../pagos/pagos.module';

@Module({
  imports: [TypeOrmModule.forFeature([DiaEvento, Congreso]), CommonModule, PagosModule],
  controllers: [DiaEventoController],
  providers: [DiaEventoService],
  exports: [DiaEventoService, TypeOrmModule],
})
export class DiaEventoModule {}
