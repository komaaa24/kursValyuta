"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Payment = exports.PaymentStatus = void 0;
const typeorm_1 = require("typeorm");
const transformers_1 = require("./transformers");
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "pending";
    PaymentStatus["PAID"] = "paid";
    PaymentStatus["FAILED"] = "failed";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
let Payment = class Payment {
};
exports.Payment = Payment;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Payment.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", unique: true }),
    __metadata("design:type", String)
], Payment.prototype, "transactionParam", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "bigint", transformer: transformers_1.bigintTransformer }),
    __metadata("design:type", Number)
], Payment.prototype, "telegramId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "int" }),
    __metadata("design:type", Number)
], Payment.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "enum", enum: PaymentStatus, default: PaymentStatus.PENDING }),
    __metadata("design:type", String)
], Payment.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "timestamp with time zone", nullable: true }),
    __metadata("design:type", Date)
], Payment.prototype, "appliedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "timestamp with time zone", nullable: true }),
    __metadata("design:type", Object)
], Payment.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "jsonb", nullable: true }),
    __metadata("design:type", Object)
], Payment.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: "timestamp with time zone" }),
    __metadata("design:type", Date)
], Payment.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: "timestamp with time zone" }),
    __metadata("design:type", Date)
], Payment.prototype, "updatedAt", void 0);
exports.Payment = Payment = __decorate([
    (0, typeorm_1.Entity)({ name: "payments" })
], Payment);
//# sourceMappingURL=Payment.js.map