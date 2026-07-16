import {
  Midi,
  MidiDestroyedError,
  type MidiDevice,
  type MidiSendResult,
} from "@web-audio/midi";
import "./style.css";

const element = <T extends Element>(selector: string) => {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`Missing element: ${selector}`);
  return match;
};

const status = element<HTMLSpanElement>("#status");
const error = element<HTMLParagraphElement>("#error");
const enableButton = element<HTMLButtonElement>("#enable");
const disableButton = element<HTMLButtonElement>("#disable");
const inputsElement = element<HTMLDivElement>("#inputs");
const outputsElement = element<HTMLDivElement>("#outputs");
const inputCount = element<HTMLSpanElement>("#input-count");
const outputCount = element<HTMLSpanElement>("#output-count");
const notesElement = element<HTMLDivElement>("#notes");
const noteCount = element<HTMLSpanElement>("#note-count");
const ccInputTarget = element<HTMLSelectElement>("#cc-input-target");
const outputTarget = element<HTMLSelectElement>("#output-target");
const noteForm = element<HTMLFormElement>("#note-form");
const ccForm = element<HTMLFormElement>("#cc-form");
const sendResult = element<HTMLOutputElement>("#send-result");

const monitoredCcs = [1, 7, 74];
let midi: Midi | null = null;
let unsubscribe: (() => void)[] = [];
const ccUnsubscribe = new Map<number, () => void>();

const errorMessage = (value: unknown) =>
  value instanceof Error ? `${value.name}: ${value.message}` : String(value);

