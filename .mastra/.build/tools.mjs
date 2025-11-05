// src/tools/validation.ts
function validateToolInput(schema, input, toolId) {
  if (!schema || !("safeParse" in schema)) {
    return { data: input };
  }
  const validationAttempts = [];
  const directValidation = schema.safeParse(input);
  validationAttempts.push({
    result: directValidation,
    data: input,
    structure: "direct"
  });
  if (directValidation.success) {
    return { data: input };
  }
  if (input && typeof input === "object" && "context" in input) {
    const contextData = input.context;
    const contextValidation = schema.safeParse(contextData);
    validationAttempts.push({
      result: contextValidation,
      data: contextData,
      structure: "context"
    });
    if (contextValidation.success) {
      return { data: { ...input, context: contextValidation.data } };
    }
    if (contextData && typeof contextData === "object" && "inputData" in contextData) {
      const inputDataValue = contextData.inputData;
      const inputDataValidation = schema.safeParse(inputDataValue);
      validationAttempts.push({
        result: inputDataValidation,
        data: inputDataValue,
        structure: "inputData"
      });
      if (inputDataValidation.success) {
        const contextKeys = Object.keys(contextData);
        if (contextKeys.length === 1 && contextKeys[0] === "inputData") {
          return { data: { ...input, context: { inputData: inputDataValidation.data } } };
        } else {
          return { data: inputDataValidation.data };
        }
      }
    }
  }
  let bestAttempt = validationAttempts[0];
  for (const attempt of validationAttempts) {
    if (!attempt.result.success && attempt.result.error.issues.length > 0) {
      bestAttempt = attempt;
    }
  }
  if (bestAttempt && !bestAttempt.result.success) {
    const errorMessages = bestAttempt.result.error.issues.map((e) => `- ${e.path?.join(".") || "root"}: ${e.message}`).join("\n");
    const error = {
      error: true,
      message: `Tool validation failed${toolId ? ` for ${toolId}` : ""}. Please fix the following errors and try again:
${errorMessages}

Provided arguments: ${JSON.stringify(bestAttempt.data, null, 2)}`,
      validationErrors: bestAttempt.result.error.format()
    };
    return { data: input, error };
  }
  return { data: input };
}

// src/tools/tool.ts
var Tool = class {
  id;
  description;
  inputSchema;
  outputSchema;
  execute;
  mastra;
  constructor(opts) {
    this.id = opts.id;
    this.description = opts.description;
    this.inputSchema = opts.inputSchema;
    this.outputSchema = opts.outputSchema;
    this.mastra = opts.mastra;
    if (opts.execute) {
      const originalExecute = opts.execute;
      this.execute = async (context, options) => {
        const { data, error } = validateToolInput(this.inputSchema, context, this.id);
        if (error) {
          return error;
        }
        return originalExecute(data, options);
      };
    }
  }
};
function createTool(opts) {
  return new Tool(opts);
}

// src/tools/toolchecks.ts
function isVercelTool(tool) {
  return !!(tool && !(tool instanceof Tool) && "parameters" in tool);
}

export { Tool as T, createTool as c, isVercelTool as i, validateToolInput as v };
