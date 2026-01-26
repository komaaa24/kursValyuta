import { Repository } from "typeorm";
import { CurrencyRate } from "../entities/CurrencyRate";
export declare class CurrencyService {
    private readonly repository;
    constructor(repository: Repository<CurrencyRate>);
    upsertRate(base: string, quote: string, rate: string, updatedAt?: Date): Promise<CurrencyRate>;
    getLatestRate(base: string, quote: string): Promise<CurrencyRate | null>;
    getLatestAndPrevious(base: string, quote: string): Promise<{
        latest: CurrencyRate | null;
        previous: CurrencyRate | null;
    }>;
    getRateValue(base: string, quote: string): Promise<number | null>;
    convertAmount(amount: number, base: string, quote: string): Promise<number | null>;
    pullLatestRates(apiUrl: string, quote?: string): Promise<CurrencyRate[]>;
    pullCbuRates(apiUrl?: string): Promise<CurrencyRate[]>;
    listAllRates(): Promise<CurrencyRate[]>;
}
//# sourceMappingURL=currencyService.d.ts.map