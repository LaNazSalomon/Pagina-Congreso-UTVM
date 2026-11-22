import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RolPersonal {
  ADMINISTRADOR = 'ADMINISTRADOR',
  VALIDADOR = 'VALIDADOR',
}

@Entity('usuario_personal')
@Check('chk_personal_rol', `rol IN ('ADMINISTRADOR', 'VALIDADOR')`)
export class UsuarioPersonal {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 150 }) nombre!: string;
  @Index({ unique: true })
  @Column({ length: 254 })
  correo!: string;
  @Column({ type: 'varchar', length: 20 }) rol!: RolPersonal;
  @Column({ default: true }) activo!: boolean;
  @Column({ default: false }) correoVerificado!: boolean;
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  contrasenaHash!: string | null;
  @Column({ default: false }) contrasenaConfigurada!: boolean;
  @Column({ default: false }) cambiarContrasena!: boolean;
  @Column({ type: 'timestamptz', nullable: true })
  contrasenaTemporalExpiraEn!: Date | null;
  @Column({ default: 0 }) intentosAcceso!: number;
  @Column({ type: 'timestamptz', nullable: true }) bloqueoHasta!: Date | null;
  @Column({ default: 1 }) version!: number;
  @CreateDateColumn({ type: 'timestamptz' }) creadoEn!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) actualizadoEn!: Date;
}

@Entity('sesion_acceso')
@Check(
  'chk_sesion_identidad',
  '(usuario_id IS NOT NULL AND "tipoParticipante" IS NULL AND "referenciaId" IS NULL) OR (usuario_id IS NULL AND "tipoParticipante" IS NOT NULL AND "referenciaId" IS NOT NULL)',
)
export class SesionAcceso {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true })
  @Column({ length: 64, select: false })
  tokenHash!: string;
  @Index()
  @Column({ type: 'uuid', name: 'usuario_id', nullable: true })
  usuarioId!: string | null;
  @ManyToOne(() => UsuarioPersonal, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: UsuarioPersonal | null;
  @Column({ default: 0 }) version!: number;
  @Column({ type: 'varchar', length: 20, nullable: true }) tipoParticipante!:
    | string
    | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) referenciaId!:
    | string
    | null;
  @Column({ type: 'timestamptz' }) expiraEn!: Date;
  @Column({ type: 'timestamptz', nullable: true }) revocadaEn!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) creadoEn!: Date;
}

@Entity('codigo_personal')
export class CodigoPersonal {
  @PrimaryColumn('uuid', { name: 'usuario_id' }) usuarioId!: string;
  @ManyToOne(() => UsuarioPersonal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: UsuarioPersonal;
  @Column({ length: 255, select: false }) codigoHash!: string;
  @Column() version!: number;
  @Column({ type: 'timestamptz' }) expiraEn!: Date;
  @Column({ type: 'timestamptz' }) enviadoEn!: Date;
  @Column({ default: 0 }) intentos!: number;
  @Column({ default: false }) utilizado!: boolean;
}

@Entity('enlace_contrasena_personal')
export class EnlaceContrasenaPersonal {
  @PrimaryColumn('uuid', { name: 'usuario_id' }) usuarioId!: string;
  @ManyToOne(() => UsuarioPersonal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: UsuarioPersonal;
  @Index({ unique: true })
  @Column({ length: 64, select: false })
  tokenHash!: string;
  @Column() version!: number;
  @Column({ type: 'timestamptz' }) expiraEn!: Date;
  @Column({ type: 'timestamptz' }) enviadoEn!: Date;
  @Column({ default: false }) utilizado!: boolean;
}
