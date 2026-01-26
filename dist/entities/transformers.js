"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bigintTransformer = void 0;
exports.bigintTransformer = {
    to: (value) => (value === null || value === undefined ? value : String(value)),
    from: (value) => (value === null || value === undefined ? value : Number(value)),
};
//# sourceMappingURL=transformers.js.map