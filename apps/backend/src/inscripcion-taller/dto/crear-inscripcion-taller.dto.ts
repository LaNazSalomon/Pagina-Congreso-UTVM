import { IsEnum, IsUUID, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { ParticipanteTipo } from '../../participante-acceso/participante-tipo.enum';

export class CrearInscripcionTallerDto {
  @IsUUID('4', {
    message: 'El identificador del taller no es válido.',
  })
  tallerId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : value,
  )
  @IsString()
  @MaxLength(64)
  @Matches(
    /^(?:[1-9]\d*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  )
  participanteId!: string;

  @IsEnum(ParticipanteTipo, {
    message: 'El tipo de participante no es válido.',
  })
  tipoParticipante!: ParticipanteTipo;
}
