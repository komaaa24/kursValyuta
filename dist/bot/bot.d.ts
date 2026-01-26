import { Bot, Context } from "grammy";
import { Repository } from "typeorm";
import { Payment } from "../entities/Payment";
import { RateAlert } from "../entities/RateAlert";
import { User } from "../entities/User";
import { CurrencyService } from "../services/currencyService";
type Dependencies = {
    userRepository: Repository<User>;
    currencyService: CurrencyService;
    alertRepository: Repository<RateAlert>;
    paymentRepository: Repository<Payment>;
};
export declare const createBot: (token: string, deps: Dependencies) => Bot<Context>;
export {};
//# sourceMappingURL=bot.d.ts.map