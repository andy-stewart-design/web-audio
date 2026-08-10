const defaultSource = "/tay.mp3";
const minimumClipDuration = 0.01;
const fadeDuration = 0.005;
const scheduleAheadTime = 0.1;
const schedulerInterval = 25;

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
  const auto = selector<HTMLButtonElement>(root, "[data-auto]");
  const stop = selector<HTMLButtonElement>(root, "[data-stop]");
  const bpm = selector<HTMLInputElement>(root, "[data-bpm]");
  const subdivision = selector<HTMLSelectElement>(root, "[data-subdivision]");
  const phrase = selector<HTMLInputElement>(root, "[data-phrase]");
  const rest = selector<HTMLInputElement>(root, "[data-rest]");
  const probability = selector<HTMLInputElement>(root, "[data-probability]");
  const probabilityValue = selector<HTMLOutputElement>(
    root,
    "[data-probability-value]",
  );
  const directionMode = selector<HTMLSelectElement>(
    root,
    "[data-direction-mode]",
  );
  const varyDuration = selector<HTMLInputElement>(root, "[data-vary-duration]");
  const jitter = selector<HTMLInputElement>(root, "[data-jitter]");
  const jitterValue = selector<HTMLOutputElement>(root, "[data-jitter-value]");
  const choke = selector<HTMLInputElement>(root, "[data-choke]");
  const chokeValue = selector<HTMLOutputElement>(root, "[data-choke-value]");
  const eventLog = selector<HTMLOListElement>(root, "[data-event-log]");

  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let original: AudioBuffer | null = null;
  let reversed: AudioBuffer | null = null;
  let pendingDefault: Promise<ArrayBuffer> | null = null;
  let defaultData: ArrayBuffer | null = null;
  let activeVoice: Voice | null = null;
  const activeVoices = new Set<Voice>();
  let scheduler: number | null = null;
  let nextStepTime = 0;
  let sequenceStep = 0;
  let alternateDirection: Direction = "forward";

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
    for (const [label, value] of [
      ["Duration", `${buffer.duration.toFixed(3)} seconds`],
      ["Sample rate", `${buffer.sampleRate} Hz`],
      ["Channels", String(buffer.numberOfChannels)],
      ["Frames", String(buffer.length)],
    ]) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      metadata.append(term, description);
    }
  };

  const updateValues = () => {
    probabilityValue.value = `${Math.round(probability.valueAsNumber * 100)}%`;
    jitterValue.value = `${jitter.value} ms`;
    chokeValue.value = `${choke.value} ms`;
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
    auto.disabled = !playable;
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

  const stopVoice = (voice: Voice, when: number, chokeSeconds = 0) => {
    voice.gain.gain.cancelScheduledValues(when);
    voice.gain.gain.setTargetAtTime(0, when, Math.max(chokeSeconds / 3, 0.001));
    voice.source.stop(when + Math.max(chokeSeconds, 0.005) + fadeDuration);
  };

  const stopVoices = () => {
    if (!context) return;
    for (const voice of activeVoices) stopVoice(voice, context.currentTime);
    activeVoices.clear();
    activeVoice = null;
  };

  const decode = async (data: ArrayBuffer, name: string) => {
    const audioContext = getContext();
    stopAuto();
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

  const resolveDirection = () => {
    if (directionMode.value === "random") {
      return Math.random() < 0.5 ? "forward" : "reverse";
    }
    const direction = alternateDirection;
    alternateDirection = direction === "forward" ? "reverse" : "forward";
    return direction;
  };

  const play = async (
    direction: Direction,
    when?: number,
    requestedDuration?: number,
  ) => {
    try {
      error.hidden = true;
      if (!original || !reversed) await loadDefault();
      const audioContext = getContext();
      await audioContext.resume();
      if (!original || !reversed || !masterGain) return;

      updateSliceControls();
      const clipStart = start.valueAsNumber;
      const maxDuration = original.duration - clipStart;
      const clipDuration = Math.min(
        requestedDuration ?? duration.valueAsNumber,
        maxDuration,
      );
      const buffer = direction === "forward" ? original : reversed;
      const offset =
        direction === "forward"
          ? clipStart
          : original.duration - (clipStart + clipDuration);
      const startTime = Math.max(
        when ?? audioContext.currentTime,
        audioContext.currentTime,
      );
      const end = startTime + clipDuration;
      const releaseStart =
        startTime + Math.max(fadeDuration, clipDuration - fadeDuration);
      const source = new AudioBufferSourceNode(audioContext, { buffer });
      const gain = new GainNode(audioContext, { gain: 0 });
      const voice = { source, gain };
      const chokeSeconds = choke.valueAsNumber / 1000;

      if (activeVoice) stopVoice(activeVoice, startTime, chokeSeconds);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1, startTime + fadeDuration);
      gain.gain.setValueAtTime(1, releaseStart);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      source.connect(gain).connect(masterGain);
      source.start(startTime, offset, clipDuration);
      source.stop(end + fadeDuration);
      activeVoices.add(voice);
      activeVoice = voice;
      source.addEventListener(
        "ended",
        () => {
          activeVoices.delete(voice);
          source.disconnect();
          gain.disconnect();
          if (activeVoice === voice) activeVoice = null;
        },
        { once: true },
      );
      addEvent(
        `${direction} → offset ${offset.toFixed(3)} s → ${clipDuration.toFixed(3)} s → ${startTime.toFixed(3)} s`,
      );
    } catch (reason) {
      error.textContent =
        reason instanceof Error ? reason.message : String(reason);
      error.hidden = false;
      setStatus("unable to play sample", "error");
      stopAuto();
    }
  };

  const schedule = () => {
    if (!context || scheduler === null) return;
    const tempo = Math.max(1, bpm.valueAsNumber || 94);
    const stepsPerBeat = Math.max(1, Number(subdivision.value));
    const stepDuration = 60 / tempo / stepsPerBeat;
    const phraseSteps = Math.max(1, Math.floor(phrase.valueAsNumber || 1));
    const restSteps = Math.max(0, Math.floor(rest.valueAsNumber || 0));
    const cycleLength = phraseSteps + restSteps;

    while (nextStepTime < context.currentTime + scheduleAheadTime) {
      const position = sequenceStep % cycleLength;
      const active = position < phraseSteps;
      if (active && Math.random() <= probability.valueAsNumber) {
        const maxDuration = original
          ? original.duration - start.valueAsNumber
          : 0;
        const baseDuration = duration.valueAsNumber;
        const variedDuration = varyDuration.checked
          ? baseDuration * (0.65 + Math.random() * 0.7)
          : baseDuration;
        const jitterSeconds =
          (Math.random() * 2 - 1) * (jitter.valueAsNumber / 1000);
        const when = Math.max(
          context.currentTime + 0.005,
          nextStepTime + jitterSeconds,
        );
        void play(
          resolveDirection(),
          when,
          Math.min(variedDuration, maxDuration),
        );
      }
      nextStepTime += stepDuration;
      sequenceStep += 1;
    }
  };

  const startAuto = async () => {
    if (scheduler) return;
    try {
      if (!original || !reversed) await loadDefault();
      const audioContext = getContext();
      await audioContext.resume();
      scheduler = window.setInterval(schedule, schedulerInterval);
      nextStepTime = audioContext.currentTime + 0.02;
      sequenceStep = 0;
      alternateDirection = "forward";
      auto.disabled = true;
      stop.disabled = false;
      addEvent("automatic baby scratch started");
      schedule();
    } catch (reason) {
      error.textContent =
        reason instanceof Error ? reason.message : String(reason);
      error.hidden = false;
    }
  };

  function stopAuto() {
    if (scheduler !== null) {
      window.clearInterval(scheduler);
      scheduler = null;
      addEvent("automatic baby scratch stopped");
    }
    auto.disabled = !original;
    stop.disabled = true;
    stopVoices();
  }

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
  const onAuto = () => void startAuto();

  file.addEventListener("change", onFileChange);
  start.addEventListener("input", updateSliceControls);
  duration.addEventListener("input", updateSliceControls);
  probability.addEventListener("input", updateValues);
  jitter.addEventListener("input", updateValues);
  choke.addEventListener("input", updateValues);
  forward.addEventListener("click", onForward);
  reverse.addEventListener("click", onReverse);
  auto.addEventListener("click", onAuto);
  stop.addEventListener("click", stopAuto);
  setPlayable(false);
  setSliceControlsEnabled(false);
  stop.disabled = true;
  updateValues();
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
    probability.removeEventListener("input", updateValues);
    jitter.removeEventListener("input", updateValues);
    choke.removeEventListener("input", updateValues);
    forward.removeEventListener("click", onForward);
    reverse.removeEventListener("click", onReverse);
    auto.removeEventListener("click", onAuto);
    stop.removeEventListener("click", stopAuto);
    stopAuto();
    masterGain?.disconnect();
    void context?.close();
  };
};
