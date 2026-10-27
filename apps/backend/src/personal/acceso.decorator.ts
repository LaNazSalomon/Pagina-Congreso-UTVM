import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { SesionAcceso, UsuarioPersonal } from './entities/personal.entity';
import { RolPersonal } from './entities/personal.entity';

export const PUBLICO = 'acceso:publico';
export const ROLES = 'acceso:roles';
export const PROPIO = 'acceso:propio';
export const Publico = () => SetMetadata(PUBLICO, true);
export const Roles = (...roles: RolPersonal[]) => SetMetadata(ROLES, roles);
export interface AccesoPropioOptions {
  tipo?: string;
  idParam?: string;
  tipoBody?: string;
  idBody?: string;
  soloParticipante?: boolean;
}
export const AccesoPropio = (options: AccesoPropioOptions) =>
  SetMetadata(PROPIO, options);
export interface SolicitudAutenticada extends Request {
  personal?: UsuarioPersonal;
  sesion?: SesionAcceso;
  tokenSesion?: string;
}
