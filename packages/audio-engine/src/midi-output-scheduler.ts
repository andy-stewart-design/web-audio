import type { Midi, ResolvedMidiOutput } from "@web-audio/midi";

const MIDI_DISPATCH_HORIZON = 0.05;

type SchedulerClock = {
  ctx: { readonly currentTime: number };
  schedulingLeadTime: number;
  schedulingInterval: number;
  audioTimeToMIDITime: (time: number) => number;
};

type ScheduleTimer = (callback: () => void, delay: number) => () => void;

type MidiOutputSchedulerOptions = {
  scheduleTimer?: ScheduleTimer;
};

const scheduleTimer: ScheduleTimer = (callback, delay) => {
  const handle = setTimeout(callback, delay);
  return () => clearTimeout(handle);
};

type LogicalNote = {
  selector?: string;
  channel: number;
  note: number;
  velocity: number;
  startTime: number;
  endTime: number;
};

type LogicalEvent = {
  type: "note-on" | "note-off";
  noteId: number;
  selector?: string;
  channel: number;
  note: number;
  velocity: number;
  time: number;
  sequence: number;
};

class MidiOutputScheduler {
  private _clock: SchedulerClock;
  private _scheduleTimer: ScheduleTimer;
  private _midi: Midi | null = null;
  private _events: LogicalEvent[] = [];
  private _noteOutputs = new Map<number, ResolvedMidiOutput>();
  private _overlapCounts = new Map<string, number>();
  private _trackedOutputs = new Map<ResolvedMidiOutput, Set<number>>();
  private _cancelTimer: (() => void) | null = null;
  private _nextNoteId = 0;
  private _nextSequence = 0;
  private _destroyed = false;

  constructor(clock: SchedulerClock, opts: MidiOutputSchedulerOptions = {}) {
    if (
      MIDI_DISPATCH_HORIZON + clock.schedulingInterval >=
      clock.schedulingLeadTime
    ) {
      throw new RangeError(
        "MIDI dispatch horizon plus timer delay must be shorter than the clock scheduling lead.",
      );
    }

    this._clock = clock;
    this._scheduleTimer = opts.scheduleTimer ?? scheduleTimer;
  }

  connect(midi: Midi) {
    if (this._destroyed || this._midi === midi) return;
    this.disconnect();
    this._midi = midi;
  }

  disconnect() {
    if (this._destroyed) return;
    this._reset(true);
    this._midi = null;
  }

  scheduleNote(note: LogicalNote) {
    if (this._destroyed || note.velocity === 0) return;

    const noteId = this._nextNoteId++;
    this._events.push(
      {
        type: "note-on",
        noteId,
        selector: note.selector,
        channel: note.channel,
        note: note.note,
        velocity: note.velocity,
        time: note.startTime,
        sequence: this._nextSequence++,
      },
      {
        type: "note-off",
        noteId,
        selector: note.selector,
        channel: note.channel,
        note: note.note,
        velocity: 0,
        time: note.endTime,
        sequence: this._nextSequence++,
      },
    );
    this._sortEvents();
    this._armTimer();
  }

  stop() {
    if (this._destroyed) return;
    this._reset(true);
  }

  destroy() {
    if (this._destroyed) return;
    this._reset(true);
    this._midi = null;
    this._destroyed = true;
  }

  private _armTimer() {
    this._clearActiveTimer();
    const next = this._events[0];
    if (!next) return;

    const delay = Math.max(
      0,
      (next.time - MIDI_DISPATCH_HORIZON - this._clock.ctx.currentTime) * 1000,
    );
    this._cancelTimer = this._scheduleTimer(() => {
      this._cancelTimer = null;
      this._dispatch();
    }, delay);
  }

  private _dispatch() {
    if (this._destroyed) return;
    const now = this._clock.ctx.currentTime;
    const cutoff = now + MIDI_DISPATCH_HORIZON;
    let count = 0;
    while (count < this._events.length && this._events[count].time <= cutoff) {
      count++;
    }
    const ready = this._events.splice(0, count);

    for (const event of ready) {
      const midiTime = this._clock.audioTimeToMIDITime(
        event.time <= now ? now : event.time,
      );
      if (event.type === "note-on") this._sendNoteOn(event, midiTime);
      else this._sendNoteOff(event, midiTime);
    }

    this._armTimer();
  }

  private _sendNoteOn(event: LogicalEvent, time: number) {
    if (!this._midi) return;
    const output = this._midi.out.resolve(event.selector);
    if (!output) return;

    const result = this._midi.out.noteOn(output, {
      note: event.note,
      velocity: event.velocity,
      channel: event.channel,
      time,
    });
    if (!result.sent) return;

    this._noteOutputs.set(event.noteId, output);
    const key = this._overlapKey(output, event.channel, event.note);
    this._overlapCounts.set(key, (this._overlapCounts.get(key) ?? 0) + 1);
    let channels = this._trackedOutputs.get(output);
    if (!channels) {
      channels = new Set();
      this._trackedOutputs.set(output, channels);
    }
    channels.add(event.channel);
  }

  private _sendNoteOff(event: LogicalEvent, time: number) {
    if (!this._midi) return;
    const output = this._noteOutputs.get(event.noteId);
    this._noteOutputs.delete(event.noteId);
    if (!output) return;

    const key = this._overlapKey(output, event.channel, event.note);
    const count = this._overlapCounts.get(key) ?? 0;
    if (count > 1) {
      this._overlapCounts.set(key, count - 1);
      return;
    }

    this._overlapCounts.delete(key);
    this._midi.out.noteOff(output, {
      note: event.note,
      channel: event.channel,
      time,
    });
  }

  private _reset(clearOutputs: boolean) {
    this._clearActiveTimer();
    if (clearOutputs && this._midi) {
      const time = this._clock.audioTimeToMIDITime(this._clock.ctx.currentTime);
      for (const output of this._trackedOutputs.keys()) {
        this._midi.out.clear(output);
      }
      for (const [output, channels] of this._trackedOutputs) {
        for (const channel of channels) {
          this._midi.out.cc(output, { cc: 123, value: 0, channel, time });
        }
      }
    }

    this._events = [];
    this._noteOutputs.clear();
    this._overlapCounts.clear();
    this._trackedOutputs.clear();
  }

  private _clearActiveTimer() {
    if (!this._cancelTimer) return;
    this._cancelTimer();
    this._cancelTimer = null;
  }

  private _sortEvents() {
    this._events.sort(
      (a, b) =>
        a.time - b.time ||
        (a.type === b.type ? 0 : a.type === "note-off" ? -1 : 1) ||
        a.sequence - b.sequence,
    );
  }

  private _overlapKey(
    output: ResolvedMidiOutput,
    channel: number,
    note: number,
  ) {
    return `${output.id}:${channel}:${note}`;
  }
}

export default MidiOutputScheduler;
export type { LogicalNote };
