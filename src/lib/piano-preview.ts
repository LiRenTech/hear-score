/** A small local piano-like synth with a sustained level while a key is held. */
export class PianoPreview {
  private context: AudioContext | null = null;
  private release: (() => void) | null = null;
  private request = 0;

  constructor(private createContext = () => new AudioContext()) {}

  async play(pitch: number) {
    this.stop();
    const request = this.request;
    const context = this.context ??= this.createContext();
    await context.resume();
    // A quick release or another key press can happen before resume finishes.
    if (request !== this.request || context.state === "closed") return;
    const now = context.currentTime;
    const frequency = 440 * 2 ** ((pitch - 69) / 12);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.7);
    gain.connect(context.destination);
    const voice = context.createOscillator();
    const real = new Float32Array(9);
    const imaginary = new Float32Array(9);
    for (let harmonic = 1; harmonic < imaginary.length; harmonic++) {
      if (frequency * harmonic < context.sampleRate / 2)
        imaginary[harmonic] = 1 / harmonic ** 2;
    }
    voice.setPeriodicWave(context.createPeriodicWave(real, imaginary));
    voice.frequency.value = frequency;
    voice.connect(gain);
    voice.onended = () => { voice.disconnect(); gain.disconnect(); };
    voice.start(now);
    this.release = () => {
      const end = context.currentTime;
      gain.gain.cancelAndHoldAtTime(end);
      gain.gain.linearRampToValueAtTime(0, end + 0.025);
      voice.stop(end + 0.03);
    };
  }

  stop() {
    this.request++;
    this.release?.();
    this.release = null;
  }

  dispose() {
    this.stop();
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
  }
}
