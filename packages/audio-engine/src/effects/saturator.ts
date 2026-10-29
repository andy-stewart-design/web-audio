interface SaturatorOptions {
  onerror?: (event: Event) => void;
}

function getParameter(node: AudioWorkletNode, name: string) {
  const parameter = node.parameters.get(name);
  if (!parameter) throw new Error(`Missing saturator AudioParam: ${name}`);
  return parameter;
}

class Saturator {
  readonly node: AudioWorkletNode;
  readonly drive: AudioParam;
  readonly postgain: AudioParam;
  onerror: ((event: Event) => void) | null;

  private _disposed = false;
  private _cleaned = false;
  private _processorErrorReported = false;
  private readonly _onProcessorError = (event: Event) => {
    if (this._disposed) return;
    if (!this._processorErrorReported) {
      this._processorErrorReported = true;
      console.error("Saturator AudioWorklet processor failed", event);
    }
    try {
      this.dispose();
    } catch (error) {
      console.error("Saturator AudioWorklet cleanup failed", error);
    }
    this.onerror?.(event);
  };

  constructor(ctx: BaseAudioContext, options: SaturatorOptions = {}) {
    this.onerror = options.onerror ?? null;
    this.node = new AudioWorkletNode(ctx, "saturator-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });

    try {
      this.drive = getParameter(this.node, "drive");
      this.postgain = getParameter(this.node, "postgain");
      this.node.addEventListener("processorerror", this._onProcessorError);
      this.node.addEventListener("error", this._onProcessorError);
    } catch (error) {
      this._disposed = true;
      try {
        this.node.port.postMessage({ type: "dispose" });
      } catch {
        // Preserve the setup error.
      } finally {
        try {
          this._cleanup();
        } catch {
          // Preserve the setup error.
        }
      }
      throw error;
    }
  }

  connect(destination: AudioNode) {
    return this.node.connect(destination);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    try {
      this.node.port.postMessage({ type: "dispose" });
    } finally {
      this._cleanup();
    }
  }

  private _cleanup() {
    if (this._cleaned) return;
    this._cleaned = true;

    let firstError: unknown;
    const attempt = (cleanup: () => void) => {
      try {
        cleanup();
      } catch (error) {
        firstError ??= error;
      }
    };

    this.node.port.onmessage = null;
    attempt(() =>
      this.node.removeEventListener("processorerror", this._onProcessorError),
    );
    attempt(() =>
      this.node.removeEventListener("error", this._onProcessorError),
    );
    attempt(() => this.node.disconnect());
    attempt(() => this.node.port.close());

    if (firstError) throw firstError;
  }
}

export default Saturator;
export type { SaturatorOptions };
