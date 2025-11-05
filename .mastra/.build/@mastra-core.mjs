import { S as STREAM_FORMAT_SYMBOL, E as EMITTER_SYMBOL, W as Workflow, R as Run, _ as __decoratorStart, a as __decorateElement, b as __runInitializers } from './workflows.mjs';
import { RuntimeContext } from './@mastra-core-runtime-context.mjs';
import { MastraError } from './@mastra-core-error.mjs';
import { M as MastraBase, R as RegisteredLogger, C as ConsoleLogger, L as LogLevel, s as setupAITracing, g as getAllAITracing, e as shutdownAITracingRegistry } from './utils.mjs';
import EventEmitter from 'events';
import { randomUUID } from 'crypto';
import { o as object, s as string, r as record, _ as _enum, c as any, n as number } from './coerce.mjs';
import { a as augmentWithInit } from './chunk-436FFEF6.mjs';
import { g as getDefaultExportFromCjs } from './_commonjsHelpers.mjs';
import { T as Telemetry, I as InstrumentClass } from './telemetry.mjs';
import { r as registerHook } from './hooks.mjs';

var StepExecutor = class extends MastraBase {
  mastra;
  constructor({ mastra }) {
    super({ name: "StepExecutor", component: RegisteredLogger.WORKFLOW });
    this.mastra = mastra;
  }
  __registerMastra(mastra) {
    this.mastra = mastra;
  }
  async execute(params) {
    const { step, stepResults, runId, runtimeContext, runCount = 0 } = params;
    const abortController = new AbortController();
    let suspended;
    let bailed;
    const startedAt = Date.now();
    let stepInfo = {
      ...stepResults[step.id],
      startedAt,
      payload: params.input ?? {}
    };
    if (params.resumeData) {
      delete stepInfo.suspendPayload?.["__workflow_meta"];
      stepInfo.resumePayload = params.resumeData;
      stepInfo.resumedAt = Date.now();
    }
    try {
      const stepResult = await step.execute({
        workflowId: params.workflowId,
        runId,
        mastra: this.mastra,
        runtimeContext,
        inputData: typeof params.foreachIdx === "number" ? params.input?.[params.foreachIdx] : params.input,
        runCount,
        resumeData: params.resumeData,
        getInitData: () => stepResults?.input,
        getStepResult: (step2) => {
          if (!step2?.id) {
            return null;
          }
          const result = stepResults[step2.id];
          if (result?.status === "success") {
            return result.output;
          }
          return null;
        },
        suspend: async (suspendPayload) => {
          suspended = { payload: { ...suspendPayload, __workflow_meta: { runId, path: [step.id] } } };
        },
        bail: (result) => {
          bailed = { payload: result };
        },
        // TODO
        writer: void 0,
        abort: () => {
          abortController?.abort();
        },
        [EMITTER_SYMBOL]: params.emitter,
        // TODO: refactor this to use our PubSub actually
        [STREAM_FORMAT_SYMBOL]: void 0,
        // TODO
        engine: {},
        abortSignal: abortController?.signal,
        // TODO
        tracingContext: {}
      });
      const endedAt = Date.now();
      let finalResult;
      if (suspended) {
        finalResult = {
          ...stepInfo,
          status: "suspended",
          suspendedAt: endedAt
        };
        if (suspended.payload) {
          finalResult.suspendPayload = suspended.payload;
        }
      } else if (bailed) {
        finalResult = {
          ...stepInfo,
          // @ts-ignore
          status: "bailed",
          endedAt,
          output: bailed.payload
        };
      } else {
        finalResult = {
          ...stepInfo,
          status: "success",
          endedAt,
          output: stepResult
        };
      }
      return finalResult;
    } catch (error) {
      const endedAt = Date.now();
      return {
        ...stepInfo,
        status: "failed",
        endedAt,
        error: error instanceof Error ? error?.stack ?? error.message : error
      };
    }
  }
  async evaluateConditions(params) {
    const { step, stepResults, runId, runtimeContext, runCount = 0 } = params;
    const abortController = new AbortController();
    const ee = new EventEmitter();
    const results = await Promise.all(
      step.conditions.map((condition) => {
        try {
          return this.evaluateCondition({
            workflowId: params.workflowId,
            condition,
            runId,
            runtimeContext,
            inputData: params.input,
            runCount,
            resumeData: params.resumeData,
            abortController,
            stepResults,
            emitter: ee
          });
        } catch (e) {
          console.error("error evaluating condition", e);
          return false;
        }
      })
    );
    const idxs = results.reduce((acc, result, idx) => {
      if (result) {
        acc.push(idx);
      }
      return acc;
    }, []);
    return idxs;
  }
  async evaluateCondition({
    workflowId,
    condition,
    runId,
    inputData,
    resumeData,
    stepResults,
    runtimeContext,
    emitter,
    abortController,
    runCount = 0
  }) {
    return condition({
      workflowId,
      runId,
      mastra: this.mastra,
      runtimeContext,
      inputData,
      runCount,
      resumeData,
      getInitData: () => stepResults?.input,
      getStepResult: (step) => {
        if (!step?.id) {
          return null;
        }
        const result = stepResults[step.id];
        if (result?.status === "success") {
          return result.output;
        }
        return null;
      },
      suspend: async (_suspendPayload) => {
        throw new Error("Not implemented");
      },
      bail: (_result) => {
        throw new Error("Not implemented");
      },
      // TODO
      writer: void 0,
      abort: () => {
        abortController?.abort();
      },
      [EMITTER_SYMBOL]: emitter,
      // TODO: refactor this to use our PubSub actually
      [STREAM_FORMAT_SYMBOL]: void 0,
      // TODO
      engine: {},
      abortSignal: abortController?.signal,
      // TODO
      tracingContext: {}
    });
  }
  async resolveSleep(params) {
    const { step, stepResults, runId, runtimeContext, runCount = 0 } = params;
    const abortController = new AbortController();
    const ee = new EventEmitter();
    if (step.duration) {
      return step.duration;
    }
    if (!step.fn) {
      return 0;
    }
    try {
      return await step.fn({
        workflowId: params.workflowId,
        runId,
        mastra: this.mastra,
        runtimeContext,
        inputData: params.input,
        runCount,
        resumeData: params.resumeData,
        getInitData: () => stepResults?.input,
        getStepResult: (step2) => {
          if (!step2?.id) {
            return null;
          }
          const result = stepResults[step2.id];
          if (result?.status === "success") {
            return result.output;
          }
          return null;
        },
        suspend: async (_suspendPayload) => {
          throw new Error("Not implemented");
        },
        bail: (_result) => {
          throw new Error("Not implemented");
        },
        abort: () => {
          abortController?.abort();
        },
        // TODO
        writer: void 0,
        [EMITTER_SYMBOL]: ee,
        // TODO: refactor this to use our PubSub actually
        [STREAM_FORMAT_SYMBOL]: void 0,
        // TODO
        engine: {},
        abortSignal: abortController?.signal,
        // TODO
        tracingContext: {}
      });
    } catch (e) {
      console.error("error evaluating condition", e);
      return 0;
    }
  }
  async resolveSleepUntil(params) {
    const { step, stepResults, runId, runtimeContext, runCount = 0 } = params;
    const abortController = new AbortController();
    const ee = new EventEmitter();
    if (step.date) {
      return step.date.getTime() - Date.now();
    }
    if (!step.fn) {
      return 0;
    }
    try {
      const result = await step.fn({
        workflowId: params.workflowId,
        runId,
        mastra: this.mastra,
        runtimeContext,
        inputData: params.input,
        runCount,
        resumeData: params.resumeData,
        getInitData: () => stepResults?.input,
        getStepResult: (step2) => {
          if (!step2?.id) {
            return null;
          }
          const result2 = stepResults[step2.id];
          if (result2?.status === "success") {
            return result2.output;
          }
          return null;
        },
        suspend: async (_suspendPayload) => {
          throw new Error("Not implemented");
        },
        bail: (_result) => {
          throw new Error("Not implemented");
        },
        abort: () => {
          abortController?.abort();
        },
        // TODO
        writer: void 0,
        [EMITTER_SYMBOL]: ee,
        // TODO: refactor this to use our PubSub actually
        [STREAM_FORMAT_SYMBOL]: void 0,
        // TODO
        engine: {},
        abortSignal: abortController?.signal,
        // TODO
        tracingContext: {}
      });
      return result.getTime() - Date.now();
    } catch (e) {
      console.error("error evaluating condition", e);
      return 0;
    }
  }
};

