import { MigrationInterface, QueryRunner, TableUnique } from "typeorm";

export class ScopePremiumByBotUsername1768896000000 implements MigrationInterface {
    name = "ScopePremiumByBotUsername1768896000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "botUsername" character varying
        `);

        await queryRunner.query(`
            UPDATE "users"
            SET "botUsername" = 'legacy'
            WHERE "botUsername" IS NULL OR BTRIM("botUsername") = ''
        `);

        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "botUsername" SET DEFAULT 'legacy'
        `);

        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "botUsername" SET NOT NULL
        `);

        const usersTable = await queryRunner.getTable("users");
        const legacyTelegramUnique = usersTable?.uniques.find(
            (unique) => unique.columnNames.length === 1 && unique.columnNames[0] === "telegramId",
        );

        if (legacyTelegramUnique) {
            await queryRunner.dropUniqueConstraint("users", legacyTelegramUnique);
        }

        const compositeUserUnique = usersTable?.uniques.find(
            (unique) =>
                unique.columnNames.length === 2 &&
                unique.columnNames.includes("telegramId") &&
                unique.columnNames.includes("botUsername"),
        );

        if (!compositeUserUnique) {
            await queryRunner.createUniqueConstraint(
                "users",
                new TableUnique({
                    name: "UQ_users_telegramId_botUsername",
                    columnNames: ["telegramId", "botUsername"],
                }),
            );
        }

        await queryRunner.query(`
            ALTER TABLE "payments"
            ADD COLUMN IF NOT EXISTS "botUsername" character varying
        `);

        await queryRunner.query(`
            UPDATE "payments" AS payment
            SET "botUsername" = COALESCE(
                NULLIF(LOWER(payment.metadata ->> 'botUsername'), ''),
                NULLIF(LOWER("user"."botUsername"), ''),
                'legacy'
            )
            FROM "users" AS "user"
            WHERE payment."userId" = "user"."id"
              AND (payment."botUsername" IS NULL OR BTRIM(payment."botUsername") = '')
        `);

        await queryRunner.query(`
            UPDATE "payments"
            SET "botUsername" = 'legacy'
            WHERE "botUsername" IS NULL OR BTRIM("botUsername") = ''
        `);

        await queryRunner.query(`
            ALTER TABLE "payments"
            ALTER COLUMN "botUsername" SET DEFAULT 'legacy'
        `);

        await queryRunner.query(`
            ALTER TABLE "payments"
            ALTER COLUMN "botUsername" SET NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const usersTable = await queryRunner.getTable("users");
        const compositeUserUnique = usersTable?.uniques.find(
            (unique) => unique.name === "UQ_users_telegramId_botUsername",
        );

        if (compositeUserUnique) {
            await queryRunner.dropUniqueConstraint("users", compositeUserUnique);
        }

        const hasScopedDuplicates = await queryRunner.query(`
            SELECT "telegramId"
            FROM "users"
            GROUP BY "telegramId"
            HAVING COUNT(*) > 1
            LIMIT 1
        `);

        if (Array.isArray(hasScopedDuplicates) && hasScopedDuplicates.length > 0) {
            throw new Error(
                'Cannot restore unique users.telegramId because multiple bot-scoped rows now exist.',
            );
        }

        await queryRunner.createUniqueConstraint(
            "users",
            new TableUnique({
                name: "UQ_users_telegramId",
                columnNames: ["telegramId"],
            }),
        );

        await queryRunner.query(`
            ALTER TABLE "payments"
            DROP COLUMN IF EXISTS "botUsername"
        `);

        await queryRunner.query(`
            ALTER TABLE "users"
            DROP COLUMN IF EXISTS "botUsername"
        `);
    }
}
