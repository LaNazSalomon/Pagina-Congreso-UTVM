import { Transform } from 'class-transformer';
import { IntersectionType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  ValidateIf,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RolPersonal } from '../entities/personal.entity';

export class CorreoPersonalDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  correo!: string;
}
export class EntrarPersonalDto extends CorreoPersonalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  contrasena!: string;
}
export class NuevaContrasenaPersonalDto {
  @IsString()
  @MinLength(8, {
    message: 'La nueva contraseña debe tener al menos 8 caracteres.',
  })
  @MaxLength(128, {
    message: 'La nueva contraseña debe tener como máximo 128 caracteres.',
  })
  @Matches(/\p{Lu}/u, {
    message: 'La nueva contraseña debe incluir una mayúscula.',
  })
  @Matches(/\p{Ll}/u, {
    message: 'La nueva contraseña debe incluir una minúscula.',
  })
  @Matches(/[0-9]/, { message: 'La nueva contraseña debe incluir un número.' })
  @Matches(/[\p{P}\p{S}]/u, {
    message: 'La nueva contraseña debe incluir un signo, por ejemplo !, @ o #.',
  })
  nuevaContrasena!: string;
}
// Compatibilidad con contraseñas temporales emitidas antes del flujo de enlaces.
export class CambiarContrasenaPersonalDto extends IntersectionType(
  EntrarPersonalDto,
  NuevaContrasenaPersonalDto,
) {}
export class TokenContrasenaPersonalDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, {
    message: 'El enlace de contraseña no es válido.',
  })
  token!: string;
}
export class RestablecerContrasenaPersonalDto extends NuevaContrasenaPersonalDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, {
    message: 'El enlace de contraseña no es válido.',
  })
  token!: string;
}
export class CrearAdministradorInicialDto extends CorreoPersonalDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;
}
export class CrearPersonalDto extends CrearAdministradorInicialDto {
  @IsEnum(RolPersonal) rol!: RolPersonal;
}
export class ActualizarPersonalDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(RolPersonal)
  rol?: RolPersonal;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  activo?: boolean;
}
