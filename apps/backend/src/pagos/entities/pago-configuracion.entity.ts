import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Congreso } from '../../congreso/entities/congreso.entity';

@Entity('pago_configuracion')
export class PagoConfiguracion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @OneToOne(() => Congreso, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'congreso_id' })
  congreso!: Congreso;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 250 })
  tarifa_externo!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 100 })
  tarifa_nsu!: number;

  @Column({ type: 'varchar', length: 120, nullable: true }) banco!:
    | string
    | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) beneficiario!:
    | string
    | null;
  @Column({ type: 'varchar', length: 18, nullable: true }) clabe!:
    | string
    | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) numero_tarjeta!:
    | string
    | null;
  @Column({ type: 'varchar', length: 180, nullable: true }) concepto!:
    | string
    | null;

  @UpdateDateColumn({ name: 'updated_at' }) updated_at!: Date;
}
