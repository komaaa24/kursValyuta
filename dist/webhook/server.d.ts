import { Server } from "http";
import { Bot } from "grammy";
import { Repository } from "typeorm";
import { Payment } from "../entities/Payment";
import { User } from "../entities/User";
type WebhookDeps = {
    bot: Bot;
    paymentRepository: Repository<Payment>;
    userRepository: Repository<User>;
    proDurationDays: number;
};
export declare const startWebhookServer: (port: number, deps: WebhookDeps) => Server;
export {};
//# sourceMappingURL=server.d.ts.map