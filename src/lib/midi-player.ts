import type { Note } from "../types";

interface Session {
  notes: Note[];
  position: number;
  rate: number;
  duration: number;
  clock: number | null;
  queue: Note[];
  next: number;
}

export class MidiPlayer {
  private context: AudioContext | null = null;
  private session: Session | null = null;
  private output: DynamicsCompressorNode | null = null;
  private voices = new Set<OscillatorNode>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private onTime: (time: number, ended: boolean) => void,
    private createContext = () => new AudioContext(),
  ) {}

  get active() { return this.session !== null; }

  get currentTime() {
    const session = this.session;
    if (!session) return undefined;
    const elapsed = session.clock === null ? 0 : this.context!.currentTime - session.clock;
    return Math.min(session.duration, session.position + elapsed * session.rate);
  }

  async play(notes: Note[], position: number, rate: number, duration: number) {
    this.stop();
    const context = this.context ??= this.createContext();
    const session: Session = { notes, position, rate, duration, clock: null, queue: [], next: 0 };
    this.session = session;
    try {
      await context.resume();
      if (this.session !== session) return false;
      this.scheduleFrom(session);
      return this.session === session;
    } catch (error) {
      if (this.session !== session) return false;
      this.stop();
      throw error;
    }
  }

  seek(position: number) {
    const session = this.session;
    if (!session) return;
    session.position = position;
    if (session.clock !== null) this.scheduleFrom(session);
  }

  update(notes: Note[], rate: number) {
    const session = this.session;
    if (!session) return;
    session.position = this.currentTime!;
    session.notes = notes;
    session.rate = rate;
    if (session.clock !== null) this.scheduleFrom(session);
  }

  stop() {
    this.session = null;
    this.clearSchedule();
  }

  dispose() {
    this.stop();
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
  }

  private clearSchedule() {
    clearTimeout(this.timer);
    this.output?.disconnect();
    this.output = null;
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
  }

  private scheduleFrom(session: Session) {
    this.clearSchedule();
    const context = this.context!;
    const output = this.output = context.createDynamicsCompressor();
    output.connect(context.destination);
    session.clock = context.currentTime;
    session.queue = session.notes
      .filter((note) => note.start + note.duration > session.position && note.start < session.duration)
      .sort((first, second) => first.start - second.start);
    session.next = 0;
    this.tick(session, context, output);
  }

  private tick(session: Session, context: AudioContext, output: DynamicsCompressorNode) {
    const now = context.currentTime;
    const position = this.currentTime!;
    if (position >= session.duration) {
      this.stop();
      this.onTime(session.duration, true);
      return;
    }
    const horizon = position + 0.15 * session.rate;
    while (session.next < session.queue.length && session.queue[session.next].start <= horizon) {
      const note = session.queue[session.next++];
      const start = Math.max(now, session.clock! + (note.start - session.position) / session.rate);
      const end = session.clock! + (Math.min(session.duration, note.start + note.duration) - session.position) / session.rate;
      if (end <= start) continue;
      const voice = context.createOscillator();
      const gain = context.createGain();
      voice.type = "triangle";
      voice.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
      const level = 0.16 * Math.max(0.1, Math.min(1, note.confidence));
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + Math.min(0.01, (end - start) / 3));
      gain.gain.exponentialRampToValueAtTime(level * 0.35, end);
      gain.gain.linearRampToValueAtTime(0, end + 0.025);
      voice.connect(gain);
      gain.connect(output);
      this.voices.add(voice);
      voice.onended = () => {
        this.voices.delete(voice);
        voice.disconnect();
        gain.disconnect();
      };
      voice.start(start);
      voice.stop(end + 0.025);
    }
    this.onTime(position, false);
    this.timer = setTimeout(() => this.tick(session, context, output), 40);
  }
}
