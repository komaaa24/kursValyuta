import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { bigintTransformer } from "./transformers";

export type AlertDirection = "above" | "below";

@Entity({ name: "rate_alerts" })
export class RateAlert {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "bigint", transformer: bigintTransformer })
  telegramId!: number;

  @Column()
  base!: string;

  @Column()
  quote!: string;

  @Column("numeric", { precision: 18, scale: 6 })
  targetRate!: string;

  @Column({ type: "varchar", length: 5, default: "above" })
  direction!: AlertDirection;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @Column({ type: "timestamp with time zone", nullable: true })
  triggeredAt?: Date;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;
}
