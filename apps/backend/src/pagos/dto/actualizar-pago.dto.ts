import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { POSTGRES_NUMERIC_10_2_MAX } from '../../common/database/postgres-limits.constant';

export class ActualizarPagoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(POSTGRES_NUMERIC_10_2_MAX)
  tarifa_externo!: number;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(POSTGRES_NUMERIC_10_2_MAX)
  tarifa_nsu!: number;
  @IsOptional() @IsString() @MaxLength(120) banco?: string;
  @IsOptional() @IsString() @MaxLength(160) beneficiario?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{18})?$/, { message: 'La CLABE debe contener 18 dígitos.' })
  clabe?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{16})?$/, {
    message: 'El número de tarjeta de débito debe contener 16 dígitos.',
  })
  numero_tarjeta?: string;
  @IsOptional() @IsString() @MaxLength(180) concepto?: string;
}
