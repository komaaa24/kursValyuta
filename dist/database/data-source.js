"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appDataSource = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const env_1 = require("../config/env");
const User_1 = require("../entities/User");
const CurrencyRate_1 = require("../entities/CurrencyRate");
const RateAlert_1 = require("../entities/RateAlert");
const Payment_1 = require("../entities/Payment");
exports.appDataSource = new typeorm_1.DataSource({
    type: "postgres",
    host: env_1.env.db.host,
    port: env_1.env.db.port,
    username: env_1.env.db.username,
    password: env_1.env.db.password,
    database: env_1.env.db.database,
    synchronize: true, // Enable migrations for production deployments
    logging: false,
    entities: [User_1.User, CurrencyRate_1.CurrencyRate, RateAlert_1.RateAlert, Payment_1.Payment],
});
//# sourceMappingURL=data-source.js.map