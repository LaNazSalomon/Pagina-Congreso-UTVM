import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Conferencia } from '../conferencia/entities/conferencia.entity';
import { Congreso } from '../congreso/entities/congreso.entity';
import { ParticipanteAccesoModule } from '../participante-acceso/participante-acceso.module';
import { InscripcionTaller } from '../taller/entities/inscripcion-taller.entity';
import { Taller } from '../taller/entities/taller.entity';
import { Reconocimiento } from './entities/reconocimiento.entity';
import { ReconocimientoPlantilla } from './entities/reconocimiento-plantilla.entity';
import { ReconocimientoPlantillasController } from './reconocimiento-plantillas.controller';
import { ReconocimientoController } from './reconocimiento.controller';
import { ReconocimientoService } from './reconocimiento.service';
import { ReconocimientoEmisionService } from './services/reconocimiento-emision.service';
import { ReconocimientoJobService } from './services/reconocimiento-job.service';
import { ReconocimientoRendererService } from './services/reconocimiento-renderer.service';
import { ReconocimientoPlantillasService } from './services/reconocimiento-plantillas.service';
import { ReconocimientoStorageService } from './services/reconocimiento-storage.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      Reconocimiento,
      ReconocimientoPlantilla,
      Congreso,
      Taller,
      Conferencia,
      InscripcionTaller,
    ]),
    ParticipanteAccesoModule,
  ],
  controllers: [ReconocimientoPlantillasController, ReconocimientoController],
  providers: [
    ReconocimientoService,
    ReconocimientoRendererService,
    ReconocimientoPlantillasService,
    ReconocimientoStorageService,
    ReconocimientoEmisionService,
    ReconocimientoJobService,
  ],
  exports: [ReconocimientoService, ReconocimientoRendererService],
})
export class ReconocimientoModule {}
