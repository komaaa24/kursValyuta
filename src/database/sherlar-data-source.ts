import { DataSource } from "typeorm";
import { env } from "../config/env";

export const sherlarDataSource = new DataSource({
  type: "postgres",
  host: env.sherlarDb.host,
  port: env.sherlarDb.port,
  username: env.sherlarDb.username,
  password: env.sherlarDb.password,
  database: env.sherlarDb.database,
  synchronize: false,
  logging: false,
  entities: [],
});
