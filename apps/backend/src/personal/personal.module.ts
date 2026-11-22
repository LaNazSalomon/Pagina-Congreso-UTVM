import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CorreoModule } from '../correo/correo.module';
import { AccesoGuard } from './acceso.guard';
import {
  CodigoPersonal,
  EnlaceContrasenaPersonal,
  SesionAcceso,
  UsuarioPersonal,
} from './entities/personal.entity';
import { PersonalController } from './personal.controller';
import { PersonalService } from './personal.service';
import { SesionesService } from './sesiones.service';

@Global()
// Por defecto la API exige Administrador. Publico, Roles y AccesoPropio
// declaran las excepciones en los controladores correspondientes.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UsuarioPersonal,
      CodigoPersonal,
      SesionAcceso,
      EnlaceContrasenaPersonal,
    ]),
    CorreoModule,
  ],
  controllers: [PersonalController],
  providers: [
    PersonalService,
    SesionesService,
    { provide: APP_GUARD, useClass: AccesoGuard },
  ],
  exports: [SesionesService],
})
export class PersonalModule {}
