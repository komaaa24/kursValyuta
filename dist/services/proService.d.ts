import { Repository } from "typeorm";
import { User } from "../entities/User";
export declare const computeProUntil: (current: Date | null | undefined, durationDays: number, now?: Date) => Date;
export declare const applyProPayment: (userRepository: Repository<User>, user: User, durationDays: number, now?: Date) => Promise<Date>;
//# sourceMappingURL=proService.d.ts.map