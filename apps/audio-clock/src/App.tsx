import { createSignal, createEffect, onCleanup, For } from "solid-js";
import { AudioClock } from "./clock";

function App() {
  const [clock, setClock] = createSignal<AudioClock | null>(null);
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [bpm, setBpm] = createSignal(120);
  const [beatsPerBar, setBeatsPerBar] = createSignal(4);
  const [currentBeat, setCurrentBeat] = createSignal(0);
  const [currentBar, setCurrentBar] = createSignal(0);
  const [currentBeatInBar, setCurrentBeatInBar] = createSignal(0);
  const [beatFlash, setBeatFlash] = createSignal(false);
  const [barFlash, setBarFlash] = createSignal(false);
  const [elapsedTime, setElapsedTime] = createSignal(0);

  // Initialize clock
  createEffect(() => {
    const audioClock = new AudioClock({ bpm: bpm(), beatsPerBar: beatsPerBar() });

    audioClock.onBeat((beat) => {
      setCurrentBeat(beat);
      setCurrentBeatInBar(audioClock.currentBeatInBar);
      setBeatFlash(true);
      setTimeout(() => setBeatFlash(false), 100);
    });

    audioClock.onBar((bar) => {
      setCurrentBar(bar);
      setBarFlash(true);
      setTimeout(() => setBarFlash(false), 150);
    });

    setClock(audioClock);

    onCleanup(() => {
      audioClock.destroy();
    });
  });

  // Update elapsed time
  createEffect(() => {
    if (!isPlaying()) return;

    const interval = setInterval(() => {
      const c = clock();
      if (c) {
        setElapsedTime(c.elapsedTime);
      }
    }, 50);

    onCleanup(() => clearInterval(interval));
  });

  // Sync BPM changes to clock
  createEffect(() => {
    const c = clock();
    if (c) {
      c.bpm = bpm();
    }
  });

  // Sync beats per bar changes to clock
  createEffect(() => {
    const c = clock();
    if (c) {
      c.beatsPerBar = beatsPerBar();
    }
  });

  const handleStart = async () => {
    const c = clock();
    if (c) {
      await c.start();
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    const c = clock();
    if (c) {
      c.stop();
      setIsPlaying(false);
      setCurrentBeat(0);
      setCurrentBar(0);
      setCurrentBeatInBar(0);
      setElapsedTime(0);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  return (
    <div style={{ padding: "2rem", "font-family": "system-ui, sans-serif", "max-width": "600px", margin: "0 auto" }}>
      <h1 style={{ "margin-bottom": "2rem" }}>Audio Clock</h1>

      {/* Transport Controls */}
      <div style={{ display: "flex", gap: "1rem", "margin-bottom": "2rem" }}>
        <button
          onClick={handleStart}
          disabled={isPlaying()}
          style={{
            padding: "0.75rem 2rem",
            "font-size": "1.25rem",
            cursor: isPlaying() ? "not-allowed" : "pointer",
            "background-color": isPlaying() ? "#9ca3af" : "#22c55e",
            color: "white",
            border: "none",
            "border-radius": "0.5rem",
            opacity: isPlaying() ? 0.6 : 1,
          }}
        >
          Start
        </button>
        <button
          onClick={handleStop}
          disabled={!isPlaying()}
          style={{
            padding: "0.75rem 2rem",
            "font-size": "1.25rem",
            cursor: !isPlaying() ? "not-allowed" : "pointer",
            "background-color": !isPlaying() ? "#9ca3af" : "#ef4444",
            color: "white",
            border: "none",
            "border-radius": "0.5rem",
            opacity: !isPlaying() ? 0.6 : 1,
          }}
        >
          Stop
        </button>
      </div>

      {/* BPM Control */}
      <div style={{ "margin-bottom": "1.5rem" }}>
        <label style={{ display: "block", "margin-bottom": "0.5rem", "font-weight": "bold" }}>
          BPM: {bpm()}
        </label>
        <input
          type="range"
          min="30"
          max="300"
          value={bpm()}
          onInput={(e) => setBpm(parseInt(e.currentTarget.value))}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", gap: "0.5rem", "margin-top": "0.5rem" }}>
          <For each={[60, 90, 120, 140, 180]}>
            {(preset) => (
              <button
                onClick={() => setBpm(preset)}
                style={{
                  padding: "0.25rem 0.75rem",
                  cursor: "pointer",
                  "background-color": bpm() === preset ? "#3b82f6" : "#e5e7eb",
                  color: bpm() === preset ? "white" : "black",
                  border: "none",
                  "border-radius": "0.25rem",
                }}
              >
                {preset}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Beats Per Bar Control */}
      <div style={{ "margin-bottom": "2rem" }}>
        <label style={{ display: "block", "margin-bottom": "0.5rem", "font-weight": "bold" }}>
          Beats Per Bar: {beatsPerBar()}
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <For each={[3, 4, 5, 6, 7, 8]}>
            {(beats) => (
              <button
                onClick={() => setBeatsPerBar(beats)}
                style={{
                  padding: "0.5rem 1rem",
                  cursor: "pointer",
                  "background-color": beatsPerBar() === beats ? "#3b82f6" : "#e5e7eb",
                  color: beatsPerBar() === beats ? "white" : "black",
                  border: "none",
                  "border-radius": "0.25rem",
                }}
              >
                {beats}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Beat Visualization */}
      <div style={{ "margin-bottom": "2rem" }}>
        <h2 style={{ "margin-bottom": "1rem" }}>Beat Indicator</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <For each={Array.from({ length: beatsPerBar() }, (_, i) => i)}>
            {(beatIndex) => (
              <div
                style={{
                  width: "3rem",
                  height: "3rem",
                  "border-radius": "50%",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  "font-weight": "bold",
                  "font-size": "1.25rem",
                  transition: "all 0.1s ease",
                  "background-color":
                    currentBeatInBar() === beatIndex && beatFlash()
                      ? beatIndex === 0
                        ? "#ef4444"
                        : "#22c55e"
                      : currentBeatInBar() === beatIndex
                        ? beatIndex === 0
                          ? "#fca5a5"
                          : "#86efac"
                        : "#e5e7eb",
                  transform: currentBeatInBar() === beatIndex && beatFlash() ? "scale(1.2)" : "scale(1)",
                }}
              >
                {beatIndex + 1}
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Position Display */}
      <div
        style={{
          "background-color": barFlash() ? "#dbeafe" : "#f3f4f6",
          padding: "1.5rem",
          "border-radius": "0.5rem",
          "margin-bottom": "2rem",
          transition: "background-color 0.15s ease",
        }}
      >
        <div style={{ display: "grid", "grid-template-columns": "1fr 1fr 1fr", gap: "1rem", "text-align": "center" }}>
          <div>
            <div style={{ "font-size": "0.875rem", color: "#6b7280", "margin-bottom": "0.25rem" }}>Bar</div>
            <div style={{ "font-size": "2rem", "font-weight": "bold", "font-family": "monospace" }}>
              {currentBar() + 1}
            </div>
          </div>
          <div>
            <div style={{ "font-size": "0.875rem", color: "#6b7280", "margin-bottom": "0.25rem" }}>Beat</div>
            <div style={{ "font-size": "2rem", "font-weight": "bold", "font-family": "monospace" }}>
              {currentBeatInBar() + 1}
            </div>
          </div>
          <div>
            <div style={{ "font-size": "0.875rem", color: "#6b7280", "margin-bottom": "0.25rem" }}>Total Beats</div>
            <div style={{ "font-size": "2rem", "font-weight": "bold", "font-family": "monospace" }}>{currentBeat()}</div>
          </div>
        </div>
      </div>

      {/* Elapsed Time */}
      <div style={{ "text-align": "center" }}>
        <div style={{ "font-size": "0.875rem", color: "#6b7280", "margin-bottom": "0.25rem" }}>Elapsed Time</div>
        <div style={{ "font-size": "2.5rem", "font-weight": "bold", "font-family": "monospace" }}>
          {formatTime(elapsedTime())}
        </div>
      </div>

      {/* Info */}
      <div style={{ "margin-top": "2rem", "font-size": "0.875rem", color: "#6b7280" }}>
        <p>
          <strong>Beat Duration:</strong> {(60 / bpm() * 1000).toFixed(1)}ms
        </p>
        <p>
          <strong>Bar Duration:</strong> {(60 / bpm() * beatsPerBar()).toFixed(2)}s
        </p>
      </div>
    </div>
  );
}

export default App;
