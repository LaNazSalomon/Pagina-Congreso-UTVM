import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RegistroNsu } from './registro-nsu.entity';
import { Congreso } from '../../congreso/entities/congreso.entity';

@Entity('participante_nsu')
export class ParticipanteNsu {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'boolean', default: false })
  es_tutor!: boolean;

  @Column({ type: 'boolean', default: false })
  correo_verificado!: boolean;

  @Column({ type: 'varchar', length: 200 })
  nombre_completo!: string;

  @Column({ type: 'varchar', length: 150 })
  correo!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  correo_original!: string | null;

  @Column({ type: 'varchar', length: 200 })
  institucion!: string;

  @Column({ type: 'varchar', length: 200 })
  carrera!: string;

  @Column({ type: 'varchar', length: 20 })
  telefono!: string;

  @Column({ type: 'text' })
  dias!: string;

  @Column({ type: 'uuid', name: 'congreso_id', nullable: true })
  congresoId!: string | null;

  @ManyToOne(() => Congreso, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'congreso_id' })
  congreso?: Congreso | null;

  @Column('uuid', { array: true, nullable: true })
  diaEventoIds!: string[] | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  monto_individual!: number;

  @Column({ type: 'varchar', length: 30, default: 'PENDIENTE' })
  estado_pago!: string;

  @ManyToOne(() => RegistroNsu, (registro) => registro.participantes, {
    onDelete: 'CASCADE',
  })
  registro!: RegistroNsu;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updated_at!: Date;

  @DeleteDateColumn({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deleted_at?: Date;
}
