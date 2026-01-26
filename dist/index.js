"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./config/env");
const bot_1 = require("./bot/bot");
const data_source_1 = require("./database/data-source");
const CurrencyRate_1 = require("./entities/CurrencyRate");
const Payment_1 = require("./entities/Payment");
const RateAlert_1 = require("./entities/RateAlert");
const User_1 = require("./entities/User");
const currencyService_1 = require("./services/currencyService");
const server_1 = require("./webhook/server");
const bootstrap = async () => {
    await data_source_1.appDataSource.initialize();
    console.log("Database connected");
    const userRepository = data_source_1.appDataSource.getRepository(User_1.User);
    const currencyService = new currencyService_1.CurrencyService(data_source_1.appDataSource.getRepository(CurrencyRate_1.CurrencyRate));
    const alertRepository = data_source_1.appDataSource.getRepository(RateAlert_1.RateAlert);
    const paymentRepository = data_source_1.appDataSource.getRepository(Payment_1.Payment);
    await currencyService.pullLatestRates(env_1.env.rateApiUrl);
    console.log("Initial rates synced from remote API");
    const bot = (0, bot_1.createBot)(env_1.env.botToken, { userRepository, currencyService, alertRepository, paymentRepository });
    const webhookServer = (0, server_1.startWebhookServer)(env_1.env.webhookPort, {
        bot,
        paymentRepository,
        userRepository,
        proDurationDays: env_1.env.proDurationDays,
    });
    process.once("SIGINT", () => {
        webhookServer.close();
        bot.stop();
    });
    process.once("SIGTERM", () => {
        webhookServer.close();
        bot.stop();
    });
    console.log("Bot is starting...");
    await bot.start();
};
bootstrap().catch((err) => {
    console.error("Failed to bootstrap application", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map