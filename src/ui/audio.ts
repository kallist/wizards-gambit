class GameAudio {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private musicVolume = 0.35;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicVoices = new Set<OscillatorNode>();
  private nextBeat = 0;
  private beat = 0;
  enabled = false;
  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicVolume;
        this.musicBus.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended")
        void this.ctx.resume().catch(() => undefined);
    } catch {
      this.enabled = false;
    }
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      this.unlock();
      this.startMusic();
    } else this.stopMusic();
  }
  setMusicVolume(value: number) {
    this.musicVolume = Number.isFinite(value)
      ? Math.max(0, Math.min(1, value))
      : 0.35;
    if (this.ctx && this.musicBus)
      this.musicBus.gain.setTargetAtTime(
        this.musicVolume,
        this.ctx.currentTime,
        0.08,
      );
  }
  private startMusic() {
    if (!this.ctx || !this.enabled || this.musicTimer) return;
    this.nextBeat = this.ctx.currentTime + 0.05;
    this.beat = 0;
    this.scheduleMusic();
    this.musicTimer = setInterval(() => this.scheduleMusic(), 2000);
  }
  private scheduleMusic() {
    if (!this.ctx || !this.musicBus || !this.enabled) return;
    const c = this.ctx;
    // Original 32-beat chamber miniature, "An Evening Kept for You".
    // No film recording or quoted melody. Long envelopes soften loop edges.
    const melody = [
      72, 76, 79, 74, 77, 81, 79, 76, 71, 74, 77, 72, 76, 79, 74, 0, 69, 72, 76,
      79, 77, 74, 72, 76, 67, 71, 74, 77, 76, 72, 71, 0,
    ];
    const harmony = [
      [48, 55, 64],
      [53, 60, 69],
      [45, 52, 60],
      [43, 50, 59],
    ];
    const note = (
      midi: number,
      start: number,
      duration: number,
      gain: number,
      type: OscillatorType,
    ) => {
      const oscillator = c.createOscillator(),
        volume = c.createGain();
      oscillator.type = type;
      oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      volume.gain.setValueAtTime(0.0001, start);
      volume.gain.exponentialRampToValueAtTime(gain, start + 0.12);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(volume).connect(this.musicBus!);
      this.musicVoices.add(oscillator);
      oscillator.onended = () => {
        this.musicVoices.delete(oscillator);
        oscillator.disconnect();
        volume.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.05);
    };
    // An inactive tab may suspend timers. Never queue missed minutes of sound.
    if (this.nextBeat < c.currentTime) this.nextBeat = c.currentTime + 0.05;
    while (this.nextBeat < c.currentTime + 5) {
      const index = this.beat % melody.length,
        midi = melody[index];
      if (midi) note(midi, this.nextBeat, 1.8, 0.045, "sine");
      if (index % 8 === 0)
        for (const pitch of harmony[Math.floor(index / 8)])
          note(pitch, this.nextBeat, 8.4, 0.018, "triangle");
      this.nextBeat += 1.05;
      this.beat++;
    }
  }
  private stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.musicVoices.forEach((voice) => {
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    });
    this.musicVoices.clear();
  }
  private tone(
    freq: number,
    start: number,
    duration: number,
    gain: number,
    type: OscillatorType = "sine",
    end?: number,
  ) {
    if (!this.ctx || !this.enabled) return;
    const oscillator = this.ctx.createOscillator(),
      volume = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (end)
      oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume).connect(this.ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
  play(kind: "move" | "capture" | "spell" | "tap" | "win") {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx!,
      now = c.currentTime;
    if (kind === "move") {
      this.tone(180, now, 0.1, 0.04, "triangle", 80);
      return;
    }
    if (kind === "tap") {
      this.tone(784, now, 0.13, 0.025);
      this.tone(1174, now + 0.06, 0.2, 0.02);
      return;
    }
    if (kind === "spell") {
      [392, 587, 784, 1174].forEach((f, i) =>
        this.tone(f, now + i * 0.045, 0.35, 0.025),
      );
      return;
    }
    if (kind === "win") {
      [392, 494, 587, 784, 988].forEach((f, i) =>
        this.tone(f, now + i * 0.1, 0.6, 0.035),
      );
      return;
    }
    this.tone(130, now, 0.32, 0.15, "sine", 35);
    this.tone(72, now + 0.04, 0.4, 0.11, "triangle", 25);
    const buffer = c.createBuffer(1, c.sampleRate * 0.28, c.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    const source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      volume = c.createGain();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = 1100;
    volume.gain.value = 0.095;
    source.connect(filter).connect(volume).connect(c.destination);
    source.start(now + 0.03);
    [880, 1320, 1760].forEach((f, i) =>
      this.tone(f, now + 0.15 + i * 0.035, 0.35, 0.018),
    );
  }
}
export const audio = new GameAudio();
