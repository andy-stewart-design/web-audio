import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Saturator from "../saturator";

class FakeAudioParam {
  value = 1;
}

class FakeMessagePort {
  static postError: Error | undefined;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly postMessage = vi.fn(() => {
    this.order.push("postMessage");
    if (FakeMessagePort.postError) throw FakeMessagePort.postError;
  });
  readonly close = vi.fn(() => this.order.push("close"));

  constructor(readonly order: string[]) {}
}

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  static missingParameter: string | undefined;
  readonly order: string[] = [];
  readonly port = new FakeMessagePort(this.order);
  readonly parameters = new Map<string, FakeAudioParam>([
    ["drive", new FakeAudioParam()],
    ["postgain", new FakeAudioParam()],
  ]);
  readonly connect = vi.fn((destination: AudioNode) => destination);
  readonly disconnect = vi.fn(() => this.order.push("disconnect"));
  readonly listeners = new Map<string, Set<EventListener>>();
  readonly addEventListener = vi.fn((type: string, listener: EventListener) => {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  });
  readonly removeEventListener = vi.fn(
    (type: string, listener: EventListener) => {
      this.listeners.get(type)?.delete(listener);
    },
  );

  constructor(
    readonly context: BaseAudioContext,
    readonly name: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    if (FakeAudioWorkletNode.missingParameter)
      this.parameters.delete(FakeAudioWorkletNode.missingParameter);
    FakeAudioWorkletNode.instances.push(this);
  }

  emit(type: string, event = new Event(type)) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeAudioContext {}

function createSaturator(options?: ConstructorParameters<typeof Saturator>[1]) {
  return new Saturator(
    new FakeAudioContext() as unknown as BaseAudioContext,
    options,
  );
}

beforeEach(() => {
  FakeAudioWorkletNode.instances = [];
  FakeAudioWorkletNode.missingParameter = undefined;
  FakeMessagePort.postError = undefined;
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Saturator", () => {
  it("constructs one worklet and exposes both parameters", () => {
    const saturator = createSaturator();
    const node = FakeAudioWorkletNode.instances[0];
    const destination = {} as AudioNode;

    expect(node.name).toBe("saturator-processor");
    expect(node.options).toEqual({
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
    expect(saturator.node).toBe(node);
    expect(saturator.drive).toBe(node.parameters.get("drive"));
    expect(saturator.postgain).toBe(node.parameters.get("postgain"));
    expect(saturator.connect(destination)).toBe(destination);
  });

  it.each(["drive", "postgain"])(
    "releases the node when %s is missing",
    (missingParameter) => {
      FakeAudioWorkletNode.missingParameter = missingParameter;

      expect(() => createSaturator()).toThrow(
        `Missing saturator AudioParam: ${missingParameter}`,
      );

      const node = FakeAudioWorkletNode.instances[0];
      expect(node.port.postMessage).toHaveBeenCalledOnce();
      expect(node.port.postMessage).toHaveBeenCalledWith({ type: "dispose" });
      expect(node.disconnect).toHaveBeenCalledOnce();
      expect(node.port.close).toHaveBeenCalledOnce();
      expect(node.order.indexOf("postMessage")).toBeLessThan(
        node.order.indexOf("disconnect"),
      );
      expect(node.order.indexOf("postMessage")).toBeLessThan(
        node.order.indexOf("close"),
      );
      expect(node.port.onmessage).toBeNull();
      expect(node.removeEventListener).toHaveBeenCalledTimes(2);
    },
  );

  it("preserves setup failure when the disposal post fails", () => {
    FakeAudioWorkletNode.missingParameter = "drive";
    const postError = new Error("post failed");
    FakeMessagePort.postError = postError;

    expect(() => createSaturator()).toThrow(
      "Missing saturator AudioParam: drive",
    );

    const instance = FakeAudioWorkletNode.instances[0];
    expect(instance.port.postMessage).toHaveBeenCalledOnce();
    expect(instance.disconnect).toHaveBeenCalledOnce();
    expect(instance.port.close).toHaveBeenCalledOnce();
    expect(instance.order).toEqual(["postMessage", "disconnect", "close"]);
  });

  it("disposes through the processor protocol and cleans every resource once", () => {
    const saturator = createSaturator();
    const node = FakeAudioWorkletNode.instances[0];
    const stale = new Event("processorerror");

    saturator.dispose();
    saturator.dispose();
    node.emit("processorerror", stale);

    expect(node.port.postMessage).toHaveBeenCalledOnce();
    expect(node.port.postMessage).toHaveBeenCalledWith({ type: "dispose" });
    expect(node.disconnect).toHaveBeenCalledOnce();
    expect(node.port.close).toHaveBeenCalledOnce();
    expect(node.removeEventListener).toHaveBeenCalledTimes(2);
    expect(node.port.onmessage).toBeNull();
  });

  it.each(["processorerror", "error"])(
    "reports %s once, disposes the failed path, and ignores stale callbacks",
    (type) => {
      const report = vi.spyOn(console, "error").mockImplementation(() => {});
      const onerror = vi.fn();
      const saturator = createSaturator({ onerror });
      const node = FakeAudioWorkletNode.instances[0];
      const event = new Event(type);

      node.emit(type, event);
      node.emit(type, new Event(type));
      saturator.dispose();

      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(
        "Saturator AudioWorklet processor failed",
        event,
      );
      expect(onerror).toHaveBeenCalledOnce();
      expect(onerror).toHaveBeenCalledWith(event);
      expect(node.port.postMessage).toHaveBeenCalledOnce();
      expect(node.disconnect).toHaveBeenCalledOnce();
      expect(node.port.close).toHaveBeenCalledOnce();
    },
  );

  it("cleans listeners and disconnects when port disposal fails", () => {
    const saturator = createSaturator();
    const node = FakeAudioWorkletNode.instances[0];
    const cleanupError = new Error("port close failed");
    node.port.close.mockImplementation(() => {
      throw cleanupError;
    });

    expect(() => saturator.dispose()).toThrow(cleanupError);
    expect(node.disconnect).toHaveBeenCalledOnce();
    expect(node.removeEventListener).toHaveBeenCalledTimes(2);
    expect(() => saturator.dispose()).not.toThrow();
    expect(node.disconnect).toHaveBeenCalledOnce();
  });
});
