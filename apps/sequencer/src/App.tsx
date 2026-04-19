import { useState, useRef, useEffect } from "react";
import AudioClock from "@web-audio/clock";
import {
  createAudioContext,
  type ManagedAudioContext,
} from "@web-audio/context";
import Drome from "@web-audio/fluid";
import AudioEngine from "@web-audio/audio-engine";

const DEFAULT_CODE = `d.synth("triangle")
 .root("c4")
 .scale("maj")
 .notes([[0, 2], 4, 6], [6, 4, 2, 0])
 .euclid(3, 8)
 .detune([0, 100])
 .push()`;

type LogEntry = { text: string; type: "output" | "error" };

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const audioRef = useRef<ManagedAudioContext | null>(null);
  const clockRef = useRef<AudioClock | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);

  const addLog = (text: string, type: LogEntry["type"]) => {
    setLogs((prev) => [{ text, type }, ...prev]);
  };

  const getAudio = () => {
    if (!audioRef.current) {
      audioRef.current = createAudioContext();
    }
    return audioRef.current;
  };

  const getClock = () => {
    if (!clockRef.current) {
      clockRef.current = new AudioClock(getAudio().ctx, 140, 4);
    }
    return clockRef.current;
  };

  const getEngine = () => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine(getAudio().ctx, getClock());
    }
    return engineRef.current;
  };

  const stopClock = () => {
    if (!isRunning) return;
    clockRef.current?.stop();
    setIsRunning(false);
  };

  const evaluate = async (input: string) => {
    try {
      const d = new Drome();
      new Function("drome", "d", input)(d, d);
      const schema = d.getSchema();

      getEngine().update(schema);

      if (!isRunning) {
        await getClock().start();
        setIsRunning(true);
      }

      addLog("✓", "output");
    } catch (error) {
      addLog(`✗ ${(error as Error).message}`, "error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      evaluate(code);
    }
  };

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      clockRef.current?.stop();
      audioRef.current?.dispose();
    };
  }, []);

  return (
    <div
      style={{ padding: "20px", fontFamily: "monospace", maxWidth: "640px" }}
    >
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button
          onClick={() => evaluate(code)}
          style={{
            padding: "6px 16px",
            backgroundColor: "#1e90ff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          run
        </button>
        <button
          onClick={stopClock}
          style={{
            padding: "6px 16px",
            backgroundColor: "#ff4757",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontFamily: "monospace",
          }}
          disabled={!isRunning}
        >
          stop
        </button>
        <span
          style={{ fontSize: "0.75rem", color: "#888", alignSelf: "center" }}
        >
          ⌘↵
        </span>
      </div>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        style={{
          width: "100%",
          height: "180px",
          padding: "10px",
          fontFamily: "monospace",
          fontSize: "0.9rem",
          backgroundColor: "#1e1e2e",
          color: "#cdd6f4",
          border: "1px solid #45475a",
          borderRadius: "4px",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />

      <div
        style={{
          padding: "10px",
          backgroundColor: "#1e1e2e",
          border: "1px solid #45475a",
          borderRadius: "4px",
          fontFamily: "monospace",
          fontSize: "0.8rem",
          minHeight: "80px",
          maxHeight: "200px",
          overflowY: "auto",
        }}
      >
        {logs.length === 0 ? (
          <span style={{ color: "#585b70" }}>no output</span>
        ) : (
          logs.map((entry, i) => (
            <div
              key={i}
              style={{ color: entry.type === "error" ? "#f38ba8" : "#a6e3a1" }}
            >
              {entry.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
