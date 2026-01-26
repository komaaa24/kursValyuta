"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyProPayment = exports.computeProUntil = void 0;
const DAY_MS = 24 * 60 * 60 * 1000;
const computeProUntil = (current, durationDays, now = new Date()) => {
    if (durationDays <= 0) {
        const farFuture = new Date(now);
        farFuture.setFullYear(now.getFullYear() + 100);
        return farFuture;
    }
    const base = current && current.getTime() > now.getTime() ? current : now;
    return new Date(base.getTime() + durationDays * DAY_MS);
};
exports.computeProUntil = computeProUntil;
const applyProPayment = async (userRepository, user, durationDays, now = new Date()) => {
    const next = (0, exports.computeProUntil)(user.proUntil, durationDays, now);
    user.proUntil = next;
    user.revokedAt = null;
    await userRepository.save(user);
    return next;
};
exports.applyProPayment = applyProPayment;
//# sourceMappingURL=proService.js.map