// Capture PCM only; pitch analysis runs outside the audio rendering thread.
class HummingCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = options.processorOptions.blockSize;
    this.buffer = new Float32Array(this.size);
    this.offset = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data !== "stop") return;
      if (this.offset) {
        const samples = this.buffer.slice(0, this.offset);
        this.port.postMessage(samples, [samples.buffer]);
      }
      this.stopped = true;
      this.port.postMessage("stopped");
    };
  }
  process(inputs) {
    if (this.stopped) return false;
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.offset++] = channel[i];
      if (this.offset === this.size) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(this.size);
        this.offset = 0;
      }
    }
    // Outputs remain silent: microphone input is never played through speakers.
    return true;
  }
}
registerProcessor("hearscore-humming-capture", HummingCapture);
