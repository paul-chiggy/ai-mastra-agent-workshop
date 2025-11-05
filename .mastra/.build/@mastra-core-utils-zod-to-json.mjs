import { z } from './zod.mjs';

// src/zod-to-json.ts
function zodToJsonSchema(zodSchema, target = "jsonSchema7", strategy = "relative") {
  const fn = "toJSONSchema";
  {
    return z[fn](zodSchema, {
      unrepresentable: "any",
      override: (ctx) => {
        const def = ctx.zodSchema?._zod?.def;
        if (def && def.type === "date") {
          ctx.jsonSchema.type = "string";
          ctx.jsonSchema.format = "date-time";
        }
      }
    });
  }
}

export { zodToJsonSchema };
