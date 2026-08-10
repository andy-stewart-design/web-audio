import {
  Midi,
  MidiDestroyedError,
  type MidiDevice,
  type MidiSendResult,
} from "@web-audio/midi";

const selector = <T extends Element>(root: Element, value: string) => {
  const element = root.querySelector<T>(value);
  if (!element) throw new Error(`Missing MIDI demo element: ${value}`);
  return element;
};

const scopedSelector = <T extends Element>(root: Element, value: string) => {
  const element = root.querySelector<T>(value);
  if (!element) throw new Error(`Missing MIDI control: ${value}`);
  return element;
};

const errorMessage = (value: unknown) =>
  value instanceof Error ? `${value.name}: ${value.message}` : String(value);

export const setupMidi = (root: HTMLElement) => {
  const status = selector<HTMLOutputElement>(root, "[data-status]");
  const error = selector<HTMLParagraphElement>(root, "[data-error]");
  const enable = selector<HTMLButtonElement>(root, "[data-enable]");
  const disable = selector<HTMLButtonElement>(root, "[data-disable]");
  const inputs = selector<HTMLDivElement>(root, "[data-inputs]");
  const outputs = selector<HTMLDivElement>(root, "[data-outputs]");
  const inputCount = selector<HTMLOutputElement>(root, "[data-input-count]");
  const outputCount = selector<HTMLOutputElement>(root, "[data-output-count]");
  const notes = selector<HTMLDivElement>(root, "[data-notes]");
  const noteCount = selector<HTMLOutputElement>(root, "[data-note-count]");
  const ccTarget = selector<HTMLSelectElement>(root, "[data-cc-input-target]");
  const outputTarget = selector<HTMLSelectElement>(
    root,
    "[data-output-target]",
  );
  const noteForm = selector<HTMLFormElement>(root, "[data-note-form]");
  const ccForm = selector<HTMLFormElement>(root, "[data-cc-form]");
  const sendResult = selector<HTMLOutputElement>(root, "[data-send-result]");
  const monitoredCcs = [1, 7, 74];

  let midi: Midi | null = null;
  let unsubscribe: (() => void)[] = [];
  const ccUnsubscribe = new Map<number, () => void>();
  const controllerCleanup: (() => void)[] = [];

  const renderDevices = (
    container: HTMLDivElement,
    devices: readonly MidiDevice[],
    emptyMessage: string,
  ) => {
    container.replaceChildren();
    container.dataset.empty = String(devices.length === 0);

    if (devices.length === 0) {
      container.textContent = emptyMessage;
      return;
    }

    for (const device of devices) {
      const row = document.createElement("div");
      row.dataset.device = "";
      const name = document.createElement("strong");
      name.textContent = device.name ?? "Unnamed device";
      const id = document.createElement("code");
      id.textContent = device.id;
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy ID";
      copy.addEventListener("click", () => {
        void navigator.clipboard.writeText(device.id).then(() => {
          copy.textContent = "Copied";
          window.setTimeout(() => (copy.textContent = "Copy ID"), 1000);
        });
      });
      row.append(name, id, copy);
      container.append(row);
    }
  };

  const bindCc = (cc: number) => {
    ccUnsubscribe.get(cc)?.();
    ccUnsubscribe.delete(cc);
    if (!midi) return;

    const card = selector<HTMLElement>(root, `[data-cc="${cc}"]`);
    const channelEnabled = scopedSelector<HTMLInputElement>(
      card,
      "[data-channel-enabled]",
    ).checked;
    const channel = scopedSelector<HTMLInputElement>(card, "[data-channel]");
    const unscoped = ccTarget.value
      ? midi.in.cc(ccTarget.value, cc)
      : midi.in.cc(cc);
    const signal = channelEnabled
      ? unscoped.channel(Number(channel.value))
      : unscoped;

    ccUnsubscribe.set(
      cc,
      signal.subscribe(() => {
        scopedSelector<HTMLOutputElement>(card, "output").value =
          signal.value.toFixed(3);
        scopedSelector<HTMLProgressElement>(card, "progress").value =
          signal.value;
        scopedSelector<HTMLElement>(card, "small").textContent = signal.hasValue
          ? `raw ${signal.raw} · channel ${signal.receivedChannel} · ${signal.deviceId}`
          : "No value received";
      }),
    );
  };

  const bindAllCcs = () => monitoredCcs.forEach(bindCc);

  const renderInputTargets = (devices: readonly MidiDevice[]) => {
    const selected = ccTarget.value;
    ccTarget.replaceChildren(new Option("All connected inputs", ""));
    for (const device of devices) {
      ccTarget.add(
        new Option(
          `${device.name ?? "Unnamed device"} — ${device.id}`,
          device.id,
        ),
      );
    }
    ccTarget.disabled = !midi;
    if (devices.some((device) => device.id === selected)) {
      ccTarget.value = selected;
    } else {
      bindAllCcs();
    }
  };

  const renderOutputTargets = (devices: readonly MidiDevice[]) => {
    const selected = outputTarget.value;
    outputTarget.replaceChildren();
    if (devices.length === 0) {
      outputTarget.add(new Option("No connected outputs", ""));
      outputTarget.disabled = true;
      return;
    }
    for (const device of devices) {
      outputTarget.add(
        new Option(
          `${device.name ?? "Unnamed device"} — ${device.id}`,
          device.id,
        ),
      );
    }
    outputTarget.disabled = false;
    if (devices.some((device) => device.id === selected)) {
      outputTarget.value = selected;
    }
  };

  const showSendResult = (result: MidiSendResult) => {
    sendResult.value = result.sent
      ? "Message sent"
      : `Message not sent: ${result.reason}`;
  };

  const selectedOutput = () => {
    if (!midi || !outputTarget.value) {
      sendResult.value = "Select a connected output";
      return null;
    }
    return outputTarget.value;
  };

  const onEnable = () => {
    if (midi) return;
    error.hidden = true;
    enable.disabled = true;
    disable.disabled = false;
    midi = new Midi();
    const instance = midi;

    unsubscribe = [
      instance.status.subscribe((value) => {
        status.value = value;
        status.dataset.status = value;
      }),
      instance.inputs.subscribe((devices) => {
        inputCount.value = String(devices.length);
        renderDevices(inputs, devices, "No connected inputs");
        renderInputTargets(devices);
      }),
      instance.outputs.subscribe((devices) => {
        outputCount.value = String(devices.length);
        renderDevices(outputs, devices, "No connected outputs");
        renderOutputTargets(devices);
      }),
    ];
    bindAllCcs();

    const heldNotes = instance.in.notes();
    unsubscribe.push(
      heldNotes.subscribe((held) => {
        const sorted = Array.from(held).sort(
          (a, b) =>
            a.note - b.note ||
            a.deviceId.localeCompare(b.deviceId) ||
            a.channel - b.channel,
        );
        noteCount.value = String(sorted.length);
        notes.replaceChildren();
        notes.dataset.empty = String(sorted.length === 0);
        if (sorted.length === 0) {
          notes.textContent = "Play notes on a connected input";
          return;
        }
        for (const note of sorted) {
          const item = document.createElement("div");
          item.dataset.note = "";
          item.textContent = `${note.note} · velocity ${note.velocity}`;
          const source = document.createElement("small");
          source.textContent = `${note.deviceId} · channel ${note.channel}`;
          item.append(source);
          notes.append(item);
        }
      }),
    );

    void instance.ready.catch((reason: unknown) => {
      if (reason instanceof MidiDestroyedError) return;
      error.textContent = errorMessage(reason);
      error.hidden = false;
    });
  };

  const onDisable = () => {
    midi?.destroy();
    unsubscribe.forEach((off) => off());
    unsubscribe = [];
    ccUnsubscribe.forEach((off) => off());
    ccUnsubscribe.clear();
    midi = null;
    enable.disabled = false;
    disable.disabled = true;
    ccTarget.disabled = true;
    outputTarget.disabled = true;
    status.value = "disabled";
    status.dataset.status = "disabled";
  };

  const onNoteSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    const target = selectedOutput();
    if (!target || !midi) return;
    const data = new FormData(noteForm);
    const options = {
      note: Number(data.get("note")),
      velocity: Number(data.get("velocity")),
      channel: Number(data.get("channel")),
    };
    const action =
      event.submitter instanceof HTMLButtonElement
        ? event.submitter.value
        : "on";
    showSendResult(
      action === "off"
        ? midi.out.noteOff(target, options)
        : midi.out.noteOn(target, options),
    );
  };

  const onCcSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    const target = selectedOutput();
    if (!target || !midi) return;
    const data = new FormData(ccForm);
    showSendResult(
      midi.out.cc(target, {
        cc: Number(data.get("cc")),
        value: Number(data.get("value")),
        channel: Number(data.get("channel")),
      }),
    );
  };

  for (const cc of monitoredCcs) {
    const card = selector<HTMLElement>(root, `[data-cc="${cc}"]`);
    const enabled = scopedSelector<HTMLInputElement>(
      card,
      "[data-channel-enabled]",
    );
    const channel = scopedSelector<HTMLInputElement>(card, "[data-channel]");
    const onChannelEnabled = () => {
      channel.disabled = !enabled.checked;
      bindCc(cc);
    };
    const onChannelChange = () => bindCc(cc);
    enabled.addEventListener("change", onChannelEnabled);
    channel.addEventListener("change", onChannelChange);
    controllerCleanup.push(() => {
      enabled.removeEventListener("change", onChannelEnabled);
      channel.removeEventListener("change", onChannelChange);
    });
  }

  enable.addEventListener("click", onEnable);
  disable.addEventListener("click", onDisable);
  ccTarget.addEventListener("change", bindAllCcs);
  noteForm.addEventListener("submit", onNoteSubmit);
  ccForm.addEventListener("submit", onCcSubmit);

  return () => {
    enable.removeEventListener("click", onEnable);
    disable.removeEventListener("click", onDisable);
    ccTarget.removeEventListener("change", bindAllCcs);
    noteForm.removeEventListener("submit", onNoteSubmit);
    ccForm.removeEventListener("submit", onCcSubmit);
    controllerCleanup.forEach((cleanup) => cleanup());
    onDisable();
  };
};
