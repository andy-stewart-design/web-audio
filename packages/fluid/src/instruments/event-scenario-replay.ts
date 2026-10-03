// Test-only replay drivers. Neither path adapts the other's state; the native
// driver delegates decoding, transitions, configuration, and compilation to
// the same isolated helpers intended for the production cutover.
import { RandomCycle } from "@web-audio/patterns";
import Drome from "../index";
import Sampler from "./sampler";
import {
  decodeNotesInputGeometry,
  decodeSampleNamesInput,
  decodeVariationsInputGeometry,
} from "@/patterns/decode-structured-input";
import { decodeXoxInputGeometry } from "@/patterns/decode-xox-input";
import type { InstrumentEventState } from "./event-state";
import type {
  EventSchemaFixture,
  EventScenarioOperation,
} from "./event-schema-fixtures";
import {
  createSamplerEventState,
  createSynthEventState,
  replaceEventNotes,
  replaceSampleNames,
  replaceEventVariation,
  replaceEventTiming,
  composeEventTiming,
  setEventRoot,
  setEventScale,
  transformEventState,
} from "./event-state-transitions";
import {
  compileSamplerEventState,
  compileSynthEventState,
} from "./event-state-compiler";
import {
  getGeneratedSamplerTiming,
  setSamplerEventFit,
  setSamplerEventChop,
  type SamplerTimingConfiguration,
} from "./event-state-sampler-timing";

type ScenarioInput = Pick<EventSchemaFixture, "instrument" | "sampleName">;
type NativeScenario = {
  state: InstrumentEventState;
  configuration: SamplerTimingConfiguration;
};

function getTransform(operation: EventScenarioOperation) {
  switch (operation.method) {
    case "reverse":
      return { type: "reverse" } as const;
    case "fast":
    case "slow":
      return { type: operation.method, multiplier: operation.args[0] } as const;
    case "stretch":
      return {
        type: "stretch",
        bars: operation.args[0],
        steps: operation.args[1],
      } as const;
    default:
      throw new Error(`Not an event transform: ${operation.method}.`);
  }
}

function createNativeScenario({ instrument, sampleName }: ScenarioInput) {
  return {
    state:
      instrument === "synth"
        ? createSynthEventState()
        : createSamplerEventState(sampleName),
    configuration: Object.freeze({}),
  } satisfies NativeScenario;
}

function applyNativeOperation(
  scenario: NativeScenario,
  operation: EventScenarioOperation,
) {
  const { state, configuration } = scenario;
  const updated = (state: InstrumentEventState) => ({ ...scenario, state });
  switch (operation.method) {
    case "notes": {
      const decoded = decodeNotesInputGeometry(operation.args);
      return updated(
        replaceEventNotes(
          state,
          decoded.cycle,
          decoded.zeroWidthPatterns,
          "noteValueSlots" in decoded ? decoded.noteValueSlots : undefined,
        ),
      );
    }
    case "xox": {
      const decoded = decodeXoxInputGeometry(operation.args);
      return updated(
        operation.args[0] instanceof RandomCycle
          ? replaceEventTiming(
              state,
              decoded.cycle,
              decoded.condition,
              decoded.zeroWidthPatterns,
            )
          : composeEventTiming(state, decoded.cycle, decoded.zeroWidthPatterns),
      );
    }
    case "root":
      return updated(setEventRoot(state, ...operation.args));
    case "scale":
      return updated(setEventScale(state, ...operation.args));
    case "reverse":
    case "fast":
    case "slow":
    case "stretch": {
      return updated(
        transformEventState(state, getTransform(operation), {
          timingOverride:
            state.type === "sampler"
              ? getGeneratedSamplerTiming(state, configuration)
              : undefined,
        }),
      );
    }
    default:
      if (state.type !== "sampler")
        throw new Error(`Cannot replay ${operation.method} on a synth.`);
      switch (operation.method) {
        case "name":
          return updated(
            replaceSampleNames(state, decodeSampleNamesInput(operation.args)),
          );
        case "variation":
        case "var": {
          const decoded = decodeVariationsInputGeometry(operation.args);
          return updated(
            replaceEventVariation(
              state,
              decoded.cycle,
              decoded.zeroWidthPatterns,
            ),
          );
        }
        case "fit":
          return setSamplerEventFit(state, configuration, ...operation.args);
        case "chop": {
          const [sliceCount, ...sequence] = operation.args;
          return setSamplerEventChop(
            state,
            configuration,
            sliceCount,
            ...sequence,
          );
        }
      }
  }
}

function compileNativeScenario({ state, configuration }: NativeScenario) {
  return state.type === "synth"
    ? compileSynthEventState(state)
    : compileSamplerEventState(state, {
        timingOverride: getGeneratedSamplerTiming(state, configuration),
      });
}

function replayNativeScenario(
  input: ScenarioInput,
  operations: readonly EventScenarioOperation[],
) {
  return operations.reduce(applyNativeOperation, createNativeScenario(input));
}

function createPublicScenario({ instrument, sampleName }: ScenarioInput) {
  const d = new Drome();
  return instrument === "synth" ? d.synth() : d.sample(sampleName);
}

function applyPublicOperation(
  instrument: ReturnType<typeof createPublicScenario>,
  operation: EventScenarioOperation,
) {
  switch (operation.method) {
    case "notes":
      return instrument.notes(...operation.args);
    case "xox":
      return instrument.xox(...operation.args);
    case "root":
      return instrument.root(...operation.args);
    case "scale":
      return instrument.scale(...operation.args);
    case "reverse":
      return instrument.reverse();
    case "fast":
      return instrument.fast(...operation.args);
    case "slow":
      return instrument.slow(...operation.args);
    case "stretch":
      return instrument.stretch(...operation.args);
    default:
      if (!(instrument instanceof Sampler))
        throw new Error(`Cannot replay ${operation.method} on a synth.`);
      switch (operation.method) {
        case "name":
          return instrument.name(...operation.args);
        case "variation":
          return instrument.variation(...operation.args);
        case "var":
          return instrument.var(...operation.args);
        case "fit":
          return instrument.fit(...operation.args);
        case "chop": {
          const [sliceCount, ...sequence] = operation.args;
          return instrument.chop(sliceCount, ...sequence);
        }
      }
  }
}

function replayPublicScenario(
  input: ScenarioInput,
  operations: readonly EventScenarioOperation[],
) {
  return operations.reduce(applyPublicOperation, createPublicScenario(input));
}

function toSerializableEventPattern(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function describeOperations(operations: readonly EventScenarioOperation[]) {
  return operations
    .map(({ method, args }) => `${method}(${JSON.stringify(args)})`)
    .join(" → ");
}

export {
  createNativeScenario,
  applyNativeOperation,
  compileNativeScenario,
  replayNativeScenario,
  createPublicScenario,
  applyPublicOperation,
  replayPublicScenario,
  toSerializableEventPattern,
  describeOperations,
  type NativeScenario,
};
