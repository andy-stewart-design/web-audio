import { createSignal, onCleanup, For } from "solid-js";
import { AudioClock } from "./clock";

function App() {
  const [clock] = createSignal(new AudioClock({ bpm: 120, beatsPerBar: 4 }));
  const [isRunning, setIsRunning] = createSignal(false);
  const [currentBeat, setCurrentBeat] = createSignal(0);
  const [currentBar, setCurrentBar] = createSignal(0);
  const [logs, setLogs] = createSignal<string[]>([]);
  const [bpm, setBpm] = createSignal(120);

  const addLog = (msg: string) => {
    setLogs((prev) => [msg, ...prev]);
  };

  // --- Audio Synthesis Logic ---
  const playMetronomeClick = (beat: number, time: number) => {
    const ctx = clock().context;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();

    // Frequency: High C (1000Hz) for the downbeat, Mid C (500Hz) for others
    osc.frequency.setValueAtTime(beat === 0 ? 1000 : 500, time);

    // Envelope: Quick attack and fast decay to prevent clicking
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.5, time + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(envelope);
    envelope.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.1);

    // Garbage Collection: Disconnect nodes after the sound finishes
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
  };

  // --- Clock Subscriptions ---
  clock().onBeat((beat, time) => {
    setCurrentBeat(beat);
    playMetronomeClick(beat, time);
    addLog(`On Beat ${beat} @ ${time.toFixed(6)}s`);
  });

  clock().onBar((bar) => {
    setCurrentBar(bar);
    addLog(`--- New Bar: ${bar} ---`);
  });

  // Example of using beforeBeat for "pre-emptive" cleanup or logic
  clock().beforeBeat((beat, time) => {
    // You could use this to fade out a long-running pad before the next bar
    // addLog(`Preparing for beat ${beat}...`);
    addLog(`(Cleanup) Before Beat ${beat} @ ${time.toFixed(6)}s`);
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
      <h2>Web Audio Metronome</h2>

      <div style={{ display: "flex", "flex-direction": "column", gap: "20px" }}>
        <div style={{ display: "flex", gap: "10px", "align-items": "center" }}>
          <button
            onClick={toggleClock}
            style={{
              padding: "10px 20px",
              "background-color": isRunning() ? "#ff4757" : "#2ed573",
              color: "white",
              border: "none",
              "border-radius": "4px",
              cursor: "pointer",
            }}
          >
            {isRunning() ? "Stop" : "Start Clock"}
          </button>

          <div style={{ flex: 1 }}>
            <label style={{ display: "block", "font-size": "0.8rem" }}>
              BPM: {bpm()}
            </label>
            <input
              type="range"
              min={60}
              max={220}
              value={bpm()}
              style={{ width: "100%" }}
              onInput={(e) => {
                const val = e.target.valueAsNumber;
                clock().bpm = val;
                setBpm(val);
              }}
            />
          </div>
        </div>

        {/* Visual Metronome */}
        <div
          style={{ display: "flex", gap: "10px", "justify-content": "center" }}
        >
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

        <div style={{ "text-align": "center", "font-size": "1.2rem" }}>
          <strong>Bar:</strong> {currentBar()} | <strong>Beat:</strong>{" "}
          {currentBeat() + 1}
        </div>

        <div
          style={{
            padding: "10px",
            background: "#2f3542",
            color: "#ced4da",
            "border-radius": "4px",
            "font-family": "monospace",
            "font-size": "0.8rem",
            "min-height": "100px",
            overflow: "scroll",
          }}
        >
          <For each={logs()}>{(log) => <div>{log}</div>}</For>
        </div>
      </div>
    </div>
  );
}

export default App;
