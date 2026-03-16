import { Repository } from "typeorm";
import { CurrencyRate } from "../entities/CurrencyRate";
export declare class CurrencyService {
    private readonly repository;
    constructor(repository: Repository<CurrencyRate>);
    upsertRate(base: string, quote: string, rate: string, sourceDate?: Date): Promise<CurrencyRate>;
    getLatestRate(base: string, quote: string): Promise<CurrencyRate | null>;
    getLatestAndPrevious(base: string, quote: string): Promise<{
        latest: CurrencyRate | null;
        previous: CurrencyRate | null;
    }>;
    getRateValue(base: string, quote: string): Promise<number | null>;
    convertAmount(amount: number, base: string, quote: string): Promise<number | null>;
    syncRates(primaryApiUrl?: string): Promise<CurrencyRate[]>;
    pullLatestRates(apiUrl: string, quote?: string): Promise<CurrencyRate[]>;
    pullCbuRates(apiUrl?: string): Promise<CurrencyRate[]>;
    listAllRates(): Promise<CurrencyRate[]>;
    private saveLegacyPayload;
    private saveCbuPayload;
}
//# sourceMappingURL=currencyService.d.ts.map