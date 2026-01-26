import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "currency_rates" })
export class CurrencyRate {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  base!: string;

  @Column()
  quote!: string;

  @Column("numeric", { precision: 18, scale: 6 })
  rate!: string;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;
}
