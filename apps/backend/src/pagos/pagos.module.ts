import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Congreso } from '../congreso/entities/congreso.entity';
import { PagoConfiguracion } from './entities/pago-configuracion.entity';
import { PagoDocumento } from './entities/pago-documento.entity';
import { PagoStorageService } from './pago-storage.service';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Congreso, PagoConfiguracion, PagoDocumento]),
  ],
  controllers: [PagosController],
  providers: [PagosService, PagoStorageService],
  exports: [PagosService],
})
export class PagosModule {}