// src/events/processor.ts
var EventProcessor = class {
  mastra;
  __registerMastra(mastra) {
    this.mastra = mastra;
  }
  constructor({ mastra }) {
    this.mastra = mastra;
  }
};
async function processWorkflowLoop({
  workflowId,
  prevResult,
  runId,
  executionPath,
  stepResults,
  activeSteps,
  resumeSteps,
  resumeData,
  parentWorkflow,
  runtimeContext,
  runCount = 0
}, {
  pubsub,
  stepExecutor,
  step,
  stepResult
}) {
  const loopCondition = await stepExecutor.evaluateCondition({
    workflowId,
    condition: step.condition,
    runId,
    stepResults,
    emitter: new EventEmitter(),
    // TODO
    runtimeContext: new RuntimeContext(),
    // TODO
    inputData: prevResult?.status === "success" ? prevResult.output : void 0,
    resumeData,
    abortController: new AbortController(),
    runCount
  });
  if (step.loopType === "dountil") {
    if (loopCondition) {
      await pubsub.publish("workflows", {
        type: "workflow.step.end",
        runId,
        data: {
          parentWorkflow,
          workflowId,
          runId,
          executionPath,
          resumeSteps,
          stepResults,
          prevResult: stepResult,
          resumeData,
          activeSteps,
          runtimeContext
        }
      });
    } else {
      await pubsub.publish("workflows", {
        type: "workflow.step.run",
        runId,
        data: {
          parentWorkflow,
          workflowId,
          runId,
          executionPath,
          resumeSteps,
          stepResults,
          prevResult: stepResult,
          resumeData,
          activeSteps,
          runtimeContext,
          runCount
        }
      });
    }
  } else {
    if (loopCondition) {
      await pubsub.publish("workflows", {
        type: "workflow.step.run",
        runId,
        data: {
          parentWorkflow,
          workflowId,
          runId,
          executionPath,
          resumeSteps,
          stepResults,
          prevResult: stepResult,
          resumeData,
          activeSteps,
          runtimeContext,
          runCount
        }
      });
    } else {
      await pubsub.publish("workflows", {
        type: "workflow.step.end",
        runId,
        data: {
          parentWorkflow,
          workflowId,
          runId,
          executionPath,
          resumeSteps,
          stepResults,
          prevResult: stepResult,
          resumeData,
          activeSteps,
          runtimeContext
        }
      });
    }
  }
}
async function processWorkflowForEach({
  workflowId,
  prevResult,
  runId,
  executionPath,
  stepResults,
  activeSteps,
  resumeSteps,
  resumeData,
  parentWorkflow,
  runtimeContext
}, {
  pubsub,
  mastra,
  step
}) {
  const currentResult = stepResults[step.step.id];
  const idx = currentResult?.output?.length ?? 0;
  const targetLen = prevResult?.output?.length ?? 0;
  if (idx >= targetLen && currentResult.output.filter((r) => r !== null).length >= targetLen) {
    await pubsub.publish("workflows", {
      type: "workflow.step.run",
      runId,
      data: {
        parentWorkflow,
        workflowId,
        runId,
        executionPath: executionPath.slice(0, -1).concat([executionPath[executionPath.length - 1] + 1]),
        resumeSteps,
        stepResults,
        prevResult: currentResult,
        resumeData,
        activeSteps,
        runtimeContext
      }
    });
    return;
  } else if (idx >= targetLen) {
    return;
  }
  if (executionPath.length === 1 && idx === 0) {
    const concurrency = Math.min(step.opts.concurrency ?? 1, targetLen);
    const dummyResult = Array.from({ length: concurrency }, () => null);
    await mastra.getStorage()?.updateWorkflowResults({
      workflowName: workflowId,
      runId,
      stepId: step.step.id,
      result: {
        status: "succcess",
        output: dummyResult,
        startedAt: Date.now(),
        payload: prevResult?.output
      },
      runtimeContext
    });
    for (let i = 0; i < concurrency; i++) {
      await pubsub.publish("workflows", {
        type: "workflow.step.run",
        runId,
        data: {
          parentWorkflow,
          workflowId,
          runId,
          executionPath: [executionPath[0], i],
          resumeSteps,
          stepResults,
          prevResult,
          resumeData,
          activeSteps,
          runtimeContext
        }
      });
    }
    return;
  }
  currentResult.output.push(null);
  await mastra.getStorage()?.updateWorkflowResults({
    workflowName: workflowId,
    runId,
    stepId: step.step.id,
    result: {
      status: "succcess",
      output: currentResult.output,
      startedAt: Date.now(),
      payload: prevResult?.output
    },
    runtimeContext
  });
  await pubsub.publish("workflows", {
    type: "workflow.step.run",
    runId,
    data: {
      parentWorkflow,
      workflowId,
      runId,
      executionPath: [executionPath[0], idx],
      resumeSteps,
      stepResults,
      prevResult,
      resumeData,
      activeSteps,
      runtimeContext
    }
  });
}
async function processWorkflowParallel({
  workflowId,
  runId,
  executionPath,
  stepResults,
  activeSteps,
  resumeSteps,
  prevResult,
  resumeData,
  parentWorkflow,
  runtimeContext
}, {
  pubsub,
  step
}) {
  for (let i = 0; i < step.steps.length; i++) {
    const nestedStep = step.steps[i];
    if (nestedStep?.type === "step") {
      activeSteps[nestedStep.step.id] = true;
    }
  }
  await Promise.all(
    step.steps.map(async (_step, idx) => {
      return pubsub.publish("workflows", {
        type: "workflow.step.run",
        runId,
        data: {
          workflowId,
          runId,
          executionPath: executionPath.concat([idx]),
          resumeSteps,
          stepResults,
          prevResult,
          resumeData,
          parentWorkflow,
          activeSteps,
          runtimeContext
        }
      });
    })
  );
}
async function processWorkflowConditional({
  workflowId,
  runId,
  executionPath,
  stepResults,
  activeSteps,
  resumeSteps,
  prevResult,
  resumeData,
  parentWorkflow,
  runtimeContext
}, {
  pubsub,
  stepExecutor,
  step
}) {
  const idxs = await stepExecutor.evaluateConditions({
    workflowId,
    step,
    runId,
    stepResults,
    emitter: new EventEmitter(),
    // TODO
    runtimeContext: new RuntimeContext(),
    // TODO
    input: prevResult?.status === "success" ? prevResult.output : void 0,
    resumeData
  });
  const truthyIdxs = {};
  for (let i = 0; i < idxs.length; i++) {
    truthyIdxs[idxs[i]] = true;
  }
  await Promise.all(
    step.steps.map(async (step2, idx) => {
      if (truthyIdxs[idx]) {
        if (step2?.type === "step") {
          activeSteps[step2.step.id] = true;
        }
        return pubsub.publish("workflows", {
          type: "workflow.step.run",
          runId,
          data: {
            workflowId,
            runId,
            executionPath: executionPath.concat([idx]),
            resumeSteps,
            stepResults,
            prevResult,
            resumeData,
            parentWorkflow,
            activeSteps,
            runtimeContext
          }
        });
      } else {
        return pubsub.publish("workflows", {
          type: "workflow.step.end",
          runId,
          data: {
            workflowId,
            runId,
            executionPath: executionPath.concat([idx]),
            resumeSteps,
            stepResults,
            prevResult: { status: "skipped" },
            resumeData,
            parentWorkflow,
            activeSteps,
            runtimeContext
          }
        });
      }
    })
  );
}
async function processWorkflowWaitForEvent(workflowData, {
  pubsub,
  eventName,
  currentState
}) {
  const executionPath = currentState?.waitingPaths[eventName];
  if (!executionPath) {
    return;
  }
  const currentStep = getStep(workflowData.workflow, executionPath);
  const prevResult = {
    status: "success",
    output: currentState?.context[currentStep?.id ?? "input"]?.payload
  };
  await pubsub.publish("workflows", {
    type: "workflow.step.run",
    runId: workflowData.runId,
    data: {
      workflowId: workflowData.workflowId,
      runId: workflowData.runId,
      executionPath,
      resumeSteps: [],
      resumeData: workflowData.resumeData,
      parentWorkflow: workflowData.parentWorkflow,
      stepResults: currentState?.context,
      prevResult,
      activeSteps: [],
      runtimeContext: currentState?.runtimeContext
    }
  });
}
async function processWorkflowSleep({
  workflowId,
  runId,
  executionPath,
  stepResults,
  activeSteps,
  resumeSteps,
  prevResult,
  resumeData,
  parentWorkflow,
  runtimeContext
}, {
  pubsub,
  stepExecutor,
  step
}) {
  const startedAt = Date.now();
  await pubsub.publish(`workflow.events.v2.${runId}`, {
    type: "watch",
    runId,
    data: {
      type: "workflow-step-waiting",
      payload: {
        id: step.id,
        status: "waiting",
        payload: prevResult.status === "success" ? prevResult.output : void 0,
        startedAt
      }
    }
  });
  const duration = await stepExecutor.resolveSleep({
    workflowId,
    step,
    runId,
    stepResults,
    emitter: new EventEmitter(),
    // TODO
    runtimeContext: new RuntimeContext(),
    // TODO
    input: prevResult?.status === "success" ? prevResult.output : void 0,
    resumeData
  });
  setTimeout(
    async () => {
      await pubsub.publish(`workflow.events.v2.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "workflow-step-result",
          payload: {
            id: step.id,
            status: "success",
            payload: prevResult.status === "success" ? prevResult.output : void 0,
            output: prevResult.status === "success" ? prevResult.output : void 0,
            startedAt,
            endedAt: Date.now()
          }
        }
      });
      await pubsub.publish(`workflow.events.v2.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "workflow-step-finish",
          payload: {
            id: step.id,
            metadata: {}
          }
        }
      });
      await pubsub.publish("workflows", {
        type: "workflow.step.run",
        runId,
        data: {
          workflowId,
          runId,
          executionPath: executionPath.slice(0, -1).concat([executionPath[executionPath.length - 1] + 1]),
          resumeSteps,
          stepResults,
          prevResult,
          resumeData,
          parentWorkflow,
          activeSteps,
          runtimeContext
        }
      });
    },
    duration < 0 ? 0 : duration
  );
}
async function processWorkflowSleepUntil({
  workflowId,
  runId,
  executionPath,
  stepResults,
  activeSteps,
  resumeSteps,
  prevResult,
  resumeData,
  parentWorkflow,
  runtimeContext
}, {
  pubsub,
  stepExecutor,
  step
}) {
  const startedAt = Date.now();
  const duration = await stepExecutor.resolveSleepUntil({
    workflowId,
    step,
    runId,
    stepResults,
    emitter: new EventEmitter(),
    // TODO
    runtimeContext: new RuntimeContext(),
    // TODO
    input: prevResult?.status === "success" ? prevResult.output : void 0,
    resumeData
  });
  await pubsub.publish(`workflow.events.v2.${runId}`, {
    type: "watch",
    runId,
    data: {
      type: "workflow-step-waiting",
      payload: {
        id: step.id,
        status: "waiting",
        payload: prevResult.status === "success" ? prevResult.output : void 0,
        startedAt
      }
    }
  });
  setTimeout(
    async () => {
      await pubsub.publish(`workflow.events.v2.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "workflow-step-result",
          payload: {
            id: step.id,
            status: "success",
            payload: prevResult.status === "success" ? prevResult.output : void 0,
            output: prevResult.status === "success" ? prevResult.output : void 0,
            startedAt,
            endedAt: Date.now()
          }
        }
      });
      await pubsub.publish(`workflow.events.v2.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "workflow-step-finish",
          payload: {
            id: step.id,
            metadata: {}
          }
        }
      });
      await pubsub.publish("workflows", {
        type: "workflow.step.run",
        runId,
        data: {
          workflowId,
          runId,
          executionPath: executionPath.slice(0, -1).concat([executionPath[executionPath.length - 1] + 1]),
          resumeSteps,
          stepResults,
          prevResult,
          resumeData,
          parentWorkflow,
          activeSteps,
          runtimeContext
        }
      });
    },
    duration < 0 ? 0 : duration
  );
}

