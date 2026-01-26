"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sherlarDataSource = void 0;
const typeorm_1 = require("typeorm");
const env_1 = require("../config/env");
exports.sherlarDataSource = new typeorm_1.DataSource({
    type: "postgres",
    host: env_1.env.sherlarDb.host,
    port: env_1.env.sherlarDb.port,
    username: env_1.env.sherlarDb.username,
    password: env_1.env.sherlarDb.password,
    database: env_1.env.sherlarDb.database,
    synchronize: false,
    logging: false,
    entities: [],
});
//# sourceMappingURL=sherlar-data-source.js.map