const renderDevices = (
  container: HTMLDivElement,
  devices: readonly MidiDevice[],
) => {
  container.replaceChildren();
  container.classList.toggle("empty", devices.length === 0);
  if (devices.length === 0) {
    container.textContent = "No connected devices";
    return;
  }

  for (const device of devices) {
    const row = document.createElement("div");
    row.className = "device";

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

const renderInputTargets = (devices: readonly MidiDevice[]) => {
  const selected = ccInputTarget.value;
  ccInputTarget.replaceChildren(new Option("All connected inputs", ""));

  for (const device of devices) {
    ccInputTarget.add(
      new Option(
        `${device.name ?? "Unnamed device"} — ${device.id}`,
        device.id,
      ),
    );
  }
  ccInputTarget.disabled = !midi;
  if (devices.some((device) => device.id === selected)) {
    ccInputTarget.value = selected;
  } else if (selected) {
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

const renderCc = (cc: number, signal: ReturnType<Midi["in"]["cc"]>) => {
  const card = element<HTMLElement>(`.cc[data-cc="${cc}"]`);
  scopedElement<HTMLOutputElement>("output", card).value =
    signal.value.toFixed(3);
  scopedElement<HTMLProgressElement>("progress", card).value = signal.value;
  scopedElement<HTMLElement>("small", card).textContent = signal.hasValue
    ? `raw ${signal.raw} · channel ${signal.receivedChannel} · ${signal.deviceId}`
    : "No value received";
};

const scopedElement = <T extends Element>(
  selector: string,
  parent: Element,
) => {
  const match = parent.querySelector<T>(selector);
  if (!match) throw new Error(`Missing element: ${selector}`);
  return match;
};

const bindCc = (cc: number) => {
  ccUnsubscribe.get(cc)?.();
  ccUnsubscribe.delete(cc);
  if (!midi) return;

  const card = element<HTMLElement>(`.cc[data-cc="${cc}"]`);
  const channelEnabled = scopedElement<HTMLInputElement>(
    "[data-channel-enabled]",
    card,
  ).checked;
  const channel = scopedElement<HTMLInputElement>("[data-channel]", card);
  const unscoped = ccInputTarget.value
    ? midi.in.cc(ccInputTarget.value, cc)
    : midi.in.cc(cc);
  const signal = channelEnabled
    ? unscoped.channel(Number(channel.value))
    : unscoped;
  ccUnsubscribe.set(
    cc,
    signal.subscribe(() => renderCc(cc, signal)),
  );
};

const bindAllCcs = () => monitoredCcs.forEach(bindCc);

for (const cc of monitoredCcs) {
  const card = element<HTMLElement>(`.cc[data-cc="${cc}"]`);
  const enabled = scopedElement<HTMLInputElement>(
    "[data-channel-enabled]",
    card,
  );
  const channel = scopedElement<HTMLInputElement>("[data-channel]", card);
  enabled.addEventListener("change", () => {
    channel.disabled = !enabled.checked;
    bindCc(cc);
  });
  channel.addEventListener("change", () => bindCc(cc));
}
ccInputTarget.addEventListener("change", bindAllCcs);

const showSendResult = (result: MidiSendResult) => {
  sendResult.textContent = result.sent
    ? "Message sent"
    : `Message not sent: ${result.reason}`;
};

const selectedOutput = () => {
  if (!midi || !outputTarget.value) {
    sendResult.textContent = "Select a connected output";
    return null;
  }
  return outputTarget.value;
};

enableButton.addEventListener("click", () => {
  if (midi) return;

  error.hidden = true;
  enableButton.disabled = true;
  disableButton.disabled = false;
  midi = new Midi();
  const instance = midi;

  unsubscribe = [
    instance.status.subscribe((value) => {
      status.textContent = value;
      status.dataset.status = value;
    }),
    instance.inputs.subscribe((devices) => {
      inputCount.textContent = String(devices.length);
      renderDevices(inputsElement, devices);
      renderInputTargets(devices);
    }),
    instance.outputs.subscribe((devices) => {
      outputCount.textContent = String(devices.length);
      renderDevices(outputsElement, devices);
      renderOutputTargets(devices);
    }),
  ];

  bindAllCcs();

  const notes = instance.in.notes();
  unsubscribe.push(
    notes.subscribe((held) => {
      const sorted = Array.from(held).sort(
        (a, b) =>
          a.note - b.note ||
          a.deviceId.localeCompare(b.deviceId) ||
          a.channel - b.channel,
      );
      noteCount.textContent = String(sorted.length);
      notesElement.replaceChildren();
      notesElement.classList.toggle("empty", sorted.length === 0);
      if (sorted.length === 0) {
        notesElement.textContent = "Play notes on a connected input";
        return;
      }
      for (const note of sorted) {
        const item = document.createElement("div");
        item.className = "note";
        item.textContent = `${note.note} · velocity ${note.velocity}`;
        const source = document.createElement("small");
        source.textContent = `${note.deviceId} · channel ${note.channel}`;
        item.append(source);
        notesElement.append(item);
      }
    }),
  );

  void instance.ready.catch((reason: unknown) => {
    if (reason instanceof MidiDestroyedError) return;
    error.textContent = errorMessage(reason);
    error.hidden = false;
  });
});

disableButton.addEventListener("click", () => {
  if (!midi) return;
  midi.destroy();
  unsubscribe.forEach((fn) => fn());
  unsubscribe = [];
  ccUnsubscribe.forEach((fn) => fn());
  ccUnsubscribe.clear();
  midi = null;
  enableButton.disabled = false;
  disableButton.disabled = true;
  ccInputTarget.disabled = true;
  outputTarget.disabled = true;
  status.textContent = "disabled";
  status.dataset.status = "disabled";
});

noteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const target = selectedOutput();
  if (!target || !midi) return;
  const data = new FormData(noteForm);
  const options = {
    note: Number(data.get("note")),
    velocity: Number(data.get("velocity")),
    channel: Number(data.get("channel")),
  };
  const submitter = event.submitter;
  const action =
    submitter instanceof HTMLButtonElement ? submitter.value : "on";
  showSendResult(
    action === "off"
      ? midi.out.noteOff(target, options)
      : midi.out.noteOn(target, options),
  );
});

ccForm.addEventListener("submit", (event) => {
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
});
