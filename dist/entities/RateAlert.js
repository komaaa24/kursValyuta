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
exports.RateAlert = void 0;
const typeorm_1 = require("typeorm");
const transformers_1 = require("./transformers");
let RateAlert = class RateAlert {
};
exports.RateAlert = RateAlert;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], RateAlert.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "bigint", transformer: transformers_1.bigintTransformer }),
    __metadata("design:type", Number)
], RateAlert.prototype, "telegramId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RateAlert.prototype, "base", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RateAlert.prototype, "quote", void 0);
__decorate([
    (0, typeorm_1.Column)("numeric", { precision: 18, scale: 6 }),
    __metadata("design:type", String)
], RateAlert.prototype, "targetRate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", length: 5, default: "above" }),
    __metadata("design:type", String)
], RateAlert.prototype, "direction", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "boolean", default: true }),
    __metadata("design:type", Boolean)
], RateAlert.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "timestamp with time zone", nullable: true }),
    __metadata("design:type", Date)
], RateAlert.prototype, "triggeredAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: "timestamp with time zone" }),
    __metadata("design:type", Date)
], RateAlert.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: "timestamp with time zone" }),
    __metadata("design:type", Date)
], RateAlert.prototype, "updatedAt", void 0);
exports.RateAlert = RateAlert = __decorate([
    (0, typeorm_1.Entity)({ name: "rate_alerts" })
], RateAlert);
//# sourceMappingURL=RateAlert.js.map