import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DiaEvento } from '../../dia-evento/entities/dia-evento.entity';
import { ParticipanteAcceso } from '../../participante-acceso/entities/participante-acceso.entity';
import { UsuarioPersonal } from '../../personal/entities/personal.entity';

@Entity('dia_participante')
@Check(
  'chk_dia_participante_ingreso',
  '"acceso_utilizado" = FALSE OR "fecha_ingreso" IS NOT NULL',
)
@Index('idx_dia_participante_dia', ['dia_evento_id'])
export class DiaParticipante {
  @PrimaryColumn('uuid')
  participante_id!: string;

  @PrimaryColumn('uuid')
  dia_evento_id!: string;

  @ManyToOne(() => ParticipanteAcceso, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participante_id' })
  participante!: ParticipanteAcceso;

  @ManyToOne(() => DiaEvento, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dia_evento_id' })
  dia_evento!: DiaEvento;

  @Column({ type: 'boolean', default: false })
  acceso_utilizado!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  fecha_ingreso!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  validador_id!: string | null;

  @ManyToOne(() => UsuarioPersonal, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'validador_id' })
  validador!: UsuarioPersonal | null;

  @UpdateDateColumn({ type: 'timestamp', name: 'fecha_actualizacion' })
  fecha_actualizacion!: Date;
}
