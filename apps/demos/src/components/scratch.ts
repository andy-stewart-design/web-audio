const defaultSource = "/tay.mp3";
const minimumClipDuration = 0.01;
const fadeDuration = 0.005;
const scheduleAheadTime = 0.1;
const schedulerInterval = 25;

const seededRandom = (seed: string) => {
  let state = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16_777_619);
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

type Direction = "forward" | "reverse";
type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  lfoConnected: boolean;
};

type VisualHit = {
  direction: Direction;
  offset: number;
  duration: number;
  when: number;
  stopTime: number;
  baseDetune: number;
  modulated: boolean;
};

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
  const loadDefaultButton = selector<HTMLButtonElement>(
    root,
    "[data-load-default]",
  );
  const sourceName = selector<HTMLOutputElement>(root, "[data-source-name]");
  const status = selector<HTMLOutputElement>(root, "[data-status]");
  const error = selector<HTMLParagraphElement>(root, "[data-error]");
  const metadata = selector<HTMLDListElement>(root, "[data-metadata]");
  const waveform = selector<HTMLElement>(root, "[data-waveform]");
  const waveformCanvas = selector<HTMLCanvasElement>(
    root,
    "[data-waveform-canvas]",
  );
  const waveformHit = selector<HTMLOutputElement>(root, "[data-waveform-hit]");
  const start = selector<HTMLInputElement>(root, "[data-slice-start]");
  const startValue = selector<HTMLOutputElement>(
    root,
    "[data-slice-start-value]",
  );
  const forward = selector<HTMLButtonElement>(root, "[data-forward]");
  const reverse = selector<HTMLButtonElement>(root, "[data-reverse]");
  const auto = selector<HTMLButtonElement>(root, "[data-auto]");
  const stop = selector<HTMLButtonElement>(root, "[data-stop]");
  const reset = selector<HTMLButtonElement>(root, "[data-reset]");
  const bpm = selector<HTMLInputElement>(root, "[data-bpm]");
  const scratchBars = selector<HTMLInputElement>(root, "[data-scratch-bars]");
  const scratchSteps = selector<HTMLInputElement>(root, "[data-scratch-steps]");
  const restBars = selector<HTMLInputElement>(root, "[data-rest-bars]");
  const restSteps = selector<HTMLInputElement>(root, "[data-rest-steps]");
  const probability = selector<HTMLInputElement>(root, "[data-probability]");
  const probabilityValue = selector<HTMLOutputElement>(
    root,
    "[data-probability-value]",
  );
  const directionMode = selector<HTMLSelectElement>(
    root,
    "[data-direction-mode]",
  );
  const seed = selector<HTMLInputElement>(root, "[data-seed]");
  const durationMin = selector<HTMLInputElement>(root, "[data-duration-min]");
  const durationMinValue = selector<HTMLOutputElement>(
    root,
    "[data-duration-min-value]",
  );
  const durationMax = selector<HTMLInputElement>(root, "[data-duration-max]");
  const durationMaxValue = selector<HTMLOutputElement>(
    root,
    "[data-duration-max-value]",
  );
  const releaseEnabled = selector<HTMLInputElement>(
    root,
    "[data-release-enabled]",
  );
  const jitter = selector<HTMLInputElement>(root, "[data-jitter]");
  const jitterValue = selector<HTMLOutputElement>(root, "[data-jitter-value]");
  const choke = selector<HTMLInputElement>(root, "[data-choke]");
  const chokeValue = selector<HTMLOutputElement>(root, "[data-choke-value]");
  const detune = selector<HTMLInputElement>(root, "[data-detune]");
  const detuneValue = selector<HTMLOutputElement>(root, "[data-detune-value]");
  const lfoEnabled = selector<HTMLInputElement>(root, "[data-lfo-enabled]");
  const lfoRate = selector<HTMLInputElement>(root, "[data-lfo-rate]");
  const lfoRateValue = selector<HTMLOutputElement>(
    root,
    "[data-lfo-rate-value]",
  );
  const lfoDepth = selector<HTMLInputElement>(root, "[data-lfo-depth]");
  const lfoDepthValue = selector<HTMLOutputElement>(
    root,
    "[data-lfo-depth-value]",
  );
  const lfoWave = selector<HTMLSelectElement>(root, "[data-lfo-wave]");
  const eventLog = selector<HTMLOListElement>(root, "[data-event-log]");

  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  let original: AudioBuffer | null = null;
  let reversed: AudioBuffer | null = null;
  let pendingDefault: Promise<ArrayBuffer> | null = null;
  let defaultData: ArrayBuffer | null = null;
  let defaultSourceLoaded = false;
  let activeVoice: Voice | null = null;
  const activeVoices = new Set<Voice>();
  let scheduler: number | null = null;
  let nextStepTime = 0;
  let phase: "scratch" | "rest" = "scratch";
  let phaseStep = 0;
  let alternateDirection: Direction = "forward";
  let random = seededRandom(seed.value);
  let waveformData: Float32Array | null = null;
  let lastHit: VisualHit | null = null;
  let animationFrame: number | null = null;

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

  const buildWaveformData = (buffer: AudioBuffer) => {
    const columns = 720;
    const values = new Float32Array(columns);
    const framesPerColumn = Math.max(1, Math.floor(buffer.length / columns));

    for (let column = 0; column < columns; column += 1) {
      const firstFrame = column * framesPerColumn;
      const finalFrame = Math.min(buffer.length, firstFrame + framesPerColumn);
      let peak = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const samples = buffer.getChannelData(channel);
        for (let frame = firstFrame; frame < finalFrame; frame += 1) {
          peak = Math.max(peak, Math.abs(samples[frame] ?? 0));
        }
      }
      values[column] = peak;
    }
    waveformData = values;
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

  const renderWaveform = () => {
    if (!original || !waveformData) return;
    const data = waveformData;
    const width = waveformCanvas.clientWidth;
    const height = waveformCanvas.clientHeight;
    if (!width || !height) return;

    const pixelRatio = window.devicePixelRatio || 1;
    waveformCanvas.width = Math.round(width * pixelRatio);
    waveformCanvas.height = Math.round(height * pixelRatio);
    const drawing = waveformCanvas.getContext("2d");
    if (!drawing) return;
    drawing.scale(pixelRatio, pixelRatio);
    drawing.clearRect(0, 0, width, height);

    const duration = original.duration;
    const rowHeight = height / 2;
    const selectedStart = start.valueAsNumber;
    const selectedDuration = durationMax.valueAsNumber;
    const drawRegion = (
      regionStart: number,
      regionDuration: number,
      y: number,
      color: string,
    ) => {
      drawing.fillStyle = color;
      drawing.fillRect(
        (regionStart / duration) * width,
        y,
        (regionDuration / duration) * width,
        rowHeight,
      );
    };
    const drawWaveform = (reverse: boolean, y: number) => {
      drawing.strokeStyle = "#9eb1ff";
      drawing.lineWidth = 1;
      drawing.beginPath();
      for (let column = 0; column < data.length; column += 1) {
        const peak = data[reverse ? data.length - 1 - column : column] ?? 0;
        const x = (column / (data.length - 1)) * width;
        const amplitude = peak * (rowHeight * 0.36);
        drawing.moveTo(x, y + rowHeight / 2 - amplitude);
        drawing.lineTo(x, y + rowHeight / 2 + amplitude);
      }
      drawing.stroke();
    };

    drawing.fillStyle = "#aab1c8";
    drawing.font = "12px ui-monospace, monospace";
    drawing.fillText("forward buffer", 8, 16);
    drawing.fillText("reversed buffer", 8, rowHeight + 16);
    drawRegion(selectedStart, selectedDuration, 0, "rgb(158 177 255 / 25%)");
    drawRegion(
      duration - (selectedStart + selectedDuration),
      selectedDuration,
      rowHeight,
      "rgb(158 177 255 / 25%)",
    );
    drawWaveform(false, 0);
    drawWaveform(true, rowHeight);

    if (lastHit) {
      const row = lastHit.direction === "forward" ? 0 : rowHeight;
      drawRegion(
        lastHit.offset,
        lastHit.duration,
        row,
        "rgb(255 207 112 / 35%)",
      );
      drawWaveform(lastHit.direction === "reverse", row);
      const isPlaying =
        context &&
        context.currentTime >= lastHit.when &&
        context.currentTime < lastHit.stopTime;
      if (isPlaying && !lastHit.modulated && context) {
        const rate = 2 ** (lastHit.baseDetune / 1200);
        const position = Math.min(
          duration,
          lastHit.offset + (context.currentTime - lastHit.when) * rate,
        );
        drawing.strokeStyle = "#90f0b0";
        drawing.lineWidth = 2;
        drawing.beginPath();
        drawing.moveTo((position / duration) * width, row);
        drawing.lineTo((position / duration) * width, row + rowHeight);
        drawing.stroke();
      }
      if (context && context.currentTime < lastHit.stopTime) {
        animationFrame = window.requestAnimationFrame(renderWaveform);
      }
    }
  };

  const updateValues = () => {
    probabilityValue.value = `${Math.round(probability.valueAsNumber * 100)}%`;
    jitterValue.value = `${jitter.value} ms`;
    chokeValue.value = `${choke.value} ms`;
    durationMinValue.value = `${durationMin.valueAsNumber.toFixed(3)} s`;
    durationMaxValue.value = `${durationMax.valueAsNumber.toFixed(3)} s`;
    detuneValue.value = `${detune.value} cents`;
    lfoRateValue.value = `${lfoRate.value} Hz`;
    lfoDepthValue.value = `${lfoDepth.value} cents`;
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
    durationMin.max = String(maxDuration);
    durationMax.max = String(maxDuration);
    const resolvedMin = Math.min(
      Math.max(durationMin.valueAsNumber, minimumClipDuration),
      maxDuration,
    );
    const resolvedMax = Math.min(
      Math.max(durationMax.valueAsNumber, resolvedMin),
      maxDuration,
    );
    durationMin.value = String(resolvedMin);
    durationMax.value = String(resolvedMax);
    startValue.value = `${resolvedStart.toFixed(3)} s`;
    updateValues();
    renderWaveform();
  };

  const setPlayable = (playable: boolean) => {
    forward.disabled = !playable;
    reverse.disabled = !playable;
    auto.disabled = !playable;
  };

  const setSliceControlsEnabled = (enabled: boolean) => {
    start.disabled = !enabled;
    durationMin.disabled = !enabled;
    durationMax.disabled = !enabled;
  };

  const getContext = () => {
    if (!context) {
      context = new AudioContext();
      masterGain = new GainNode(context, { gain: 0.8 });
      masterGain.connect(context.destination);
    }
    return context;
  };

  const updateLfo = () => {
    if (!lfo || !lfoGain || !context) return;
    const waveforms = ["sine", "square", "sawtooth", "triangle"] as const;
    const waveform =
      waveforms.find((value) => value === lfoWave.value) ?? "sine";
    lfo.type = waveform;
    lfo.frequency.setTargetAtTime(
      lfoRate.valueAsNumber,
      context.currentTime,
      0.005,
    );
    lfoGain.gain.setTargetAtTime(
      lfoEnabled.checked ? lfoDepth.valueAsNumber : 0,
      context.currentTime,
      0.005,
    );
  };

  const ensureLfo = () => {
    const audioContext = getContext();
    if (!lfo) {
      lfo = new OscillatorNode(audioContext);
      lfoGain = new GainNode(audioContext, { gain: 0 });
      lfo.connect(lfoGain);
      lfo.start();
    }
    updateLfo();
    return lfoGain;
  };

  const connectLfo = (voice: Voice) => {
    const modulation = ensureLfo();
    if (modulation && !voice.lfoConnected) {
      modulation.connect(voice.source.detune);
      voice.lfoConnected = true;
    }
  };

  const stopVoice = (voice: Voice, when: number, chokeSeconds = 0) => {
    const fadeEnd = when + Math.max(chokeSeconds, fadeDuration);
    voice.gain.gain.cancelAndHoldAtTime(when);
    voice.gain.gain.linearRampToValueAtTime(0, fadeEnd);
    voice.source.stop(fadeEnd + fadeDuration);
  };

  const stopVoices = () => {
    if (!context) return;
    for (const voice of activeVoices) stopVoice(voice, context.currentTime);
    activeVoices.clear();
    activeVoice = null;
    if (lastHit) lastHit.stopTime = context.currentTime;
  };

  const decode = async (
    data: ArrayBuffer,
    name: string,
    isDefaultSource: boolean,
  ) => {
    const audioContext = getContext();
    stopAuto();
    stopVoices();
    original = await audioContext.decodeAudioData(data.slice(0));
    reversed = reverseBuffer(audioContext, original);
    buildWaveformData(original);
    lastHit = null;
    waveformHit.value = "No hit scheduled";
    waveform.hidden = false;
    sourceName.value = name;
    defaultSourceLoaded = isDefaultSource;
    loadDefaultButton.disabled = isDefaultSource;
    file.disabled = false;
    start.value = "0";
    updateSliceControls();
    setMetadata(original);
    setPlayable(true);
    setSliceControlsEnabled(true);
    setStatus("decoded", "ready");
  };

  const downloadDefault = async () => {
    if (!pendingDefault) {
      setStatus("downloading default track…", "loading");
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

  const setSourceLoading = () => {
    loadDefaultButton.disabled = true;
    file.disabled = true;
  };

  const restoreSourceControls = () => {
    loadDefaultButton.disabled = defaultSourceLoaded;
    file.disabled = false;
  };

  const loadDefault = async () => {
    setSourceLoading();
    try {
      const data = defaultData ?? (await downloadDefault());
      setStatus("decoding default track…", "loading");
      await decode(data, "tay.mp3", true);
    } catch (reason) {
      restoreSourceControls();
      throw reason;
    }
  };

  const loadFile = async (selected: File) => {
    setSourceLoading();
    try {
      setStatus("decoding local file…", "loading");
      await decode(await selected.arrayBuffer(), selected.name, false);
    } catch (reason) {
      restoreSourceControls();
      throw reason;
    }
  };

  const resolveDirection = () => {
    if (directionMode.value === "random") {
      return random() < 0.5 ? "forward" : "reverse";
    }
    const direction = alternateDirection;
    alternateDirection = direction === "forward" ? "reverse" : "forward";
    return direction;
  };

  const play = async (
    direction: Direction,
    when?: number,
    requestedDuration?: number,
    processed = true,
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
      const minimumDuration = Math.min(durationMin.valueAsNumber, maxDuration);
      const maximumDuration = Math.min(
        Math.max(durationMax.valueAsNumber, minimumDuration),
        maxDuration,
      );
      const clipDuration =
        requestedDuration ??
        minimumDuration + Math.random() * (maximumDuration - minimumDuration);
      const buffer = direction === "forward" ? original : reversed;
      const offset =
        direction === "forward"
          ? clipStart
          : original.duration - (clipStart + clipDuration);
      const startTime = Math.max(
        when ?? audioContext.currentTime,
        audioContext.currentTime,
      );
      const gateTime = startTime + clipDuration;
      const stopTime = gateTime + fadeDuration * 8;
      const source = new AudioBufferSourceNode(audioContext, { buffer });
      const baseDetune = processed ? detune.valueAsNumber : 0;
      const modulated = processed && lfoEnabled.checked;
      source.detune.setValueAtTime(baseDetune, startTime);
      const gain = new GainNode(audioContext, { gain: 0 });
      const voice = { source, gain, lfoConnected: false };
      if (modulated) connectLfo(voice);
      const chokeSeconds = choke.valueAsNumber / 1000;

      if (processed && activeVoice) {
        stopVoice(activeVoice, startTime, chokeSeconds);
      }
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.setTargetAtTime(1, startTime, fadeDuration);
      gain.gain.setTargetAtTime(0, gateTime, fadeDuration);
      source.connect(gain).connect(masterGain);
      source.start(startTime, offset);
      source.stop(stopTime);
      lastHit = {
        direction,
        offset,
        duration: clipDuration,
        when: startTime,
        stopTime,
        baseDetune,
        modulated,
      };
      waveformHit.value = `${direction} hit: ${offset.toFixed(3)}–${(offset + clipDuration).toFixed(3)} s in the ${direction} buffer`;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(renderWaveform);
      activeVoices.add(voice);
      if (processed) activeVoice = voice;
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

  const playRelease = (when: number, duration: number) => {
    if (!context || !original || !masterGain) return;

    const source = new AudioBufferSourceNode(context, { buffer: original });
    const gain = new GainNode(context, { gain: 0 });
    const voice = { source, gain, lfoConnected: false };
    const accelerationTime = 0.25 * (60 / Math.max(1, bpm.valueAsNumber || 94));
    const chokeSeconds = choke.valueAsNumber / 1000;

    if (activeVoice) stopVoice(activeVoice, when, chokeSeconds);
    source.detune.setValueAtTime(-1200, when);
    source.detune.linearRampToValueAtTime(0, when + accelerationTime);
    const releaseEnd = when + Math.max(duration, fadeDuration * 2);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(1, when + fadeDuration);
    gain.gain.setValueAtTime(1, releaseEnd - fadeDuration);
    gain.gain.linearRampToValueAtTime(0, releaseEnd);
    source.connect(gain).connect(masterGain);
    source.start(when);
    source.stop(releaseEnd + fadeDuration);
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
      `release → full forward buffer → -1200 to 0 cents over ${accelerationTime.toFixed(3)} s → ${when.toFixed(3)} s`,
    );
  };

  const schedule = () => {
    if (!context || scheduler === null) return;
    const tempo = Math.max(1, bpm.valueAsNumber || 94);
    const barDuration = (60 / tempo) * 4;
    const scratchBarCount = Math.max(
      1,
      Math.floor(scratchBars.valueAsNumber || 1),
    );
    const scratchStepCount = Math.max(
      1,
      Math.floor(scratchSteps.valueAsNumber || 1),
    );
    const restBarCount = Math.max(1, Math.floor(restBars.valueAsNumber || 1));
    const restStepCount = Math.max(1, Math.floor(restSteps.valueAsNumber || 1));
    const scratchStepDuration = barDuration / scratchStepCount;
    const restStepDuration = barDuration / restStepCount;
    const scratchPhraseSteps = scratchBarCount * scratchStepCount;
    const restPhraseSteps = restBarCount * restStepCount;

    while (nextStepTime < context.currentTime + scheduleAheadTime) {
      if (phase === "scratch") {
        if (random() <= probability.valueAsNumber) {
          const maxDuration = original
            ? original.duration - start.valueAsNumber
            : 0;
          const minimumDuration = Math.min(
            durationMin.valueAsNumber,
            maxDuration,
          );
          const maximumDuration = Math.min(
            Math.max(durationMax.valueAsNumber, minimumDuration),
            maxDuration,
          );
          const randomizedDuration =
            minimumDuration + random() * (maximumDuration - minimumDuration);
          const jitterSeconds =
            (random() * 2 - 1) * (jitter.valueAsNumber / 1000);
          const when = Math.max(
            context.currentTime + 0.005,
            nextStepTime + jitterSeconds,
          );
          void play(resolveDirection(), when, randomizedDuration);
        }
        nextStepTime += scratchStepDuration;
        phaseStep += 1;
        if (phaseStep === scratchPhraseSteps) {
          phase = "rest";
          phaseStep = 0;
        }
      } else {
        if (releaseEnabled.checked) {
          playRelease(nextStepTime, restStepDuration);
        }
        nextStepTime += restStepDuration;
        phaseStep += 1;
        if (phaseStep === restPhraseSteps) {
          phase = "scratch";
          phaseStep = 0;
        }
      }
    }
  };

  const startAuto = async () => {
    if (scheduler !== null) return;
    try {
      if (!original || !reversed) await loadDefault();
      const audioContext = getContext();
      await audioContext.resume();
      scheduler = window.setInterval(schedule, schedulerInterval);
      nextStepTime = audioContext.currentTime + 0.02;
      phase = "scratch";
      phaseStep = 0;
      alternateDirection = "forward";
      random = seededRandom(seed.value);
      addEvent(`random seed: ${seed.value}`);
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

  const onLoadDefault = () => {
    error.hidden = true;
    void loadDefault().catch((reason: unknown) => {
      error.textContent =
        reason instanceof Error ? reason.message : String(reason);
      error.hidden = false;
      setStatus("default track unavailable", "error");
    });
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

  const playAudition = (direction: Direction) =>
    void play(direction, undefined, durationMax.valueAsNumber, false);
  const onForward = () => playAudition("forward");
  const onReverse = () => playAudition("reverse");
  const onAuto = () => void startAuto();
  const onReset = () => {
    stopAuto();
    start.value = "0";
    durationMin.value = "0.063";
    durationMax.value = "0.15";
    bpm.value = "94";
    scratchBars.value = "1";
    scratchSteps.value = "16";
    restBars.value = "1";
    restSteps.value = "1";
    probability.value = "0.6";
    directionMode.value = "alternate";
    seed.value = "chocolate";
    releaseEnabled.checked = true;
    jitter.value = "0";
    choke.value = "5";
    detune.value = "0";
    lfoEnabled.checked = true;
    lfoRate.value = "3";
    lfoDepth.value = "700";
    lfoWave.value = "sine";
    updateSliceControls();
    updateValues();
    updateLfo();
    addEvent("configuration reset");
  };
  const onDurationRange = () => {
    if (durationMin.valueAsNumber > durationMax.valueAsNumber) {
      durationMax.value = durationMin.value;
    }
    updateValues();
    renderWaveform();
  };
  const onLfoRate = () => {
    updateValues();
    updateLfo();
  };
  const onLfoDepth = () => {
    updateValues();
    updateLfo();
  };
  const onLfoEnabled = () => {
    updateLfo();
    if (lfoEnabled.checked) activeVoices.forEach(connectLfo);
  };

  file.addEventListener("change", onFileChange);
  loadDefaultButton.addEventListener("click", onLoadDefault);
  start.addEventListener("input", updateSliceControls);
  probability.addEventListener("input", updateValues);
  jitter.addEventListener("input", updateValues);
  choke.addEventListener("input", updateValues);
  durationMin.addEventListener("input", onDurationRange);
  durationMax.addEventListener("input", onDurationRange);
  detune.addEventListener("input", updateValues);
  lfoRate.addEventListener("input", onLfoRate);
  lfoDepth.addEventListener("input", onLfoDepth);
  lfoWave.addEventListener("change", updateLfo);
  lfoEnabled.addEventListener("change", onLfoEnabled);
  forward.addEventListener("click", onForward);
  reverse.addEventListener("click", onReverse);
  auto.addEventListener("click", onAuto);
  stop.addEventListener("click", stopAuto);
  reset.addEventListener("click", onReset);
  setPlayable(false);
  setSliceControlsEnabled(false);
  stop.disabled = true;
  updateValues();
  setMetadata(null);
  setStatus("no track loaded", "idle");
  const resizeObserver = new ResizeObserver(renderWaveform);
  resizeObserver.observe(waveformCanvas);

  return () => {
    file.removeEventListener("change", onFileChange);
    loadDefaultButton.removeEventListener("click", onLoadDefault);
    start.removeEventListener("input", updateSliceControls);
    probability.removeEventListener("input", updateValues);
    jitter.removeEventListener("input", updateValues);
    choke.removeEventListener("input", updateValues);
    durationMin.removeEventListener("input", onDurationRange);
    durationMax.removeEventListener("input", onDurationRange);
    detune.removeEventListener("input", updateValues);
    lfoRate.removeEventListener("input", onLfoRate);
    lfoDepth.removeEventListener("input", onLfoDepth);
    lfoWave.removeEventListener("change", updateLfo);
    lfoEnabled.removeEventListener("change", onLfoEnabled);
    forward.removeEventListener("click", onForward);
    reverse.removeEventListener("click", onReverse);
    auto.removeEventListener("click", onAuto);
    stop.removeEventListener("click", stopAuto);
    reset.removeEventListener("click", onReset);
    stopAuto();
    resizeObserver.disconnect();
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    lfo?.stop();
    lfo?.disconnect();
    lfoGain?.disconnect();
    masterGain?.disconnect();
    void context?.close();
  };
};
