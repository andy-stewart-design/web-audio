import { createMidiInputs } from "./inputs.js";
import { MidiOutputs } from "./outputs.js";
import { WritableSignal } from "./signal.js";
import type {
  MidiDevice,
  MidiStatus,
  Signal,
  WebMidiAccess,
  WebMidiInput,
  WebMidiOutput,
} from "./types.js";

class MidiDestroyedError extends Error {
  constructor() {
    super("The MIDI instance was destroyed before access settled.");
    this.name = "MidiDestroyedError";
  }
}

const connectedPorts = <T extends WebMidiInput | WebMidiOutput>(
  ports: Iterable<T>,
) => Array.from(ports).filter((port) => port.state === "connected");

const deviceSnapshot = (ports: readonly (WebMidiInput | WebMidiOutput)[]) =>
  ports.map(({ id, name }) => ({ id, name }));

const getRequestMidiAccess = () => {
  if (typeof navigator === "undefined") return null;
  const request = navigator.requestMIDIAccess;
  if (typeof request !== "function") return null;
  return () => request.call(navigator) as Promise<WebMidiAccess>;
};

class Midi {
  private _status = new WritableSignal<MidiStatus>("pending");
  private _inputs = new WritableSignal<readonly MidiDevice[]>([]);
  private _outputs = new WritableSignal<readonly MidiDevice[]>([]);
  private _access: WebMidiAccess | null = null;
  private _destroyed = false;
  private _readySettled = false;
  private _resolveReady: (() => void) | null = null;
  private _rejectReady: ((error: unknown) => void) | null = null;
  private _error: unknown | null = null;

  readonly status: Signal<MidiStatus> = this._status;
  readonly inputs: Signal<readonly MidiDevice[]> = this._inputs;
  readonly outputs: Signal<readonly MidiDevice[]> = this._outputs;
  private _inputManager = createMidiInputs();
  readonly in = this._inputManager.inputs;
  readonly out = new MidiOutputs();
  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise<void>((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });

    const requestAccess = getRequestMidiAccess();
    if (!requestAccess) {
      this._status.set("unavailable");
      this._settleReadyFailure(
        new Error("Web MIDI is unavailable in this environment."),
      );
      return;
    }

    requestAccess().then(
      (access) => this._handleAccess(access),
      (error: unknown) => this._handleAccessFailure(error),
    );
  }

  get error() {
    return this._error;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._access) {
      this._access.onstatechange = null;
      this._access = null;
    }
    this._inputManager.destroy();
    this.out.destroy();

    if (!this._readySettled) {
      this._settleReadyFailure(new MidiDestroyedError());
    }

    this._status.set("destroyed");
    this._inputs.set([]);
    this._outputs.set([]);
  }

  private _handleAccess(access: WebMidiAccess) {
    if (this._destroyed) return;

    this._access = access;
    access.onstatechange = () => this._refreshPorts();
    this._refreshPorts();
    this._status.set("connected");
    this._readySettled = true;
    this._resolveReady?.();
    this._clearReadyCallbacks();
  }

  private _handleAccessFailure(error: unknown) {
    if (this._destroyed) return;

    this._error = error;
    const denied =
      error instanceof DOMException
        ? error.name === "NotAllowedError"
        : error instanceof Error && error.name === "NotAllowedError";
    this._status.set(denied ? "denied" : "error");
    this._settleReadyFailure(error);
  }

  private _refreshPorts() {
    if (!this._access || this._destroyed) return;

    const inputs = connectedPorts(this._access.inputs.values());
    const outputs = connectedPorts(this._access.outputs.values());
    this._inputManager.setPorts(inputs);
    this._inputs.set(deviceSnapshot(inputs));
    this._outputs.set(deviceSnapshot(outputs));
  }

  private _settleReadyFailure(error: unknown) {
    this._readySettled = true;
    this._rejectReady?.(error);
    this._clearReadyCallbacks();
  }

  private _clearReadyCallbacks() {
    this._resolveReady = null;
    this._rejectReady = null;
  }
}

export { Midi, MidiDestroyedError };
