import type { Midi, ResolvedMidiOutput } from "@web-audio/midi";

// Keep logical events reorderable until shortly before they must be handed to
// Web MIDI. This must remain shorter than the clock's guaranteed scheduling
// lead after allowing for one delayed scheduler wake-up.
const MIDI_DISPATCH_HORIZON = 0.05;
const AUDIO_TIME_PRECISION = 1_000_000;

type SchedulerClock = {
  ctx: { readonly currentTime: number };
  schedulingLeadTime: number;
  schedulingInterval: number;
  audioTimeToMIDITime: (time: number) => number;
};

// Returning cancellation rather than a timer handle keeps browser/Node timer
// types out of the scheduler and makes deterministic test timers trivial.
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
  // A note-off must use the exact concrete output selected by its note-on,
  // even if the default output or connected-port list changes in between.
  private _noteOutputs = new Map<number, ResolvedMidiOutput>();
  // MIDI has no logical voice identity: one note-off can silence every onset
  // of the same channel/pitch. Counts defer the physical note-off until the
  // final successfully sent logical voice ends.
  private _overlapCounts = new Map<ResolvedMidiOutput, Map<number, number>>();
  // Teardown targets cannot be derived from active counts: a note-off may
  // already be queued in native Web MIDI while its count is gone. Retain every
  // concrete output/channel touched by successful sends until reset instead.
  private _trackedOutputs = new Map<ResolvedMidiOutput, Set<number>>();
  private _cancelTimer: (() => void) | null = null;
  private _nextNoteId = 0;
  private _nextSequence = 0;
  private _destroyed = false;

  constructor(clock: SchedulerClock, opts: MidiOutputSchedulerOptions = {}) {
    // The next bar must be submitted before any of its events can enter the
    // irreversible Web MIDI send queue, even when the timer wakes up late.
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
    if (
      this._destroyed ||
      note.velocity === 0 ||
      !Number.isInteger(note.note) ||
      note.note < 0 ||
      note.note > 127
    ) {
      return;
    }

    const startTime = this._normalizeTime(note.startTime);
    const endTime = this._normalizeTime(note.endTime);
    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      endTime <= startTime
    ) {
      return;
    }

    // Store both ends in one global queue. Bars are discovered independently,
    // so immediately sending a whole bar could queue an old note-off before a
    // later bar has supplied an equal-time note-on that must be ordered with it.
    const noteId = this._nextNoteId++;
    this._events.push(
      {
        type: "note-on",
        noteId,
        selector: note.selector,
        channel: note.channel,
        note: note.note,
        velocity: note.velocity,
        time: startTime,
        sequence: this._nextSequence++,
      },
      {
        type: "note-off",
        noteId,
        selector: note.selector,
        channel: note.channel,
        note: note.note,
        velocity: 0,
        time: endTime,
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

    // Wake when the earliest event enters the horizon, not at the event time.
    // A newly submitted earlier event cancels and replaces this timer.
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
      // Late events intentionally send now. Passing a stale timestamp leaves
      // behavior up to the native MIDI implementation and obscures recovery.
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
    // Resolve only at dispatch time so an unscoped note uses the output that is
    // actually current near its onset. The resulting stable handle is retained
    // for note-off and overlap bookkeeping.
    const output = this._midi.out.resolve(event.selector);
    if (!output) return;

    const result = this._midi.out.noteOn(output, {
      note: event.note,
      velocity: event.velocity,
      channel: event.channel,
      time,
    });
    // Failed onsets must not affect counts; their eventual note-offs become
    // no-ops because no concrete output mapping is recorded.
    if (!result.sent) return;

    this._noteOutputs.set(event.noteId, output);
    let counts = this._overlapCounts.get(output);
    if (!counts) {
      counts = new Map();
      this._overlapCounts.set(output, counts);
    }
    const key = this._noteKey(event.channel, event.note);
    counts.set(key, (counts.get(key) ?? 0) + 1);
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

    const counts = this._overlapCounts.get(output);
    const key = this._noteKey(event.channel, event.note);
    const count = counts?.get(key) ?? 0;
    // Every logical onset is sent physically, but only the final matching end
    // sends note-off so overlapping voices cannot cut one another short.
    if (counts && count > 1) {
      counts.set(key, count - 1);
      return;
    }

    counts?.delete(key);
    if (counts?.size === 0) this._overlapCounts.delete(output);
    this._midi.out.noteOff(output, {
      note: event.note,
      channel: event.channel,
      time,
    });
  }

  private _reset(clearOutputs: boolean) {
    this._clearActiveTimer();
    if (clearOutputs && this._midi) {
      // First cancel future native sends, then silence channels that may already
      // have received note-ons. Clearing alone does not stop sounding notes.
      const cleanupTime = this._clock.audioTimeToMIDITime(
        this._clock.ctx.currentTime +
          MIDI_DISPATCH_HORIZON +
          this._clock.schedulingInterval,
      );
      for (const output of this._trackedOutputs.keys()) {
        this._midi.out.clear(output);
      }
      // Some native/driver queues cannot retract a future note-on after Web
      // MIDI accepted it. Release active pitches immediately, then queue the
      // same cleanup just beyond the dispatch horizon so an escaped onset
      // cannot arrive after its cleanup. The clock invariant guarantees this
      // second pass still precedes notes from a restarted transport.
      for (const [output, counts] of this._overlapCounts) {
        for (const key of counts.keys()) {
          const options = {
            channel: Math.floor(key / 128) + 1,
            note: key % 128,
          };
          this._midi.out.noteOff(output, options);
          this._midi.out.noteOff(output, { ...options, time: cleanupTime });
        }
      }
      // CC 123 is advisory and some receivers ignore it, so retain it only as
      // a channel-wide fallback after the explicit note-offs.
      for (const [output, channels] of this._trackedOutputs) {
        for (const channel of channels) {
          this._midi.out.allNotesOff(output, { channel });
          this._midi.out.allNotesOff(output, { channel, time: cleanupTime });
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
    // At equal times, releasing before retriggering avoids the new onset being
    // immediately silenced. Sequence preserves submission order within a group.
    this._events.sort(
      (a, b) =>
        a.time - b.time ||
        (a.type === b.type ? 0 : a.type === "note-off" ? -1 : 1) ||
        a.sequence - b.sequence,
    );
  }

  private _normalizeTime(time: number) {
    // Independently calculated adjacent note boundaries can differ by a few
    // floating-point bits. Normalize to microsecond precision so they become
    // one tie group and note-off is reliably ordered before retriggering.
    return Math.round(time * AUDIO_TIME_PRECISION) / AUDIO_TIME_PRECISION;
  }

  private _noteKey(channel: number, note: number) {
    return (channel - 1) * 128 + note;
  }
}

export default MidiOutputScheduler;
export type { LogicalNote };
