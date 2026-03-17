import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

@Entity("poems")
@Index(["author"])
export class Poem {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "varchar", unique: true })
    externalId!: string;

    @Column({ type: "varchar", nullable: true })
    author?: string;

    @Column({ type: "varchar", nullable: true })
    title?: string;

    @Column({ type: "text" })
    content!: string;

    @Column({ type: "int", default: 0 })
    views!: number;

    @Column({ type: "int", default: 0 })
    likes!: number;

    @Column({ type: "int", default: 0 })
    dislikes!: number;

    @CreateDateColumn()
    createdAt!: Date;
}