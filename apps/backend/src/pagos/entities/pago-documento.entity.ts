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

@Entity('pago_documento')
@Unique(['congreso', 'version'])
export class PagoDocumento {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Congreso, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'congreso_id' })
  congreso!: Congreso;
  @Column({ type: 'int' }) version!: number;
  @Column({ type: 'varchar', length: 255 }) path!: string;
  @Column({ default: false }) activo!: boolean;
  @Column({ type: 'timestamp', nullable: true }) activado_en!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) created_at!: Date;
}
