import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Congreso } from '../../congreso/entities/congreso.entity';
import { ReconocimientoTipo } from '../enums/reconocimiento-tipo.enum';
import type { RecognitionLayout } from '../services/reconocimiento-layout';

@Entity('reconocimiento_plantilla')
@Unique('uq_reconocimiento_plantilla_version', ['congreso', 'tipo', 'version'])
export class ReconocimientoPlantilla {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Congreso, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'congreso_id' })
  congreso!: Congreso;

  @Column({ type: 'enum', enum: ReconocimientoTipo })
  tipo!: ReconocimientoTipo;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'jsonb' })
  layout!: RecognitionLayout;

  // Columna heredada: se vacía al trasladar las plantillas previas a Storage.
  @Column({ type: 'bytea', nullable: true, select: false })
  imagen?: Buffer | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imagen_path?: string | null;

  @Column({ type: 'boolean', default: false })
  activa!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  activada_en!: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;
}
