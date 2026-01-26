import { Repository } from "typeorm";
import { User } from "../entities/User";

const DAY_MS = 24 * 60 * 60 * 1000;

export const computeProUntil = (current: Date | null | undefined, durationDays: number, now: Date = new Date()): Date => {
  if (durationDays <= 0) {
    const farFuture = new Date(now);
    farFuture.setFullYear(now.getFullYear() + 100);
    return farFuture;
  }

  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + durationDays * DAY_MS);
};

export const applyProPayment = async (
  userRepository: Repository<User>,
  user: User,
  durationDays: number,
  now: Date = new Date(),
): Promise<Date> => {
  const next = computeProUntil(user.proUntil, durationDays, now);
  user.proUntil = next;
  user.revokedAt = null;
  await userRepository.save(user);
  return next;
};
