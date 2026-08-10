const defaultSource = "/tay.mp3";
const minimumClipDuration = 0.01;
const fadeDuration = 0.005;

type Direction = "forward" | "reverse";
type Voice = { source: AudioBufferSourceNode; gain: GainNode };

const selector = <T extends Element>(root: Element, value: string) => {
  const element = root.querySelector<T>(value);
  if (!element) throw new Error(`Missing scratch demo element: ${value}`);
  return element;
};

const reverseBuffer = (context: AudioContext, source: AudioBuffer) => {
  const reversed = context.createBuffer(
    source.numberOfChannels,
    source.length,
    source.sampleRate,
  );

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    reversed.copyToChannel(
      source.getChannelData(channel).slice().reverse(),
      channel,
    );
  }

  return reversed;
};

export const setupScratch = (root: HTMLElement) => {
  const file = selector<HTMLInputElement>(root, "[data-file]");
  const sourceName = selector<HTMLOutputElement>(root, "[data-source-name]");
  const status = selector<HTMLOutputElement>(root, "[data-status]");
  const error = selector<HTMLParagraphElement>(root, "[data-error]");
  const metadata = selector<HTMLDListElement>(root, "[data-metadata]");
  const start = selector<HTMLInputElement>(root, "[data-slice-start]");
  const duration = selector<HTMLInputElement>(root, "[data-slice-duration]");
  const startValue = selector<HTMLOutputElement>(
    root,
    "[data-slice-start-value]",
  );
  const durationValue = selector<HTMLOutputElement>(
    root,
    "[data-slice-duration-value]",
  );
  const forward = selector<HTMLButtonElement>(root, "[data-forward]");
  const reverse = selector<HTMLButtonElement>(root, "[data-reverse]");
  const eventLog = selector<HTMLOListElement>(root, "[data-event-log]");

  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let original: AudioBuffer | null = null;
  let reversed: AudioBuffer | null = null;
  let pendingDefault: Promise<ArrayBuffer> | null = null;
  let defaultData: ArrayBuffer | null = null;
  const activeVoices = new Set<Voice>();

  const setStatus = (message: string, state: string) => {
    status.value = message;
    status.dataset.state = state;
  };

  const addEvent = (message: string) => {
    const item = document.createElement("li");
    item.textContent = message;
    eventLog.prepend(item);
    while (eventLog.children.length > 12) eventLog.lastElementChild?.remove();
  };

  const setMetadata = (buffer: AudioBuffer | null) => {
    metadata.replaceChildren();
    if (!buffer) {
      metadata.hidden = true;
      return;
    }

    metadata.hidden = false;
    const values = [
      ["Duration", `${buffer.duration.toFixed(3)} seconds`],
      ["Sample rate", `${buffer.sampleRate} Hz`],
      ["Channels", String(buffer.numberOfChannels)],
      ["Frames", String(buffer.length)],
    ];
    for (const [label, value] of values) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      metadata.append(term, description);
    }
  };

  const updateSliceControls = () => {
    if (!original) return;

    const maxStart = Math.max(0, original.duration - minimumClipDuration);
    const resolvedStart = Math.min(Math.max(start.valueAsNumber, 0), maxStart);
    start.max = String(maxStart);
    start.value = String(resolvedStart);

    const maxDuration = Math.max(
      minimumClipDuration,
      original.duration - resolvedStart,
    );
    const resolvedDuration = Math.min(
      Math.max(duration.valueAsNumber, minimumClipDuration),
      maxDuration,
    );
    duration.max = String(maxDuration);
    duration.value = String(resolvedDuration);
    startValue.value = `${resolvedStart.toFixed(3)} s`;
    durationValue.value = `${resolvedDuration.toFixed(3)} s`;
  };

  const setPlayable = (playable: boolean) => {
    forward.disabled = !playable;
    reverse.disabled = !playable;
  };

  const setSliceControlsEnabled = (enabled: boolean) => {
    start.disabled = !enabled;
    duration.disabled = !enabled;
  };

  const getContext = () => {
    if (!context) {
      context = new AudioContext();
      masterGain = new GainNode(context, { gain: 0.8 });
      masterGain.connect(context.destination);
    }
    return context;
  };

  const stopVoices = () => {
    for (const { source, gain } of activeVoices) {
      source.stop();
      source.disconnect();
      gain.disconnect();
    }
    activeVoices.clear();
  };

  const decode = async (data: ArrayBuffer, name: string) => {
    const audioContext = getContext();
    stopVoices();
    original = await audioContext.decodeAudioData(data.slice(0));
    reversed = reverseBuffer(audioContext, original);
    sourceName.value = name;
    duration.value = String(Math.min(0.15, original.duration));
    start.value = "0";
    updateSliceControls();
    setMetadata(original);
    setPlayable(true);
    setSliceControlsEnabled(true);
    setStatus("decoded", "ready");
  };

  const downloadDefault = async () => {
    if (!pendingDefault) {
      setStatus("loading default vocal sample…", "loading");
      pendingDefault = fetch(defaultSource).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Default sample request failed: ${response.status}`);
        }
        return response.arrayBuffer();
      });
    }
    defaultData = await pendingDefault;
    return defaultData;
  };

  const loadDefault = async () => {
    const data = defaultData ?? (await downloadDefault());
    setStatus("decoding default vocal sample…", "loading");
    await decode(data, "Tay Zonday vocal sample via Hyperblam");
  };

  const loadFile = async (selected: File) => {
    setStatus("decoding local file…", "loading");
    await decode(await selected.arrayBuffer(), selected.name);
  };

  const play = async (direction: Direction) => {
    try {
      error.hidden = true;
      if (!original || !reversed) await loadDefault();
      const audioContext = getContext();
      await audioContext.resume();
      if (!original || !reversed || !masterGain) return;

      updateSliceControls();
      const clipStart = start.valueAsNumber;
      const clipDuration = duration.valueAsNumber;
      const buffer = direction === "forward" ? original : reversed;
      const offset =
        direction === "forward"
          ? clipStart
          : original.duration - (clipStart + clipDuration);
      const when = audioContext.currentTime;
      const source = new AudioBufferSourceNode(audioContext, { buffer });
      const gain = new GainNode(audioContext, { gain: 0 });
      const voice = { source, gain };
      const releaseStart =
        when + Math.max(fadeDuration, clipDuration - fadeDuration);
      const end = when + clipDuration;

      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(1, when + fadeDuration);
      gain.gain.setValueAtTime(1, releaseStart);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      source.connect(gain).connect(masterGain);
      source.start(when, offset, clipDuration);
      source.stop(end + fadeDuration);
      activeVoices.add(voice);
      source.addEventListener(
        "ended",
        () => {
          activeVoices.delete(voice);
          source.disconnect();
          gain.disconnect();
        },
        { once: true },
      );
      addEvent(
        `${direction} buffer → offset ${offset.toFixed(3)} s → duration ${clipDuration.toFixed(3)} s → audio time ${when.toFixed(3)} s`,
      );
    } catch (reason) {
      error.textContent =
        reason instanceof Error ? reason.message : String(reason);
      error.hidden = false;
      setStatus("unable to play sample", "error");
    }
  };

  const onFileChange = () => {
    const selected = file.files?.[0];
    if (!selected) return;
    error.hidden = true;
    void loadFile(selected).catch((reason: unknown) => {
      error.textContent =
        reason instanceof Error ? reason.message : String(reason);
      error.hidden = false;
      setStatus("unable to decode local file", "error");
    });
  };

  const onForward = () => void play("forward");
  const onReverse = () => void play("reverse");

  file.addEventListener("change", onFileChange);
  start.addEventListener("input", updateSliceControls);
  duration.addEventListener("input", updateSliceControls);
  forward.addEventListener("click", onForward);
  reverse.addEventListener("click", onReverse);
  setPlayable(false);
  setSliceControlsEnabled(false);
  setMetadata(null);
  void downloadDefault()
    .then(() => {
      setPlayable(true);
      setStatus("default vocal sample ready", "ready");
    })
    .catch(() => {
      setStatus("default sample unavailable — choose a local file", "error");
    });

  return () => {
    file.removeEventListener("change", onFileChange);
    start.removeEventListener("input", updateSliceControls);
    duration.removeEventListener("input", updateSliceControls);
    forward.removeEventListener("click", onForward);
    reverse.removeEventListener("click", onReverse);
    stopVoices();
    masterGain?.disconnect();
    void context?.close();
  };
};
