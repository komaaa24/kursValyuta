import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "../config/env";
import { User } from "../entities/User";
import { CurrencyRate } from "../entities/CurrencyRate";
import { RateAlert } from "../entities/RateAlert";
import { Payment } from "../entities/Payment";

export const appDataSource = new DataSource({
  type: "postgres",
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  synchronize: true, // Enable migrations for production deployments
  logging: false,
  entities: [User, CurrencyRate, RateAlert, Payment],
});
