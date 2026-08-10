import AudioClock from "@web-audio/clock";

const selector = <T extends Element>(root: Element, value: string) => {
  const element = root.querySelector<T>(value);
  if (!element) throw new Error(`Missing audio clock element: ${value}`);
  return element;
};

export const setupAudioClock = (root: HTMLElement) => {
  const toggle = selector<HTMLButtonElement>(root, "[data-toggle]");
  const bpm = selector<HTMLInputElement>(root, "[data-bpm]");
  const bpmValue = selector<HTMLOutputElement>(root, "[data-bpm-value]");
  const barValue = selector<HTMLOutputElement>(root, "[data-bar]");
  const beatValue = selector<HTMLOutputElement>(root, "[data-beat]");
  const state = selector<HTMLOutputElement>(root, "[data-state]");
  const log = selector<HTMLOListElement>(root, "[data-log]");
  const beatLights = Array.from(
    root.querySelectorAll<HTMLElement>("[data-light]"),
  );

  let context: AudioContext | null = null;
  let clock: AudioClock | null = null;
  let running = false;
  const activeSources = new Set<OscillatorNode>();
  const displayTimers = new Set<number>();
  const unsubscribe: (() => void)[] = [];

  const addLog = (message: string) => {
    const item = document.createElement("li");
    item.textContent = message;
    log.prepend(item);

    while (log.children.length > 30) {
      log.lastElementChild?.remove();
    }
  };

  const updateState = () => {
    toggle.textContent = running ? "Stop clock" : "Start clock";
    state.value = running ? "running" : "stopped";
    state.dataset.running = String(running);
  };

  const showBeat = (beat: number, bar: number) => {
    barValue.value = String(bar + 1);
    beatValue.value = String(beat + 1);

    for (const light of beatLights) {
      const active = Number(light.dataset.light) === beat;
      light.dataset.active = String(active && running);
    }
  };

  const scheduleDisplay = (beat: number, bar: number, time: number) => {
    if (!context) return;

    const delay = Math.max(0, (time - context.currentTime) * 1000);
    const timer = window.setTimeout(() => {
      displayTimers.delete(timer);
      showBeat(beat, bar);
    }, delay);
    displayTimers.add(timer);
  };

  const playClick = (beat: number, time: number, duration: number) => {
    if (!context) return;

    const oscillator = new OscillatorNode(context, {
      frequency: beat === 0 ? 1000 : 500,
      type: "sine",
    });
    const envelope = new GainNode(context, { gain: 0 });

    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.35, time + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);

    oscillator.connect(envelope).connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + duration);
    activeSources.add(oscillator);
    oscillator.addEventListener(
      "ended",
      () => {
        activeSources.delete(oscillator);
        oscillator.disconnect();
        envelope.disconnect();
      },
      { once: true },
    );
  };

  const cancelAudio = () => {
    if (!context) return;

    for (const source of activeSources) {
      source.stop(context.currentTime);
    }
    activeSources.clear();
  };

  const cancelDisplays = () => {
    for (const timer of displayTimers) {
      window.clearTimeout(timer);
    }
    displayTimers.clear();
  };

  const bindClock = (nextClock: AudioClock) => {
    unsubscribe.push(
      nextClock.on("beat", ({ beat, bar }, time) => {
        const clickCount = 2;
        const clickDuration = nextClock.beatDuration / clickCount;

        for (let index = 0; index < clickCount; index += 1) {
          playClick(beat, time + clickDuration * index, clickDuration);
        }

        scheduleDisplay(beat, bar, time);
        addLog(
          `beat ${beat + 1} scheduled for ${time.toFixed(3)}s; callback at ${nextClock.ctx.currentTime.toFixed(3)}s`,
        );
      }),
      nextClock.on("bar", ({ bar }, time) => {
        addLog(`bar ${bar + 1} scheduled for ${time.toFixed(3)}s`);
      }),
      nextClock.on("prebeat", ({ beat, bar }, time) => {
        addLog(`prebeat ${bar + 1}.${beat + 1} at ${time.toFixed(3)}s`);
      }),
    );
  };

  const start = async () => {
    if (!context) {
      context = new AudioContext();
      clock = new AudioClock(context, bpm.valueAsNumber, 4);
      bindClock(clock);
    }

    clock?.bpm(bpm.valueAsNumber);
    await clock?.start();
    running = true;
    updateState();
    addLog("clock started");
  };

  const stop = () => {
    clock?.stop();
    cancelAudio();
    cancelDisplays();
    running = false;
    showBeat(0, 0);
    updateState();
    addLog("clock stopped; scheduled clicks cancelled");
  };

  const onToggle = () => {
    if (running) {
      stop();
      return;
    }
    void start();
  };

  const onBpmInput = () => {
    bpmValue.value = bpm.value;
    clock?.bpm(bpm.valueAsNumber);
    addLog(`tempo set to ${bpm.value} BPM`);
  };

  toggle.addEventListener("click", onToggle);
  bpm.addEventListener("input", onBpmInput);
  bpmValue.value = bpm.value;
  showBeat(0, 0);
  updateState();

  return () => {
    toggle.removeEventListener("click", onToggle);
    bpm.removeEventListener("input", onBpmInput);
    stop();
    unsubscribe.forEach((off) => off());
    clock?.destroy();
    void context?.close();
  };
};
