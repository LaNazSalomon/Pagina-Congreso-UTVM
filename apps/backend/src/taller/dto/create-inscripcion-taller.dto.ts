import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { ParticipanteTipo } from '../../participante-acceso/participante-tipo.enum';

export class CreateInscripcionTallerDto {
  @IsEnum(ParticipanteTipo)
  tipoParticipante!: ParticipanteTipo;

  // AccesoGuard exige que coincidan con la sesión del participante.
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  referenciaId!: string;
}