// src/workflows/evented/workflow-event-processor/index.ts
var WorkflowEventProcessor = class extends EventProcessor {
  stepExecutor;
  constructor({ mastra }) {
    super({ mastra });
    this.stepExecutor = new StepExecutor({ mastra });
  }
  __registerMastra(mastra) {
    super.__registerMastra(mastra);
    this.stepExecutor.__registerMastra(mastra);
  }
  async errorWorkflow({
    parentWorkflow,
    workflowId,
    runId,
    resumeSteps,
    stepResults,
    resumeData,
    runtimeContext
  }, e) {
    await this.mastra.pubsub.publish("workflows", {
      type: "workflow.fail",
      runId,
      data: {
        workflowId,
        runId,
        executionPath: [],
        resumeSteps,
        stepResults,
        prevResult: { status: "failed", error: e.stack ?? e.message },
        runtimeContext,
        resumeData,
        activeSteps: {},
        parentWorkflow
      }
    });
  }
  async processWorkflowCancel({ workflowId, runId }) {
    const currentState = await this.mastra.getStorage()?.updateWorkflowState({
      workflowName: workflowId,
      runId,
      opts: {
        status: "canceled"
      }
    });
    await this.endWorkflow({
      workflow: void 0,
      workflowId,
      runId,
      stepResults: currentState?.context,
      prevResult: { status: "canceled" },
      runtimeContext: currentState?.runtimeContext,
      executionPath: [],
      activeSteps: {},
      resumeSteps: [],
      resumeData: void 0,
      parentWorkflow: void 0
    });
  }
  async processWorkflowStart({
    workflow,
    parentWorkflow,
    workflowId,
    runId,
    resumeSteps,
    prevResult,
    resumeData,
    executionPath,
    stepResults,
    runtimeContext
  }) {
    await this.mastra.getStorage()?.persistWorkflowSnapshot({
      workflowName: workflow.id,
      runId,
      snapshot: {
        activePaths: [],
        suspendedPaths: {},
        waitingPaths: {},
        serializedStepGraph: workflow.serializedStepGraph,
        timestamp: Date.now(),
        runId,
        status: "running",
        context: stepResults ?? {
          input: prevResult?.status === "success" ? prevResult.output : void 0
        },
        value: {}
      }
    });
    await this.mastra.pubsub.publish("workflows", {
      type: "workflow.step.run",
      runId,
      data: {
        parentWorkflow,
        workflowId,
        runId,
        executionPath: executionPath ?? [0],
        resumeSteps,
        stepResults: stepResults ?? {
          input: prevResult?.status === "success" ? prevResult.output : void 0
        },
        prevResult,
        runtimeContext,
        resumeData,
        activeSteps: {}
      }
    });
  }
  async endWorkflow(args) {
    const { stepResults, workflowId, runId, prevResult } = args;
    await this.mastra.getStorage()?.updateWorkflowState({
      workflowName: workflowId,
      runId,
      opts: {
        status: "success",
        result: prevResult
      }
    });
    await this.mastra.pubsub.publish(`workflow.events.${runId}`, {
      type: "watch",
      runId,
      data: {
        type: "watch",
        payload: {
          currentStep: void 0,
          workflowState: {
            status: prevResult.status,
            steps: stepResults,
            result: prevResult.status === "success" ? prevResult.output : null,
            error: prevResult.error ?? null
          }
        },
        eventTimestamp: Date.now()
      }
    });
    await this.mastra.pubsub.publish(`workflow.events.v2.${runId}`, {
      type: "watch",
      runId,
      data: {
        type: "workflow-finish",
        payload: {
          runId
        }
      }
    });
    await this.mastra.pubsub.publish("workflows", {
      type: "workflow.end",
      runId,
      data: { ...args, workflow: void 0 }
    });
  }
  async processWorkflowEnd(args) {
    const { resumeSteps, prevResult, resumeData, parentWorkflow, activeSteps, runtimeContext, runId } = args;
    if (parentWorkflow) {
      await this.mastra.pubsub.publish("workflows", {
        type: "workflow.step.end",
        runId,
        data: {
          workflowId: parentWorkflow.workflowId,
          runId: parentWorkflow.runId,
          executionPath: parentWorkflow.executionPath,
          resumeSteps,
          stepResults: parentWorkflow.stepResults,
          prevResult,
          resumeData,
          activeSteps,
          parentWorkflow: parentWorkflow.parentWorkflow,
          parentContext: parentWorkflow,
          runtimeContext
        }
      });
    }
    await this.mastra.pubsub.publish("workflows-finish", {
      type: "workflow.end",
      runId,
      data: { ...args, workflow: void 0 }
    });
  }
  async processWorkflowSuspend(args) {
    const { resumeSteps, prevResult, resumeData, parentWorkflow, activeSteps, runId, runtimeContext } = args;
    if (parentWorkflow) {
      await this.mastra.pubsub.publish("workflows", {
        type: "workflow.step.end",
        runId,
        data: {
          workflowId: parentWorkflow.workflowId,
          runId: parentWorkflow.runId,
          executionPath: parentWorkflow.executionPath,
          resumeSteps,
          stepResults: parentWorkflow.stepResults,
          prevResult: {
            ...prevResult,
            suspendPayload: {
              ...prevResult.suspendPayload,
              __workflow_meta: {
                runId,
                path: parentWorkflow?.stepId ? [parentWorkflow.stepId].concat(prevResult.suspendPayload?.__workflow_meta?.path ?? []) : prevResult.suspendPayload?.__workflow_meta?.path ?? []
              }
            }
          },
          resumeData,
          activeSteps,
          runtimeContext,
          parentWorkflow: parentWorkflow.parentWorkflow,
          parentContext: parentWorkflow
        }
      });
    }
    await this.mastra.pubsub.publish("workflows-finish", {
      type: "workflow.suspend",
      runId,
      data: { ...args, workflow: void 0 }
    });
  }
  async processWorkflowFail(args) {
    const { workflowId, runId, resumeSteps, prevResult, resumeData, parentWorkflow, activeSteps, runtimeContext } = args;
    await this.mastra.getStorage()?.updateWorkflowState({
      workflowName: workflowId,
      runId,
      opts: {
        status: "failed",
        error: prevResult.error
      }
    });
    if (parentWorkflow) {
      await this.mastra.pubsub.publish("workflows", {
        type: "workflow.step.end",
        runId,
        data: {
          workflowId: parentWorkflow.workflowId,
          runId: parentWorkflow.runId,
          executionPath: parentWorkflow.executionPath,
          resumeSteps,
          stepResults: parentWorkflow.stepResults,
          prevResult,
          resumeData,
          activeSteps,
          runtimeContext,
          parentWorkflow: parentWorkflow.parentWorkflow,
          parentContext: parentWorkflow
        }
      });
    }
    await this.mastra.pubsub.publish("workflows-finish", {
      type: "workflow.fail",
      runId,
      data: { ...args, workflow: void 0 }
    });
  }
  async processWorkflowStepRun({
    workflow,
    workflowId,
    runId,
    executionPath,
    stepResults,
    activeSteps,
    resumeSteps,
    prevResult,
    resumeData,
    parentWorkflow,
    runtimeContext,
    runCount = 0
  }) {
    let stepGraph = workflow.stepGraph;
    if (!executionPath?.length) {
      return this.errorWorkflow(
        {
          workflowId,
          runId,
          executionPath,
          stepResults,
          activeSteps,
          resumeSteps,
          prevResult,
          resumeData,
          parentWorkflow,
          runtimeContext
        },
        new MastraError({
          id: "MASTRA_WORKFLOW",
          text: `Execution path is empty: ${JSON.stringify(executionPath)}`,
          domain: "MASTRA_WORKFLOW" /* MASTRA_WORKFLOW */,
          category: "SYSTEM" /* SYSTEM */
        })
      );
    }
    let step = stepGraph[executionPath[0]];
    if (!step) {
      return this.errorWorkflow(
        {
          workflowId,
          runId,
          executionPath,
          stepResults,
          activeSteps,
          resumeSteps,
          prevResult,
          resumeData,
          parentWorkflow,
          runtimeContext
        },
        new MastraError({
          id: "MASTRA_WORKFLOW",
          text: `Step not found in step graph: ${JSON.stringify(executionPath)}`,
          domain: "MASTRA_WORKFLOW" /* MASTRA_WORKFLOW */,
          category: "SYSTEM" /* SYSTEM */
        })
      );
    }
    if ((step.type === "parallel" || step.type === "conditional") && executionPath.length > 1) {
      step = step.steps[executionPath[1]];
    } else if (step.type === "parallel") {
      return processWorkflowParallel(
        {
          workflowId,
          runId,
          executionPath,
          stepResults,
          activeSteps,
          resumeSteps,
          prevResult,
          resumeData,
          parentWorkflow,
          runtimeContext
        },
        {
          pubsub: this.mastra.pubsub,
          step
        }
      );
    } else if (step?.type === "conditional") {
      return processWorkflowConditional(
        {
          workflowId,
          runId,
          executionPath,
          stepResults,
          activeSteps,
          resumeSteps,
          prevResult,
          resumeData,
          parentWorkflow,
          runtimeContext
        },
        {
          pubsub: this.mastra.pubsub,
          stepExecutor: this.stepExecutor,
          step
        }
      );
    } else if (step?.type === "sleep") {
      return processWorkflowSleep(
        {
          workflowId,
          runId,
          executionPath,
          stepResults,
          activeSteps,
          resumeSteps,
          prevResult,
          resumeData,
          parentWorkflow,
          runtimeContext
        },
        {
          pubsub: this.mastra.pubsub,
          stepExecutor: this.stepExecutor,
          step
        }
      );
    } else if (step?.type === "sleepUntil") {
      return processWorkflowSleepUntil(
        {
          workflowId,
          runId,
          executionPath,
          stepResults,
          activeSteps,
          resumeSteps,
          prevResult,
          resumeData,
          parentWorkflow,
          runtimeContext
        },
        {
          pubsub: this.mastra.pubsub,
          stepExecutor: this.stepExecutor,
          step
        }
      );
    } else if (step?.type === "waitForEvent" && !resumeData) {
      await this.mastra.getStorage()?.updateWorkflowResults({
        workflowName: workflowId,
        runId,
        stepId: step.step.id,
        result: {
          startedAt: Date.now(),
          status: "waiting",
          payload: prevResult.status === "success" ? prevResult.output : void 0
        },
        runtimeContext
      });
      await this.mastra.getStorage()?.updateWorkflowState({
        workflowName: workflowId,
        runId,
        opts: {
          status: "waiting",
          waitingPaths: {
            [step.event]: executionPath
          }
        }
      });
      await this.mastra.pubsub.publish(`workflow.events.v2.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "workflow-step-waiting",
          payload: {
            id: step.step.id,
            status: "waiting",
            payload: prevResult.status === "success" ? prevResult.output : void 0,
            startedAt: Date.now()
          }
        }
      });
      return;
    } else if (step?.type === "foreach" && executionPath.length === 1) {
      return processWorkflowForEach(
        {
          workflowId,
          runId,
          executionPath,
          stepResults,
          activeSteps,
          resumeSteps,
          prevResult,
          resumeData,
          parentWorkflow,
          runtimeContext
        },
        {
          pubsub: this.mastra.pubsub,
          mastra: this.mastra,
          step
        }
      );
    }
    if (!isExecutableStep(step)) {
      return this.errorWorkflow(
        {
          workflowId,
          runId,
          executionPath,
          stepResults,
          activeSteps,
          resumeSteps,
          prevResult,
          resumeData,
          parentWorkflow,
          runtimeContext
        },
        new MastraError({
          id: "MASTRA_WORKFLOW",
          text: `Step is not executable: ${step?.type} -- ${JSON.stringify(executionPath)}`,
          domain: "MASTRA_WORKFLOW" /* MASTRA_WORKFLOW */,
          category: "SYSTEM" /* SYSTEM */
        })
      );
    }
    activeSteps[step.step.id] = true;
    if (step.step instanceof EventedWorkflow) {
      if (resumeSteps?.length > 1) {
        const stepData = stepResults[step.step.id];
        const nestedRunId = stepData?.suspendPayload?.__workflow_meta?.runId;
        if (!nestedRunId) {
          return this.errorWorkflow(
            {
              workflowId,
              runId,
              executionPath,
              stepResults,
              activeSteps,
              resumeSteps,
              prevResult,
              resumeData,
              parentWorkflow,
              runtimeContext
            },
            new MastraError({
              id: "MASTRA_WORKFLOW",
              text: `Nested workflow run id not found: ${JSON.stringify(stepResults)}`,
              domain: "MASTRA_WORKFLOW" /* MASTRA_WORKFLOW */,
              category: "SYSTEM" /* SYSTEM */
            })
          );
        }
        const snapshot = await this.mastra?.getStorage()?.loadWorkflowSnapshot({
          workflowName: step.step.id,
          runId: nestedRunId
        });
        const nestedStepResults = snapshot?.context;
        const nestedSteps = resumeSteps.slice(1);
        await this.mastra.pubsub.publish("workflows", {
          type: "workflow.resume",
          runId,
          data: {
            workflowId: step.step.id,
            parentWorkflow: {
              stepId: step.step.id,
              workflowId,
              runId,
              executionPath,
              resumeSteps,
              stepResults,
              input: prevResult,
              parentWorkflow
            },
            executionPath: snapshot?.suspendedPaths?.[nestedSteps[0]],
            runId: nestedRunId,
            resumeSteps: nestedSteps,
            stepResults: nestedStepResults,
            prevResult,
            resumeData,
            activeSteps,
            runtimeContext
          }
        });
      } else {
        await this.mastra.pubsub.publish("workflows", {
          type: "workflow.start",
          runId,
          data: {
            workflowId: step.step.id,
            parentWorkflow: {
              stepId: step.step.id,
              workflowId,
              runId,
              executionPath,
              resumeSteps,
              stepResults,
              input: prevResult,
              parentWorkflow
            },
            executionPath: [0],
            runId: randomUUID(),
            resumeSteps,
            prevResult,
            resumeData,
            activeSteps,
            runtimeContext
          }
        });
      }
      return;
    }
    if (step.type === "step" || step.type === "waitForEvent") {
      await this.mastra.pubsub.publish(`workflow.events.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "watch",
          payload: {
            currentStep: { id: step.step.id, status: "running" },
            workflowState: {
              status: "running",
              steps: stepResults,
              error: null,
              result: null
            }
          },
          eventTimestamp: Date.now()
        }
      });
      await this.mastra.pubsub.publish(`workflow.events.v2.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "workflow-step-start",
          payload: {
            id: step.step.id,
            startedAt: Date.now(),
            payload: prevResult.status === "success" ? prevResult.output : void 0,
            status: "running"
          }
        }
      });
    }
    const ee = new EventEmitter();
    ee.on("watch-v2", async (event) => {
      await this.mastra.pubsub.publish(`workflow.events.v2.${runId}`, {
        type: "watch",
        runId,
        data: event
      });
    });
    const rc = new RuntimeContext();
    for (const [key, value] of Object.entries(runtimeContext)) {
      rc.set(key, value);
    }
    const stepResult = await this.stepExecutor.execute({
      workflowId,
      step: step.step,
      runId,
      stepResults,
      emitter: ee,
      runtimeContext: rc,
      input: prevResult?.output,
      resumeData: step.type === "waitForEvent" || resumeSteps?.length === 1 && resumeSteps?.[0] === step.step.id ? resumeData : void 0,
      runCount,
      foreachIdx: step.type === "foreach" ? executionPath[1] : void 0
    });
    runtimeContext = Object.fromEntries(rc.entries());
    if (stepResult.status === "bailed") {
      stepResult.status = "success";
      await this.endWorkflow({
        workflow,
        resumeData,
        parentWorkflow,
        workflowId,
        runId,
        executionPath,
        resumeSteps,
        stepResults: {
          ...stepResults,
          [step.step.id]: stepResult
        },
        prevResult: stepResult,
        activeSteps,
        runtimeContext
      });
      return;
    }
    if (stepResult.status === "failed") {
      if (runCount >= (workflow.retryConfig.attempts ?? 0)) {
        await this.mastra.pubsub.publish("workflows", {
          type: "workflow.step.end",
          runId,
          data: {
            parentWorkflow,
            workflowId,
            runId,
            executionPath,
            resumeSteps,
            stepResults,
            prevResult: stepResult,
            activeSteps,
            runtimeContext
          }
        });
      } else {
        return this.mastra.pubsub.publish("workflows", {
          type: "workflow.step.run",
          runId,
          data: {
            parentWorkflow,
            workflowId,
            runId,
            executionPath,
            resumeSteps,
            stepResults,
            prevResult,
            activeSteps,
            runtimeContext,
            runCount: runCount + 1
          }
        });
      }
    }
    if (step.type === "loop") {
      await processWorkflowLoop(
        {
          workflowId,
          prevResult: stepResult,
          runId,
          executionPath,
          stepResults,
          activeSteps,
          resumeSteps,
          resumeData,
          parentWorkflow,
          runtimeContext,
          runCount: runCount + 1
        },
        {
          pubsub: this.mastra.pubsub,
          stepExecutor: this.stepExecutor,
          step,
          stepResult
        }
      );
    } else {
      await this.mastra.pubsub.publish("workflows", {
        type: "workflow.step.end",
        runId,
        data: {
          parentWorkflow,
          workflowId,
          runId,
          executionPath,
          resumeSteps,
          stepResults,
          prevResult: stepResult,
          activeSteps,
          runtimeContext
        }
      });
    }
  }
  async processWorkflowStepEnd({
    workflow,
    workflowId,
    runId,
    executionPath,
    resumeSteps,
    prevResult,
    parentWorkflow,
    stepResults,
    activeSteps,
    parentContext,
    runtimeContext
  }) {
    let step = workflow.stepGraph[executionPath[0]];
    if ((step?.type === "parallel" || step?.type === "conditional") && executionPath.length > 1) {
      step = step.steps[executionPath[1]];
    }
    if (!step) {
      return this.errorWorkflow(
        {
          workflowId,
          runId,
          executionPath,
          resumeSteps,
          prevResult,
          stepResults,
          activeSteps,
          runtimeContext
        },
        new MastraError({
          id: "MASTRA_WORKFLOW",
          text: `Step not found: ${JSON.stringify(executionPath)}`,
          domain: "MASTRA_WORKFLOW" /* MASTRA_WORKFLOW */,
          category: "SYSTEM" /* SYSTEM */
        })
      );
    }
    if (step.type === "foreach") {
      const snapshot = await this.mastra.getStorage()?.loadWorkflowSnapshot({
        workflowName: workflowId,
        runId
      });
      const currentIdx = executionPath[1];
      const currentResult = snapshot?.context?.[step.step.id]?.output;
      let newResult = prevResult;
      if (currentIdx !== void 0) {
        if (currentResult) {
          currentResult[currentIdx] = prevResult.output;
          newResult = { ...prevResult, output: currentResult };
        } else {
          newResult = { ...prevResult, output: [prevResult.output] };
        }
      }
      const newStepResults = await this.mastra.getStorage()?.updateWorkflowResults({
        workflowName: workflow.id,
        runId,
        stepId: step.step.id,
        result: newResult,
        runtimeContext
      });
      if (!newStepResults) {
        return;
      }
      stepResults = newStepResults;
    } else if (isExecutableStep(step)) {
      delete activeSteps[step.step.id];
      if (parentContext) {
        prevResult = stepResults[step.step.id] = {
          ...prevResult,
          payload: parentContext.input?.output ?? {}
        };
      }
      const newStepResults = await this.mastra.getStorage()?.updateWorkflowResults({
        workflowName: workflow.id,
        runId,
        stepId: step.step.id,
        result: prevResult,
        runtimeContext
      });
      if (!newStepResults) {
        return;
      }
      stepResults = newStepResults;
    }
    if (!prevResult?.status || prevResult.status === "failed") {
      await this.mastra.pubsub.publish("workflows", {
        type: "workflow.fail",
        runId,
        data: {
          workflowId,
          runId,
          executionPath,
          resumeSteps,
          parentWorkflow,
          stepResults,
          prevResult,
          activeSteps,
          runtimeContext
        }
      });
      return;
    } else if (prevResult.status === "suspended") {
      const suspendedPaths = {};
      const suspendedStep = getStep(workflow, executionPath);
      if (suspendedStep) {
        suspendedPaths[suspendedStep.id] = executionPath;
      }
      await this.mastra.getStorage()?.updateWorkflowState({
        workflowName: workflowId,
        runId,
        opts: {
          status: "suspended",
          result: prevResult,
          suspendedPaths
        }
      });
      await this.mastra.pubsub.publish("workflows", {
        type: "workflow.suspend",
        runId,
        data: {
          workflowId,
          runId,
          executionPath,
          resumeSteps,
          parentWorkflow,
          stepResults,
          prevResult,
          activeSteps,
          runtimeContext
        }
      });
      await this.mastra.pubsub.publish(`workflow.events.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "watch",
          payload: {
            currentStep: { ...prevResult, id: step?.step?.id },
            workflowState: {
              status: "suspended",
              steps: stepResults,
              suspendPayload: prevResult.suspendPayload
            }
          }
        }
      });
      await this.mastra.pubsub.publish(`workflow.events.v2.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "workflow-step-suspended",
          payload: {
            id: step?.step?.id,
            ...prevResult,
            suspendedAt: Date.now(),
            suspendPayload: prevResult.suspendPayload
          }
        }
      });
      return;
    }
    if (step?.type === "step" || step?.type === "waitForEvent") {
      await this.mastra.pubsub.publish(`workflow.events.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "watch",
          payload: {
            currentStep: { ...prevResult, id: step.step.id },
            workflowState: {
              status: "running",
              steps: stepResults,
              error: null,
              result: null
            }
          },
          eventTimestamp: Date.now()
        }
      });
      await this.mastra.pubsub.publish(`workflow.events.v2.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "workflow-step-result",
          payload: {
            id: step.step.id,
            ...prevResult
          }
        }
      });
      if (prevResult.status === "success") {
        await this.mastra.pubsub.publish(`workflow.events.v2.${runId}`, {
          type: "watch",
          runId,
          data: {
            type: "workflow-step-finish",
            payload: {
              id: step.step.id,
              metadata: {}
            }
          }
        });
      }
    }
    step = workflow.stepGraph[executionPath[0]];
    if ((step?.type === "parallel" || step?.type === "conditional") && executionPath.length > 1) {
      let skippedCount = 0;
      const allResults = step.steps.reduce(
        (acc, step2) => {
          if (isExecutableStep(step2)) {
            const res = stepResults?.[step2.step.id];
            if (res && res.status === "success") {
              acc[step2.step.id] = res?.output;
            } else if (res?.status === "skipped") {
              skippedCount++;
            }
          }
          return acc;
        },
        {}
      );
      const keys = Object.keys(allResults);
      if (keys.length + skippedCount < step.steps.length) {
        return;
      }
      await this.mastra.pubsub.publish("workflows", {
        type: "workflow.step.end",
        runId,
        data: {
          parentWorkflow,
          workflowId,
          runId,
          executionPath: executionPath.slice(0, -1),
          resumeSteps,
          stepResults,
          prevResult: { status: "success", output: allResults },
          activeSteps,
          runtimeContext
        }
      });
    } else if (step?.type === "foreach") {
      await this.mastra.pubsub.publish("workflows", {
        type: "workflow.step.run",
        runId,
        data: {
          workflowId,
          runId,
          executionPath: executionPath.slice(0, -1),
          resumeSteps,
          parentWorkflow,
          stepResults,
          prevResult: { ...prevResult, output: prevResult?.payload },
          activeSteps,
          runtimeContext
        }
      });
    } else if (executionPath[0] >= workflow.stepGraph.length - 1) {
      await this.endWorkflow({
        workflow,
        parentWorkflow,
        workflowId,
        runId,
        executionPath,
        resumeSteps,
        stepResults,
        prevResult,
        activeSteps,
        runtimeContext
      });
    } else {
      await this.mastra.pubsub.publish("workflows", {
        type: "workflow.step.run",
        runId,
        data: {
          workflowId,
          runId,
          executionPath: executionPath.slice(0, -1).concat([executionPath[executionPath.length - 1] + 1]),
          resumeSteps,
          parentWorkflow,
          stepResults,
          prevResult,
          activeSteps,
          runtimeContext
        }
      });
    }
  }
  async loadData({
    workflowId,
    runId
  }) {
    const snapshot = await this.mastra.getStorage()?.loadWorkflowSnapshot({
      workflowName: workflowId,
      runId
    });
    return snapshot;
  }
  async process(event, ack) {
    const { type, data } = event;
    const workflowData = data;
    const currentState = await this.loadData({
      workflowId: workflowData.workflowId,
      runId: workflowData.runId
    });
    if (currentState?.status === "canceled" && type !== "workflow.end") {
      return;
    }
    if (type.startsWith("workflow.user-event.")) {
      await processWorkflowWaitForEvent(
        {
          ...workflowData,
          workflow: this.mastra.getWorkflow(workflowData.workflowId)
        },
        {
          pubsub: this.mastra.pubsub,
          eventName: type.split(".").slice(2).join("."),
          currentState
        }
      );
      return;
    }
    const workflow = workflowData.parentWorkflow ? getNestedWorkflow(this.mastra, workflowData.parentWorkflow) : this.mastra.getWorkflow(workflowData.workflowId);
    if (!workflow) {
      return this.errorWorkflow(
        workflowData,
        new MastraError({
          id: "MASTRA_WORKFLOW",
          text: `Workflow not found: ${workflowData.workflowId}`,
          domain: "MASTRA_WORKFLOW" /* MASTRA_WORKFLOW */,
          category: "SYSTEM" /* SYSTEM */
        })
      );
    }
    if (type === "workflow.start" || type === "workflow.resume") {
      const { runId } = workflowData;
      await this.mastra.pubsub.publish(`workflow.events.v2.${runId}`, {
        type: "watch",
        runId,
        data: {
          type: "workflow-start",
          payload: {
            runId
          }
        }
      });
    }
    switch (type) {
      case "workflow.cancel":
        await this.processWorkflowCancel({
          workflow,
          ...workflowData
        });
        break;
      case "workflow.start":
        await this.processWorkflowStart({
          workflow,
          ...workflowData
        });
        break;
      case "workflow.resume":
        await this.processWorkflowStart({
          workflow,
          ...workflowData
        });
        break;
      case "workflow.end":
        await this.processWorkflowEnd({
          workflow,
          ...workflowData
        });
        break;
      case "workflow.step.end":
        await this.processWorkflowStepEnd({
          workflow,
          ...workflowData
        });
        break;
      case "workflow.step.run":
        await this.processWorkflowStepRun({
          workflow,
          ...workflowData
        });
        break;
      case "workflow.suspend":
        await this.processWorkflowSuspend({
          workflow,
          ...workflowData
        });
        break;
      case "workflow.fail":
        await this.processWorkflowFail({
          workflow,
          ...workflowData
        });
        break;
    }
    try {
      await ack?.();
    } catch (e) {
      console.error("Error acking event", e);
    }
  }
};
var EventedWorkflow = class extends Workflow {
  constructor(params) {
    super(params);
  }
  __registerMastra(mastra) {
    super.__registerMastra(mastra);
    this.executionEngine.__registerMastra(mastra);
  }
  async createRunAsync(options) {
    const runIdToUse = options?.runId || randomUUID();
    const run = this.runs.get(runIdToUse) ?? new EventedRun({
      workflowId: this.id,
      runId: runIdToUse,
      executionEngine: this.executionEngine,
      executionGraph: this.executionGraph,
      serializedStepGraph: this.serializedStepGraph,
      mastra: this.mastra,
      retryConfig: this.retryConfig,
      cleanup: () => this.runs.delete(runIdToUse)
    });
    this.runs.set(runIdToUse, run);
    const workflowSnapshotInStorage = await this.getWorkflowRunExecutionResult(runIdToUse, false);
    if (!workflowSnapshotInStorage) {
      await this.mastra?.getStorage()?.persistWorkflowSnapshot({
        workflowName: this.id,
        runId: runIdToUse,
        snapshot: {
          runId: runIdToUse,
          status: "pending",
          value: {},
          context: {},
          activePaths: [],
          serializedStepGraph: this.serializedStepGraph,
          suspendedPaths: {},
          waitingPaths: {},
          result: void 0,
          error: void 0,
          // @ts-ignore
          timestamp: Date.now()
        }
      });
    }
    return run;
  }
};
var EventedRun = class extends Run {
  constructor(params) {
    super(params);
    this.serializedStepGraph = params.serializedStepGraph;
  }
  async start({
    inputData,
    runtimeContext
  }) {
    if (this.serializedStepGraph.length === 0) {
      throw new Error(
        "Execution flow of workflow is not defined. Add steps to the workflow via .then(), .branch(), etc."
      );
    }
    if (!this.executionGraph.steps) {
      throw new Error("Uncommitted step flow changes detected. Call .commit() to register the steps.");
    }
    runtimeContext = runtimeContext ?? new RuntimeContext();
    await this.mastra?.getStorage()?.persistWorkflowSnapshot({
      workflowName: this.workflowId,
      runId: this.runId,
      snapshot: {
        runId: this.runId,
        serializedStepGraph: this.serializedStepGraph,
        value: {},
        context: {},
        runtimeContext: Object.fromEntries(runtimeContext.entries()),
        activePaths: [],
        suspendedPaths: {},
        waitingPaths: {},
        timestamp: Date.now(),
        status: "running"
      }
    });
    const result = await this.executionEngine.execute({
      workflowId: this.workflowId,
      runId: this.runId,
      graph: this.executionGraph,
      serializedStepGraph: this.serializedStepGraph,
      input: inputData,
      emitter: {
        emit: async (event, data) => {
          this.emitter.emit(event, data);
        },
        on: (event, callback) => {
          this.emitter.on(event, callback);
        },
        off: (event, callback) => {
          this.emitter.off(event, callback);
        },
        once: (event, callback) => {
          this.emitter.once(event, callback);
        }
      },
      retryConfig: this.retryConfig,
      runtimeContext,
      abortController: this.abortController
    });
    console.dir({ startResult: result }, { depth: null });
    if (result.status !== "suspended") {
      this.cleanup?.();
    }
    return result;
  }
  // TODO: streamVNext
  async resume(params) {
    const steps = (Array.isArray(params.step) ? params.step : [params.step]).map(
      (step) => typeof step === "string" ? step : step?.id
    );
    if (steps.length === 0) {
      throw new Error("No steps provided to resume");
    }
    const snapshot = await this.mastra?.getStorage()?.loadWorkflowSnapshot({
      workflowName: this.workflowId,
      runId: this.runId
    });
    const resumePath = snapshot?.suspendedPaths?.[steps[0]];
    if (!resumePath) {
      throw new Error(
        `No resume path found for step ${JSON.stringify(steps)}, currently suspended paths are ${JSON.stringify(snapshot?.suspendedPaths)}`
      );
    }
    console.dir(
      { resume: { runtimeContextObj: snapshot?.runtimeContext, runtimeContext: params.runtimeContext } },
      { depth: null }
    );
    const runtimeContextObj = snapshot?.runtimeContext ?? {};
    const runtimeContext = new RuntimeContext();
    for (const [key, value] of Object.entries(runtimeContextObj)) {
      runtimeContext.set(key, value);
    }
    if (params.runtimeContext) {
      for (const [key, value] of params.runtimeContext.entries()) {
        runtimeContext.set(key, value);
      }
    }
    const executionResultPromise = this.executionEngine.execute({
      workflowId: this.workflowId,
      runId: this.runId,
      graph: this.executionGraph,
      serializedStepGraph: this.serializedStepGraph,
      input: params.resumeData,
      resume: {
        steps,
        stepResults: snapshot?.context,
        resumePayload: params.resumeData,
        resumePath
      },
      emitter: {
        emit: (event, data) => {
          this.emitter.emit(event, data);
          return Promise.resolve();
        },
        on: (event, callback) => {
          this.emitter.on(event, callback);
        },
        off: (event, callback) => {
          this.emitter.off(event, callback);
        },
        once: (event, callback) => {
          this.emitter.once(event, callback);
        }
      },
      runtimeContext,
      abortController: this.abortController
    }).then((result) => {
      if (result.status !== "suspended") {
        this.closeStreamAction?.().catch(() => {
        });
      }
      return result;
    });
    this.executionResults = executionResultPromise;
    return executionResultPromise;
  }
  watch(cb, type = "watch") {
    const watchCb = async (event, ack) => {
      if (event.runId !== this.runId) {
        return;
      }
      cb(event.data);
      await ack?.();
    };
    if (type === "watch-v2") {
      this.mastra?.pubsub.subscribe(`workflow.events.v2.${this.runId}`, watchCb).catch(() => {
      });
    } else {
      this.mastra?.pubsub.subscribe(`workflow.events.${this.runId}`, watchCb).catch(() => {
      });
    }
    return () => {
      if (type === "watch-v2") {
        this.mastra?.pubsub.unsubscribe(`workflow.events.v2.${this.runId}`, watchCb).catch(() => {
        });
      } else {
        this.mastra?.pubsub.unsubscribe(`workflow.events.${this.runId}`, watchCb).catch(() => {
        });
      }
    };
  }
  async watchAsync(cb, type = "watch") {
    const watchCb = async (event, ack) => {
      if (event.runId !== this.runId) {
        return;
      }
      cb(event.data);
      await ack?.();
    };
    if (type === "watch-v2") {
      await this.mastra?.pubsub.subscribe(`workflow.events.v2.${this.runId}`, watchCb).catch(() => {
      });
    } else {
      await this.mastra?.pubsub.subscribe(`workflow.events.${this.runId}`, watchCb).catch(() => {
      });
    }
    return async () => {
      if (type === "watch-v2") {
        await this.mastra?.pubsub.unsubscribe(`workflow.events.v2.${this.runId}`, watchCb).catch(() => {
        });
      } else {
        await this.mastra?.pubsub.unsubscribe(`workflow.events.${this.runId}`, watchCb).catch(() => {
        });
      }
    };
  }
  async cancel() {
    await this.mastra?.pubsub.publish("workflows", {
      type: "workflow.cancel",
      runId: this.runId,
      data: {
        workflowId: this.workflowId,
        runId: this.runId
      }
    });
  }
  async sendEvent(eventName, data) {
    await this.mastra?.pubsub.publish("workflows", {
      type: `workflow.user-event.${eventName}`,
      runId: this.runId,
      data: {
        workflowId: this.workflowId,
        runId: this.runId,
        resumeData: data
      }
    });
  }
};

// src/workflows/evented/workflow-event-processor/utils.ts
function getNestedWorkflow(mastra, { workflowId, executionPath, parentWorkflow }) {
  let workflow = null;
  if (parentWorkflow) {
    const nestedWorkflow = getNestedWorkflow(mastra, parentWorkflow);
    if (!nestedWorkflow) {
      return null;
    }
    workflow = nestedWorkflow;
  }
  workflow = workflow ?? mastra.getWorkflow(workflowId);
  const stepGraph = workflow.stepGraph;
  let parentStep = stepGraph[executionPath[0]];
  if (parentStep?.type === "parallel" || parentStep?.type === "conditional") {
    parentStep = parentStep.steps[executionPath[1]];
  }
  if (parentStep?.type === "step" || parentStep?.type === "loop") {
    return parentStep.step;
  }
  return null;
}
function getStep(workflow, executionPath) {
  let idx = 0;
  const stepGraph = workflow.stepGraph;
  let parentStep = stepGraph[executionPath[0]];
  if (parentStep?.type === "parallel" || parentStep?.type === "conditional") {
    parentStep = parentStep.steps[executionPath[1]];
    idx++;
  } else if (parentStep?.type === "foreach") {
    return parentStep.step;
  }
  if (!(parentStep?.type === "step" || parentStep?.type === "loop" || parentStep?.type === "waitForEvent")) {
    return null;
  }
  if (parentStep instanceof EventedWorkflow) {
    return getStep(parentStep, executionPath.slice(idx + 1));
  }
  return parentStep.step;
}
function isExecutableStep(step) {
  return step.type === "step" || step.type === "loop" || step.type === "waitForEvent" || step.type === "foreach";
}

record(string(), any()).optional();
var scoringValueSchema = number();
object({
  result: record(string(), any()).optional(),
  score: scoringValueSchema,
  prompt: string().optional()
});
var saveScorePayloadSchema = object({
  runId: string(),
  scorerId: string(),
  entityId: string(),
  score: number(),
  input: any().optional(),
  output: any(),
  source: _enum(["LIVE", "TEST"]),
  entityType: _enum(["AGENT", "WORKFLOW"]).optional(),
  traceId: string().optional(),
  scorer: record(string(), any()).optional(),
  preprocessStepResult: record(string(), any()).optional(),
  extractStepResult: record(string(), any()).optional(),
  analyzeStepResult: record(string(), any()).optional(),
  reason: string().optional(),
  metadata: record(string(), any()).optional(),
  preprocessPrompt: string().optional(),
  extractPrompt: string().optional(),
  generateScorePrompt: string().optional(),
  generateReasonPrompt: string().optional(),
  analyzePrompt: string().optional(),
  additionalContext: record(string(), any()).optional(),
  runtimeContext: record(string(), any()).optional(),
  entity: record(string(), any()).optional(),
  resourceId: string().optional(),
  threadId: string().optional()
});

// A simple TTL cache with max capacity option, ms resolution,
// autopurge, and reasonably optimized performance
// Relies on the fact that integer Object keys are kept sorted,
// and managed very efficiently by V8.

/* istanbul ignore next */
const perf =
  typeof performance === 'object' &&
  performance &&
  typeof performance.now === 'function'
    ? performance
    : Date;

const now = () => perf.now();
const isPosInt = n => n && n === Math.floor(n) && n > 0 && isFinite(n);
const isPosIntOrInf = n => n === Infinity || isPosInt(n);

class TTLCache {
  constructor({
    max = Infinity,
    ttl,
    updateAgeOnGet = false,
    checkAgeOnGet = false,
    noUpdateTTL = false,
    dispose,
    noDisposeOnSet = false,
  } = {}) {
    // {[expirationTime]: [keys]}
    this.expirations = Object.create(null);
    // {key=>val}
    this.data = new Map();
    // {key=>expiration}
    this.expirationMap = new Map();
    if (ttl !== undefined && !isPosIntOrInf(ttl)) {
      throw new TypeError(
        'ttl must be positive integer or Infinity if set'
      )
    }
    if (!isPosIntOrInf(max)) {
      throw new TypeError('max must be positive integer or Infinity')
    }
    this.ttl = ttl;
    this.max = max;
    this.updateAgeOnGet = !!updateAgeOnGet;
    this.checkAgeOnGet = !!checkAgeOnGet;
    this.noUpdateTTL = !!noUpdateTTL;
    this.noDisposeOnSet = !!noDisposeOnSet;
    if (dispose !== undefined) {
      if (typeof dispose !== 'function') {
        throw new TypeError('dispose must be function if set')
      }
      this.dispose = dispose;
    }

    this.timer = undefined;
    this.timerExpiration = undefined;
  }

  setTimer(expiration, ttl) {
    if (this.timerExpiration < expiration) {
      return
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    const t = setTimeout(() => {
      this.timer = undefined;
      this.timerExpiration = undefined;
      this.purgeStale();
      for (const exp in this.expirations) {
        this.setTimer(exp, exp - now());
        break
      }
    }, ttl);

    /* istanbul ignore else - affordance for non-node envs */
    if (t.unref) t.unref();

    this.timerExpiration = expiration;
    this.timer = t;
  }

  // hang onto the timer so we can clearTimeout if all items
  // are deleted.  Deno doesn't have Timer.unref(), so it
  // hangs otherwise.
  cancelTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timerExpiration = undefined;
      this.timer = undefined;
    }
  }

  /* istanbul ignore next */
  cancelTimers() {
    process.emitWarning(
      'TTLCache.cancelTimers has been renamed to ' +
        'TTLCache.cancelTimer (no "s"), and will be removed in the next ' +
        'major version update'
    );
    return this.cancelTimer()
  }

  clear() {
    const entries =
      this.dispose !== TTLCache.prototype.dispose ? [...this] : [];
    this.data.clear();
    this.expirationMap.clear();
    // no need for any purging now
    this.cancelTimer();
    this.expirations = Object.create(null);
    for (const [key, val] of entries) {
      this.dispose(val, key, 'delete');
    }
  }

  setTTL(key, ttl = this.ttl) {
    const current = this.expirationMap.get(key);
    if (current !== undefined) {
      // remove from the expirations list, so it isn't purged
      const exp = this.expirations[current];
      if (!exp || exp.length <= 1) {
        delete this.expirations[current];
      } else {
        this.expirations[current] = exp.filter(k => k !== key);
      }
    }

    if (ttl !== Infinity) {
      const expiration = Math.floor(now() + ttl);
      this.expirationMap.set(key, expiration);
      if (!this.expirations[expiration]) {
        this.expirations[expiration] = [];
        this.setTimer(expiration, ttl);
      }
      this.expirations[expiration].push(key);
    } else {
      this.expirationMap.set(key, Infinity);
    }
  }

  set(
    key,
    val,
    {
      ttl = this.ttl,
      noUpdateTTL = this.noUpdateTTL,
      noDisposeOnSet = this.noDisposeOnSet,
    } = {}
  ) {
    if (!isPosIntOrInf(ttl)) {
      throw new TypeError('ttl must be positive integer or Infinity')
    }
    if (this.expirationMap.has(key)) {
      if (!noUpdateTTL) {
        this.setTTL(key, ttl);
      }
      // has old value
      const oldValue = this.data.get(key);
      if (oldValue !== val) {
        this.data.set(key, val);
        if (!noDisposeOnSet) {
          this.dispose(oldValue, key, 'set');
        }
      }
    } else {
      this.setTTL(key, ttl);
      this.data.set(key, val);
    }

    while (this.size > this.max) {
      this.purgeToCapacity();
    }

    return this
  }

  has(key) {
    return this.data.has(key)
  }

  getRemainingTTL(key) {
    const expiration = this.expirationMap.get(key);
    return expiration === Infinity
      ? expiration
      : expiration !== undefined
      ? Math.max(0, Math.ceil(expiration - now()))
      : 0
  }

  get(
    key,
    {
      updateAgeOnGet = this.updateAgeOnGet,
      ttl = this.ttl,
      checkAgeOnGet = this.checkAgeOnGet,
    } = {}
  ) {
    const val = this.data.get(key);
    if (checkAgeOnGet && this.getRemainingTTL(key) === 0) {
      this.delete(key);
      return undefined
    }
    if (updateAgeOnGet) {
      this.setTTL(key, ttl);
    }
    return val
  }

  dispose(_, __) {}

  delete(key) {
    const current = this.expirationMap.get(key);
    if (current !== undefined) {
      const value = this.data.get(key);
      this.data.delete(key);
      this.expirationMap.delete(key);
      const exp = this.expirations[current];
      if (exp) {
        if (exp.length <= 1) {
          delete this.expirations[current];
        } else {
          this.expirations[current] = exp.filter(k => k !== key);
        }
      }
      this.dispose(value, key, 'delete');
      if (this.size === 0) {
        this.cancelTimer();
      }
      return true
    }
    return false
  }

  purgeToCapacity() {
    for (const exp in this.expirations) {
      const keys = this.expirations[exp];
      if (this.size - keys.length >= this.max) {
        delete this.expirations[exp];
        const entries = [];
        for (const key of keys) {
          entries.push([key, this.data.get(key)]);
          this.data.delete(key);
          this.expirationMap.delete(key);
        }
        for (const [key, val] of entries) {
          this.dispose(val, key, 'evict');
        }
      } else {
        const s = this.size - this.max;
        const entries = [];
        for (const key of keys.splice(0, s)) {
          entries.push([key, this.data.get(key)]);
          this.data.delete(key);
          this.expirationMap.delete(key);
        }
        for (const [key, val] of entries) {
          this.dispose(val, key, 'evict');
        }
        return
      }
    }
  }

  get size() {
    return this.data.size
  }

  purgeStale() {
    const n = Math.ceil(now());
    for (const exp in this.expirations) {
      if (exp === 'Infinity' || exp > n) {
        return
      }

      /* istanbul ignore next
       * mysterious need for a guard here?
       * https://github.com/isaacs/ttlcache/issues/26 */
      const keys = [...(this.expirations[exp] || [])];
      const entries = [];
      delete this.expirations[exp];
      for (const key of keys) {
        entries.push([key, this.data.get(key)]);
        this.data.delete(key);
        this.expirationMap.delete(key);
      }
      for (const [key, val] of entries) {
        this.dispose(val, key, 'stale');
      }
    }
    if (this.size === 0) {
      this.cancelTimer();
    }
  }

  *entries() {
    for (const exp in this.expirations) {
      for (const key of this.expirations[exp]) {
        yield [key, this.data.get(key)];
      }
    }
  }
  *keys() {
    for (const exp in this.expirations) {
      for (const key of this.expirations[exp]) {
        yield key;
      }
    }
  }
  *values() {
    for (const exp in this.expirations) {
      for (const key of this.expirations[exp]) {
        yield this.data.get(key);
      }
    }
  }
  [Symbol.iterator]() {
    return this.entries()
  }
}

var ttlcache = TTLCache;

var TTLCache$1 = /*@__PURE__*/getDefaultExportFromCjs(ttlcache);

// src/cache/base.ts
var MastraServerCache = class extends MastraBase {
  constructor({ name }) {
    super({
      component: "SERVER_CACHE",
      name
    });
  }
};

// src/cache/inmemory.ts
var InMemoryServerCache = class extends MastraServerCache {
  cache = new TTLCache$1({
    max: 1e3,
    ttl: 1e3 * 60 * 5
  });
  constructor() {
    super({ name: "InMemoryServerCache" });
  }
  async get(key) {
    return this.cache.get(key);
  }
  async set(key, value) {
    this.cache.set(key, value);
  }
  async listLength(key) {
    const list = this.cache.get(key);
    if (!Array.isArray(list)) {
      throw new Error(`${key} is not an array`);
    }
    return list.length;
  }
  async listPush(key, value) {
    const list = this.cache.get(key);
    if (Array.isArray(list)) {
      list.push(value);
    } else {
      this.cache.set(key, [value]);
    }
  }
  async listFromTo(key, from, to = -1) {
    const list = this.cache.get(key);
    if (Array.isArray(list)) {
      const endIndex = to === -1 ? void 0 : to + 1;
      return list.slice(from, endIndex);
    }
    return [];
  }
  async delete(key) {
    this.cache.delete(key);
  }
  async clear() {
    this.cache.clear();
  }
};

// src/events/pubsub.ts
var PubSub = class {
};

// src/logger/noop-logger.ts
var noopLogger = {
  debug: () => {
  },
  info: () => {
  },
  warn: () => {
  },
  error: () => {
  },
  cleanup: async () => {
  },
  getTransports: () => /* @__PURE__ */ new Map(),
  trackException: () => {
  },
  getLogs: async () => ({ logs: [], total: 0, page: 1, perPage: 100, hasMore: false }),
  getLogsByRunId: async () => ({ logs: [], total: 0, page: 1, perPage: 100, hasMore: false })
};

var EventEmitterPubSub = class extends PubSub {
  emitter;
  constructor() {
    super();
    this.emitter = new EventEmitter();
  }
  async publish(topic, event) {
    const id = crypto.randomUUID();
    const createdAt = /* @__PURE__ */new Date();
    this.emitter.emit(topic, {
      ...event,
      id,
      createdAt
    });
  }
  async subscribe(topic, cb) {
    this.emitter.on(topic, cb);
  }
  async unsubscribe(topic, cb) {
    this.emitter.off(topic, cb);
  }
  async flush() {}
};

// src/mastra/hooks.ts
function createOnScorerHook(mastra) {
  return async hookData => {
    const storage = mastra.getStorage();
    if (!storage) {
      mastra.getLogger()?.warn("Storage not found, skipping score validation and saving");
      return;
    }
    const entityId = hookData.entity.id;
    const entityType = hookData.entityType;
    const scorer = hookData.scorer;
    try {
      const scorerToUse = await findScorer(mastra, entityId, entityType, scorer.id);
      if (!scorerToUse) {
        throw new MastraError({
          id: "MASTRA_SCORER_NOT_FOUND",
          domain: "MASTRA" /* MASTRA */,
          category: "USER" /* USER */,
          text: `Scorer with ID ${hookData.scorer.id} not found`
        });
      }
      let input = hookData.input;
      let output = hookData.output;
      if (entityType !== "AGENT") {
        output = {
          object: hookData.output
        };
      }
      const {
        structuredOutput,
        ...rest
      } = hookData;
      const runResult = await scorerToUse.scorer.run({
        ...rest,
        input,
        output
      });
      const payload = {
        ...rest,
        ...runResult,
        entityId,
        scorerId: hookData.scorer.id,
        metadata: {
          structuredOutput: !!structuredOutput
        }
      };
      await validateAndSaveScore(storage, payload);
    } catch (error) {
      const mastraError = new MastraError({
        id: "MASTRA_SCORER_FAILED_TO_RUN_HOOK",
        domain: "SCORER" /* SCORER */,
        category: "USER" /* USER */,
        details: {
          scorerId: scorer.id,
          entityId,
          entityType
        }
      }, error);
      mastra.getLogger()?.trackException(mastraError);
      mastra.getLogger()?.error(mastraError.toString());
    }
  };
}
async function validateAndSaveScore(storage, payload) {
  const payloadToSave = saveScorePayloadSchema.parse(payload);
  await storage?.saveScore(payloadToSave);
}
async function findScorer(mastra, entityId, entityType, scorerId) {
  let scorerToUse;
  if (entityType === "AGENT") {
    const scorers = await mastra.getAgentById(entityId).getScorers();
    scorerToUse = scorers[scorerId];
  } else if (entityType === "WORKFLOW") {
    const scorers = await mastra.getWorkflowById(entityId).getScorers();
    scorerToUse = scorers[scorerId];
  }
  if (!scorerToUse) {
    const mastraRegisteredScorer = mastra.getScorerByName(scorerId);
    scorerToUse = mastraRegisteredScorer ? {
      scorer: mastraRegisteredScorer
    } : void 0;
  }
  return scorerToUse;
}

// src/mastra/index.ts
var _Mastra_decorators, _init;
_Mastra_decorators = [InstrumentClass({
  prefix: "mastra",
  excludeMethods: ["getLogger", "getTelemetry"]
})];
var Mastra = class {
  #vectors;
  #agents;
  #logger;
  #legacy_workflows;
  #workflows;
  #tts;
  #deployer;
  #serverMiddleware = [];
  #telemetry;
  #storage;
  #memory;
  #vnext_networks;
  #scorers;
  #server;
  #mcpServers;
  #bundler;
  #idGenerator;
  #pubsub;
  #events = {};
  // This is only used internally for server handlers that require temporary persistence
  #serverCache;
  /**
   * @deprecated use getTelemetry() instead
   */
  get telemetry() {
    return this.#telemetry;
  }
  /**
   * @deprecated use getStorage() instead
   */
  get storage() {
    return this.#storage;
  }
  /**
   * @deprecated use getMemory() instead
   */
  get memory() {
    return this.#memory;
  }
  get pubsub() {
    return this.#pubsub;
  }
  getIdGenerator() {
    return this.#idGenerator;
  }
  /**
   * Generate a unique identifier using the configured generator or default to crypto.randomUUID()
   * @returns A unique string ID
   */
  generateId() {
    if (this.#idGenerator) {
      const id = this.#idGenerator();
      if (!id) {
        const error = new MastraError({
          id: "MASTRA_ID_GENERATOR_RETURNED_EMPTY_STRING",
          domain: "MASTRA" /* MASTRA */,
          category: "USER" /* USER */,
          text: "ID generator returned an empty string, which is not allowed"
        });
        this.#logger?.trackException(error);
        throw error;
      }
      return id;
    }
    return crypto.randomUUID();
  }
  setIdGenerator(idGenerator) {
    this.#idGenerator = idGenerator;
  }
  constructor(config) {
    if (config?.serverMiddleware) {
      this.#serverMiddleware = config.serverMiddleware.map(m => ({
        handler: m.handler,
        path: m.path || "/api/*"
      }));
    }
    this.#serverCache = new InMemoryServerCache();
    if (config?.pubsub) {
      this.#pubsub = config.pubsub;
    } else {
      this.#pubsub = new EventEmitterPubSub();
    }
    this.#events = {};
    for (const topic in config?.events ?? {}) {
      if (!Array.isArray(config?.events?.[topic])) {
        this.#events[topic] = [config?.events?.[topic]];
      } else {
        this.#events[topic] = config?.events?.[topic] ?? [];
      }
    }
    const workflowEventProcessor = new WorkflowEventProcessor({
      mastra: this
    });
    const workflowEventCb = async (event, cb) => {
      try {
        await workflowEventProcessor.process(event, cb);
      } catch (e) {
        console.error("Error processing event", e);
      }
    };
    if (this.#events.workflows) {
      this.#events.workflows.push(workflowEventCb);
    } else {
      this.#events.workflows = [workflowEventCb];
    }
    let logger;
    if (config?.logger === false) {
      logger = noopLogger;
    } else {
      if (config?.logger) {
        logger = config.logger;
      } else {
        const levelOnEnv = process.env.NODE_ENV === "production" && process.env.MASTRA_DEV !== "true" ? LogLevel.WARN : LogLevel.INFO;
        logger = new ConsoleLogger({
          name: "Mastra",
          level: levelOnEnv
        });
      }
    }
    this.#logger = logger;
    this.#idGenerator = config?.idGenerator;
    let storage = config?.storage;
    if (storage) {
      storage = augmentWithInit(storage);
    }
    this.#telemetry = Telemetry.init(config?.telemetry);
    if (config?.telemetry?.enabled !== false && typeof globalThis !== "undefined" && globalThis.___MASTRA_TELEMETRY___ !== true) {
      this.#logger?.warn(`Mastra telemetry is enabled, but the required instrumentation file was not loaded. If you are using Mastra outside of the mastra server environment, see: https://mastra.ai/en/docs/observability/tracing#tracing-outside-mastra-server-environment`, `If you are using a custom instrumentation file or want to disable this warning, set the globalThis.___MASTRA_TELEMETRY___ variable to true in your instrumentation file.`);
    }
    if (config?.observability) {
      setupAITracing(config.observability);
    }
    if (this.#telemetry && storage) {
      this.#storage = this.#telemetry.traceClass(storage, {
        excludeMethods: ["__setTelemetry", "__getTelemetry", "batchTraceInsert", "getTraces", "getEvalsByAgentName"]
      });
      this.#storage.__setTelemetry(this.#telemetry);
    } else {
      this.#storage = storage;
    }
    if (config?.vectors) {
      let vectors = {};
      Object.entries(config.vectors).forEach(([key, vector]) => {
        if (this.#telemetry) {
          vectors[key] = this.#telemetry.traceClass(vector, {
            excludeMethods: ["__setTelemetry", "__getTelemetry"]
          });
          vectors[key].__setTelemetry(this.#telemetry);
        } else {
          vectors[key] = vector;
        }
      });
      this.#vectors = vectors;
    }
    if (config?.vnext_networks) {
      this.#vnext_networks = config.vnext_networks;
    }
    if (config?.mcpServers) {
      this.#mcpServers = config.mcpServers;
      Object.entries(this.#mcpServers).forEach(([key, server]) => {
        server.setId(key);
        if (this.#telemetry) {
          server.__setTelemetry(this.#telemetry);
        }
        server.__registerMastra(this);
        server.__setLogger(this.getLogger());
      });
    }
    if (config && `memory` in config) {
      const error = new MastraError({
        id: "MASTRA_CONSTRUCTOR_INVALID_MEMORY_CONFIG",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: `
  Memory should be added to Agents, not to Mastra.

Instead of:
  new Mastra({ memory: new Memory() })

do:
  new Agent({ memory: new Memory() })
`
      });
      this.#logger?.trackException(error);
      throw error;
    }
    if (config?.tts) {
      this.#tts = config.tts;
      Object.entries(this.#tts).forEach(([key, ttsCl]) => {
        if (this.#tts?.[key]) {
          if (this.#telemetry) {
            this.#tts[key] = this.#telemetry.traceClass(ttsCl, {
              excludeMethods: ["__setTelemetry", "__getTelemetry"]
            });
            this.#tts[key].__setTelemetry(this.#telemetry);
          }
        }
      });
    }
    const agents = {};
    if (config?.agents) {
      Object.entries(config.agents).forEach(([key, agent]) => {
        if (agents[key]) {
          const error = new MastraError({
            id: "MASTRA_AGENT_REGISTRATION_DUPLICATE_ID",
            domain: "MASTRA" /* MASTRA */,
            category: "USER" /* USER */,
            text: `Agent with name ID:${key} already exists`,
            details: {
              agentId: key
            }
          });
          this.#logger?.trackException(error);
          throw error;
        }
        agent.__registerMastra(this);
        agent.__registerPrimitives({
          logger: this.getLogger(),
          telemetry: this.#telemetry,
          storage: this.storage,
          memory: this.memory,
          agents,
          tts: this.#tts,
          vectors: this.#vectors
        });
        agents[key] = agent;
      });
    }
    this.#agents = agents;
    this.#vnext_networks = {};
    if (config?.vnext_networks) {
      Object.entries(config.vnext_networks).forEach(([key, network]) => {
        network.__registerMastra(this);
        this.#vnext_networks[key] = network;
      });
    }
    const scorers = {};
    if (config?.scorers) {
      Object.entries(config.scorers).forEach(([key, scorer]) => {
        scorers[key] = scorer;
      });
    }
    this.#scorers = scorers;
    this.#legacy_workflows = {};
    if (config?.legacy_workflows) {
      Object.entries(config.legacy_workflows).forEach(([key, workflow]) => {
        workflow.__registerMastra(this);
        workflow.__registerPrimitives({
          logger: this.getLogger(),
          telemetry: this.#telemetry,
          storage: this.storage,
          memory: this.memory,
          agents,
          tts: this.#tts,
          vectors: this.#vectors
        });
        this.#legacy_workflows[key] = workflow;
        const workflowSteps = Object.values(workflow.steps).filter(step => !!step.workflowId && !!step.workflow);
        if (workflowSteps.length > 0) {
          workflowSteps.forEach(step => {
            this.#legacy_workflows[step.workflowId] = step.workflow;
          });
        }
      });
    }
    this.#workflows = {};
    if (config?.workflows) {
      Object.entries(config.workflows).forEach(([key, workflow]) => {
        workflow.__registerMastra(this);
        workflow.__registerPrimitives({
          logger: this.getLogger(),
          telemetry: this.#telemetry,
          storage: this.storage,
          memory: this.memory,
          agents,
          tts: this.#tts,
          vectors: this.#vectors
        });
        this.#workflows[key] = workflow;
      });
    }
    if (config?.server) {
      this.#server = config.server;
    }
    registerHook("onScorerRun" /* ON_SCORER_RUN */, createOnScorerHook(this));
    if (config?.observability) {
      this.registerAITracingExporters();
      this.initAITracingExporters();
    }
    this.setLogger({
      logger
    });
  }
  /**
   * Register this Mastra instance with AI tracing exporters that need it
   */
  registerAITracingExporters() {
    const allTracingInstances = getAllAITracing();
    allTracingInstances.forEach(tracing => {
      const exporters = tracing.getExporters();
      exporters.forEach(exporter => {
        if ("__registerMastra" in exporter && typeof exporter.__registerMastra === "function") {
          exporter.__registerMastra(this);
        }
      });
    });
  }
  /**
   * Initialize all AI tracing exporters after registration is complete
   */
  initAITracingExporters() {
    const allTracingInstances = getAllAITracing();
    allTracingInstances.forEach(tracing => {
      const exporters = tracing.getExporters();
      exporters.forEach(exporter => {
        if ("init" in exporter && typeof exporter.init === "function") {
          try {
            exporter.init();
          } catch (error) {
            this.#logger?.warn("Failed to initialize AI tracing exporter", {
              exporterName: exporter.name,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      });
    });
  }
  getAgent(name) {
    const agent = this.#agents?.[name];
    if (!agent) {
      const error = new MastraError({
        id: "MASTRA_GET_AGENT_BY_NAME_NOT_FOUND",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: `Agent with name ${String(name)} not found`,
        details: {
          status: 404,
          agentName: String(name),
          agents: Object.keys(this.#agents ?? {}).join(", ")
        }
      });
      this.#logger?.trackException(error);
      throw error;
    }
    return this.#agents[name];
  }
  getAgentById(id) {
    let agent = Object.values(this.#agents).find(a => a.id === id);
    if (!agent) {
      try {
        agent = this.getAgent(id);
      } catch {}
    }
    if (!agent) {
      const error = new MastraError({
        id: "MASTRA_GET_AGENT_BY_AGENT_ID_NOT_FOUND",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: `Agent with id ${String(id)} not found`,
        details: {
          status: 404,
          agentId: String(id),
          agents: Object.keys(this.#agents ?? {}).join(", ")
        }
      });
      this.#logger?.trackException(error);
      throw error;
    }
    return agent;
  }
  getAgents() {
    return this.#agents;
  }
  getVector(name) {
    const vector = this.#vectors?.[name];
    if (!vector) {
      const error = new MastraError({
        id: "MASTRA_GET_VECTOR_BY_NAME_NOT_FOUND",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: `Vector with name ${String(name)} not found`,
        details: {
          status: 404,
          vectorName: String(name),
          vectors: Object.keys(this.#vectors ?? {}).join(", ")
        }
      });
      this.#logger?.trackException(error);
      throw error;
    }
    return vector;
  }
  getVectors() {
    return this.#vectors;
  }
  getDeployer() {
    return this.#deployer;
  }
  legacy_getWorkflow(id, {
    serialized
  } = {}) {
    const workflow = this.#legacy_workflows?.[id];
    if (!workflow) {
      const error = new MastraError({
        id: "MASTRA_GET_LEGACY_WORKFLOW_BY_ID_NOT_FOUND",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: `Workflow with ID ${String(id)} not found`,
        details: {
          status: 404,
          workflowId: String(id),
          workflows: Object.keys(this.#legacy_workflows ?? {}).join(", ")
        }
      });
      this.#logger?.trackException(error);
      throw error;
    }
    if (serialized) {
      return {
        name: workflow.name
      };
    }
    return workflow;
  }
  getWorkflow(id, {
    serialized
  } = {}) {
    const workflow = this.#workflows?.[id];
    if (!workflow) {
      const error = new MastraError({
        id: "MASTRA_GET_WORKFLOW_BY_ID_NOT_FOUND",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: `Workflow with ID ${String(id)} not found`,
        details: {
          status: 404,
          workflowId: String(id),
          workflows: Object.keys(this.#workflows ?? {}).join(", ")
        }
      });
      this.#logger?.trackException(error);
      throw error;
    }
    if (serialized) {
      return {
        name: workflow.name
      };
    }
    return workflow;
  }
  getWorkflowById(id) {
    let workflow = Object.values(this.#workflows).find(a => a.id === id);
    if (!workflow) {
      try {
        workflow = this.getWorkflow(id);
      } catch {}
    }
    if (!workflow) {
      const error = new MastraError({
        id: "MASTRA_GET_WORKFLOW_BY_ID_NOT_FOUND",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: `Workflow with id ${String(id)} not found`,
        details: {
          status: 404,
          workflowId: String(id),
          workflows: Object.keys(this.#workflows ?? {}).join(", ")
        }
      });
      this.#logger?.trackException(error);
      throw error;
    }
    return workflow;
  }
  legacy_getWorkflows(props = {}) {
    if (props.serialized) {
      return Object.entries(this.#legacy_workflows).reduce((acc, [k, v]) => {
        return {
          ...acc,
          [k]: {
            name: v.name
          }
        };
      }, {});
    }
    return this.#legacy_workflows;
  }
  getScorers() {
    return this.#scorers;
  }
  getScorer(key) {
    const scorer = this.#scorers?.[key];
    if (!scorer) {
      const error = new MastraError({
        id: "MASTRA_GET_SCORER_NOT_FOUND",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: `Scorer with ${String(key)} not found`
      });
      this.#logger?.trackException(error);
      throw error;
    }
    return scorer;
  }
  getScorerByName(name) {
    for (const [_key, value] of Object.entries(this.#scorers ?? {})) {
      if (value.name === name) {
        return value;
      }
    }
    const error = new MastraError({
      id: "MASTRA_GET_SCORER_BY_NAME_NOT_FOUND",
      domain: "MASTRA" /* MASTRA */,
      category: "USER" /* USER */,
      text: `Scorer with name ${String(name)} not found`
    });
    this.#logger?.trackException(error);
    throw error;
  }
  getWorkflows(props = {}) {
    if (props.serialized) {
      return Object.entries(this.#workflows).reduce((acc, [k, v]) => {
        return {
          ...acc,
          [k]: {
            name: v.name
          }
        };
      }, {});
    }
    return this.#workflows;
  }
  setStorage(storage) {
    this.#storage = augmentWithInit(storage);
  }
  setLogger({
    logger
  }) {
    this.#logger = logger;
    if (this.#agents) {
      Object.keys(this.#agents).forEach(key => {
        this.#agents?.[key]?.__setLogger(this.#logger);
      });
    }
    if (this.#memory) {
      this.#memory.__setLogger(this.#logger);
    }
    if (this.#deployer) {
      this.#deployer.__setLogger(this.#logger);
    }
    if (this.#tts) {
      Object.keys(this.#tts).forEach(key => {
        this.#tts?.[key]?.__setLogger(this.#logger);
      });
    }
    if (this.#storage) {
      this.#storage.__setLogger(this.#logger);
    }
    if (this.#vectors) {
      Object.keys(this.#vectors).forEach(key => {
        this.#vectors?.[key]?.__setLogger(this.#logger);
      });
    }
    if (this.#mcpServers) {
      Object.keys(this.#mcpServers).forEach(key => {
        this.#mcpServers?.[key]?.__setLogger(this.#logger);
      });
    }
    const allTracingInstances = getAllAITracing();
    allTracingInstances.forEach(instance => {
      instance.__setLogger(this.#logger);
    });
  }
  setTelemetry(telemetry) {
    this.#telemetry = Telemetry.init(telemetry);
    if (this.#agents) {
      Object.keys(this.#agents).forEach(key => {
        if (this.#telemetry) {
          this.#agents?.[key]?.__setTelemetry(this.#telemetry);
        }
      });
    }
    if (this.#memory) {
      this.#memory = this.#telemetry.traceClass(this.#memory, {
        excludeMethods: ["__setTelemetry", "__getTelemetry"]
      });
      this.#memory.__setTelemetry(this.#telemetry);
    }
    if (this.#deployer) {
      this.#deployer = this.#telemetry.traceClass(this.#deployer, {
        excludeMethods: ["__setTelemetry", "__getTelemetry"]
      });
      this.#deployer.__setTelemetry(this.#telemetry);
    }
    if (this.#tts) {
      let tts = {};
      Object.entries(this.#tts).forEach(([key, ttsCl]) => {
        if (this.#telemetry) {
          tts[key] = this.#telemetry.traceClass(ttsCl, {
            excludeMethods: ["__setTelemetry", "__getTelemetry"]
          });
          tts[key].__setTelemetry(this.#telemetry);
        }
      });
      this.#tts = tts;
    }
    if (this.#storage) {
      this.#storage = this.#telemetry.traceClass(this.#storage, {
        excludeMethods: ["__setTelemetry", "__getTelemetry"]
      });
      this.#storage.__setTelemetry(this.#telemetry);
    }
    if (this.#vectors) {
      let vectors = {};
      Object.entries(this.#vectors).forEach(([key, vector]) => {
        if (this.#telemetry) {
          vectors[key] = this.#telemetry.traceClass(vector, {
            excludeMethods: ["__setTelemetry", "__getTelemetry"]
          });
          vectors[key].__setTelemetry(this.#telemetry);
        }
      });
      this.#vectors = vectors;
    }
  }
  getTTS() {
    return this.#tts;
  }
  getLogger() {
    return this.#logger;
  }
  getTelemetry() {
    return this.#telemetry;
  }
  getMemory() {
    return this.#memory;
  }
  getStorage() {
    return this.#storage;
  }
  getServerMiddleware() {
    return this.#serverMiddleware;
  }
  getServerCache() {
    return this.#serverCache;
  }
  setServerMiddleware(serverMiddleware) {
    if (typeof serverMiddleware === "function") {
      this.#serverMiddleware = [{
        handler: serverMiddleware,
        path: "/api/*"
      }];
      return;
    }
    if (!Array.isArray(serverMiddleware)) {
      const error = new MastraError({
        id: "MASTRA_SET_SERVER_MIDDLEWARE_INVALID_TYPE",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: `Invalid middleware: expected a function or array, received ${typeof serverMiddleware}`
      });
      this.#logger?.trackException(error);
      throw error;
    }
    this.#serverMiddleware = serverMiddleware.map(m => {
      if (typeof m === "function") {
        return {
          handler: m,
          path: "/api/*"
        };
      }
      return {
        handler: m.handler,
        path: m.path || "/api/*"
      };
    });
  }
  vnext_getNetworks() {
    return Object.values(this.#vnext_networks || {});
  }
  getServer() {
    return this.#server;
  }
  getBundlerConfig() {
    return this.#bundler;
  }
  vnext_getNetwork(networkId) {
    const networks = this.vnext_getNetworks();
    return networks.find(network => network.id === networkId);
  }
  async getLogsByRunId({
    runId,
    transportId,
    fromDate,
    toDate,
    logLevel,
    filters,
    page,
    perPage
  }) {
    if (!transportId) {
      const error = new MastraError({
        id: "MASTRA_GET_LOGS_BY_RUN_ID_MISSING_TRANSPORT",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: "Transport ID is required",
        details: {
          runId,
          transportId
        }
      });
      this.#logger?.trackException(error);
      throw error;
    }
    if (!this.#logger?.getLogsByRunId) {
      const error = new MastraError({
        id: "MASTRA_GET_LOGS_BY_RUN_ID_LOGGER_NOT_CONFIGURED",
        domain: "MASTRA" /* MASTRA */,
        category: "SYSTEM" /* SYSTEM */,
        text: "Logger is not configured or does not support getLogsByRunId operation",
        details: {
          runId,
          transportId
        }
      });
      this.#logger?.trackException(error);
      throw error;
    }
    return await this.#logger.getLogsByRunId({
      runId,
      transportId,
      fromDate,
      toDate,
      logLevel,
      filters,
      page,
      perPage
    });
  }
  async getLogs(transportId, params) {
    if (!transportId) {
      const error = new MastraError({
        id: "MASTRA_GET_LOGS_MISSING_TRANSPORT",
        domain: "MASTRA" /* MASTRA */,
        category: "USER" /* USER */,
        text: "Transport ID is required",
        details: {
          transportId
        }
      });
      this.#logger?.trackException(error);
      throw error;
    }
    if (!this.#logger) {
      const error = new MastraError({
        id: "MASTRA_GET_LOGS_LOGGER_NOT_CONFIGURED",
        domain: "MASTRA" /* MASTRA */,
        category: "SYSTEM" /* SYSTEM */,
        text: "Logger is not set",
        details: {
          transportId
        }
      });
      throw error;
    }
    return await this.#logger.getLogs(transportId, params);
  }
  /**
   * Get all registered MCP server instances.
   * @returns A record of MCP server ID to MCPServerBase instance, or undefined if none are registered.
   */
  getMCPServers() {
    return this.#mcpServers;
  }
  /**
   * Get a specific MCP server instance.
   * If a version is provided, it attempts to find the server with that exact logical ID and version.
   * If no version is provided, it returns the server with the specified logical ID that has the most recent releaseDate.
   * The logical ID should match the `id` property of the MCPServer instance (typically set via MCPServerConfig.id).
   * @param serverId - The logical ID of the MCP server to retrieve.
   * @param version - Optional specific version of the MCP server to retrieve.
   * @returns The MCP server instance, or undefined if not found or if the specific version is not found.
   */
  getMCPServer(serverId, version) {
    if (!this.#mcpServers) {
      return void 0;
    }
    const allRegisteredServers = Object.values(this.#mcpServers || {});
    const matchingLogicalIdServers = allRegisteredServers.filter(server => server.id === serverId);
    if (matchingLogicalIdServers.length === 0) {
      this.#logger?.debug(`No MCP servers found with logical ID: ${serverId}`);
      return void 0;
    }
    if (version) {
      const specificVersionServer = matchingLogicalIdServers.find(server => server.version === version);
      if (!specificVersionServer) {
        this.#logger?.debug(`MCP server with logical ID '${serverId}' found, but not version '${version}'.`);
      }
      return specificVersionServer;
    } else {
      if (matchingLogicalIdServers.length === 1) {
        return matchingLogicalIdServers[0];
      }
      matchingLogicalIdServers.sort((a, b) => {
        const dateAVal = a.releaseDate && typeof a.releaseDate === "string" ? new Date(a.releaseDate).getTime() : NaN;
        const dateBVal = b.releaseDate && typeof b.releaseDate === "string" ? new Date(b.releaseDate).getTime() : NaN;
        if (isNaN(dateAVal) && isNaN(dateBVal)) return 0;
        if (isNaN(dateAVal)) return 1;
        if (isNaN(dateBVal)) return -1;
        return dateBVal - dateAVal;
      });
      if (matchingLogicalIdServers.length > 0) {
        const latestServer = matchingLogicalIdServers[0];
        if (latestServer && latestServer.releaseDate && typeof latestServer.releaseDate === "string" && !isNaN(new Date(latestServer.releaseDate).getTime())) {
          return latestServer;
        }
      }
      this.#logger?.warn(`Could not determine the latest server for logical ID '${serverId}' due to invalid or missing release dates, or no servers left after filtering.`);
      return void 0;
    }
  }
  async addTopicListener(topic, listener) {
    await this.#pubsub.subscribe(topic, listener);
  }
  async removeTopicListener(topic, listener) {
    await this.#pubsub.unsubscribe(topic, listener);
  }
  async startEventEngine() {
    for (const topic in this.#events) {
      if (!this.#events[topic]) {
        continue;
      }
      const listeners = Array.isArray(this.#events[topic]) ? this.#events[topic] : [this.#events[topic]];
      for (const listener of listeners) {
        await this.#pubsub.subscribe(topic, listener);
      }
    }
  }
  async stopEventEngine() {
    for (const topic in this.#events) {
      if (!this.#events[topic]) {
        continue;
      }
      const listeners = Array.isArray(this.#events[topic]) ? this.#events[topic] : [this.#events[topic]];
      for (const listener of listeners) {
        await this.#pubsub.unsubscribe(topic, listener);
      }
    }
    await this.#pubsub.flush();
  }
  /**
   * Shutdown Mastra and clean up all resources
   */
  async shutdown() {
    await shutdownAITracingRegistry();
    await this.stopEventEngine();
    this.#logger?.info("Mastra shutdown completed");
  }
  // This method is only used internally for server hnadlers that require temporary persistence
  get serverCache() {
    return this.#serverCache;
  }
};
Mastra = /*@__PURE__*/(_ => {
  _init = __decoratorStart(null);
  Mastra = __decorateElement(_init, 0, "Mastra", _Mastra_decorators, Mastra);
  __runInitializers(_init, 1, Mastra);
  return Mastra;
})();

export { Mastra };
