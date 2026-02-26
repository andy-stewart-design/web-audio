import { createSignal, onCleanup, For } from "solid-js";
import { AudioClock } from "./clock";

function App() {
  const [clock] = createSignal(new AudioClock({ bpm: 120, beatsPerBar: 4 }));
  const [isRunning, setIsRunning] = createSignal(false);
  const [currentBeat, setCurrentBeat] = createSignal(0);
  const [currentBar, setCurrentBar] = createSignal(0);
  const [logs, setLogs] = createSignal<string[]>([]);
  const [bpm, setBpm] = createSignal(120);

  // Helper to add to a small scrolling log
  const addLog = (msg: string) => {
    setLogs((prev) => [msg, ...prev].slice(0, 5));
  };

  // Subscribe to clock events
  // Note: These callbacks run inside the Clock's setTimeout loop
  clock().onBeat((beat) => {
    setCurrentBeat(beat);
    // We use the AudioContext time in the log to show precision
    addLog(`On Beat ${beat} @ ${clock().context.currentTime.toFixed(2)}s`);
  });

  clock().onBar((bar) => {
    setCurrentBar(bar);
    addLog(`--- New Bar: ${bar} ---`);
  });

  clock().beforeBeat((beat) => {
    addLog(`(Cleanup) Before Beat ${beat}`);
  });

  const toggleClock = async () => {
    if (isRunning()) {
      clock().stop();
      setIsRunning(false);
    } else {
      await clock().start();
      setIsRunning(true);
    }
  };

  onCleanup(() => clock().destroy());

  return (
    <div
      style={{
        padding: "20px",
        "font-family": "sans-serif",
        "max-width": "400px",
      }}
    >
      <h2>Web Audio Clock</h2>

      <div style={{ display: "flex", gap: "10px", "align-items": "center" }}>
        <button
          onClick={toggleClock}
          style={{
            padding: "10px 20px",
            "background-color": isRunning() ? "#ff4757" : "#2ed573",
            color: "white",
            border: "none",
            "border-radius": "4px",
          }}
        >
          {isRunning() ? "Stop" : "Start Clock"}
        </button>

        <span>BPM: {bpm()}</span>
        <input
          type="range"
          min={60}
          max={200}
          step={1}
          onChange={(e) => {
            clock().bpm = e.target.valueAsNumber;
            setBpm(e.target.valueAsNumber);
          }}
        />
      </div>

      <hr style={{ margin: "20px 0" }} />

      {/* Visual Metronome */}
      <div style={{ display: "flex", gap: "10px", "margin-bottom": "20px" }}>
        <For each={Array.from({ length: clock().beatsPerBar })}>
          {(_, i) => (
            <div
              style={{
                width: "40px",
                height: "40px",
                "border-radius": "50%",
                border: "2px solid #333",
                "background-color":
                  currentBeat() === i() && isRunning()
                    ? i() === 0
                      ? "#ff4757"
                      : "#1e90ff"
                    : "#f1f2f6",
                transition: "background-color 0.05s",
              }}
            />
          )}
        </For>
      </div>

      <div style={{ "font-size": "1.2rem" }}>
        <strong>Bar:</strong> {currentBar()} | <strong>Beat:</strong>{" "}
        {currentBeat() + 1}
      </div>

      {/* Event Log */}
      <div
        style={{
          "margin-top": "20px",
          padding: "10px",
          background: "#2f3542",
          color: "#ced4da",
          "border-radius": "4px",
          "font-family": "monospace",
          "font-size": "0.8rem",
          "min-height": "120px",
        }}
      >
        <For each={logs()}>{(log) => <div>{log}</div>}</For>
      </div>
    </div>
  );
}

export default App;
