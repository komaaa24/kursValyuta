import { ValueTransformer } from "typeorm";

export const bigintTransformer: ValueTransformer = {
  to: (value) => (value === null || value === undefined ? value : String(value)),
  from: (value) => (value === null || value === undefined ? value : Number(value)),
};
