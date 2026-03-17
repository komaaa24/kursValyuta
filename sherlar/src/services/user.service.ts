import { Repository } from "typeorm";
import { User } from "../entities/User.js";
import { AppDataSource } from "../database/data-source.js";
import { normalizeBotUsername } from "../utils/bot-scope.js";

export class UserService {
    private userRepo: Repository<User>;

    constructor() {
        this.userRepo = AppDataSource.getRepository(User);
    }

    /**
     * Foydalanuvchini topish yoki yaratish
     */
    async findOrCreate(telegramId: number, botUsername: string, userData?: {
        username?: string;
        firstName?: string;
        lastName?: string;
    }): Promise<User> {
        const scopedBotUsername = normalizeBotUsername(botUsername);
        let user = await this.userRepo.findOne({
            where: { telegramId, botUsername: scopedBotUsername }
        });

        if (!user) {
            user = this.userRepo.create({
                telegramId,
                botUsername: scopedBotUsername,
                username: userData?.username,
                firstName: userData?.firstName,
                lastName: userData?.lastName,
            });
            await this.userRepo.save(user);
        } else if (userData) {
            // Update user info
            user.username = userData.username || user.username;
            user.firstName = userData.firstName || user.firstName;
            user.lastName = userData.lastName || user.lastName;
            await this.userRepo.save(user);
        }

        return user;
    }

    /**
     * Foydalanuvchi to'lov qildimi?
     */
    async hasPaid(telegramId: number, botUsername: string): Promise<boolean> {
        const user = await this.userRepo.findOne({
            where: { telegramId, botUsername: normalizeBotUsername(botUsername) }
        });
        return user?.hasPaid || false;
    }

    /**
     * Foydalanuvchini to'lagan deb belgilash
     */
    async markAsPaid(telegramId: number, botUsername: string): Promise<void> {
        await this.userRepo.update(
            { telegramId, botUsername: normalizeBotUsername(botUsername) },
            { hasPaid: true, revokedAt: null }
        );
    }

    /**
     * Foydalanuvchi ma'lumotlarini yangilash
     */
    async update(telegramId: number, botUsername: string, data: Partial<User>): Promise<void> {
        await this.userRepo.update(
            { telegramId, botUsername: normalizeBotUsername(botUsername) },
            data
        );
    }

    /**
     * Ko'rilgan anekdotlar sonini oshirish
     */
    async incrementViewedAnecdotes(telegramId: number, botUsername: string): Promise<void> {
        const user = await this.findOrCreate(telegramId, botUsername);
        user.viewedAnecdotes += 1;
        await this.userRepo.save(user);
    }

    async findByTelegramId(telegramId: number, botUsername: string): Promise<User | null> {
        return this.userRepo.findOne({
            where: {
                telegramId,
                botUsername: normalizeBotUsername(botUsername),
            },
        });
    }
}
