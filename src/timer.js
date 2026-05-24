export function buildSessions(menu) {
  const sessions = [];
  menu.rounds.forEach((round, index) => {
    sessions.push({
      type: "round",
      label: `Round ${index + 1}`,
      seconds: Number(menu.roundSeconds),
      items: round.items,
      memo: round.memo
    });
    if (index < menu.rounds.length - 1 && Number(menu.restSeconds) > 0) {
      sessions.push({
        type: "rest",
        label: `Rest ${index + 1}`,
        seconds: Number(menu.restSeconds),
        items: [],
        memo: ""
      });
    }
  });
  return sessions;
}

export function formatTime(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export class TrainingTimer {
  constructor({ sessions, onTick, onSession, onComplete }) {
    this.sessions = sessions;
    this.onTick = onTick;
    this.onSession = onSession;
    this.onComplete = onComplete;
    this.index = 0;
    this.remaining = sessions[0]?.seconds || 0;
    this.running = false;
    this.interval = null;
    this.warned = false;
    this.announcedIndex = null;
  }

  current() {
    return this.sessions[this.index] || null;
  }

  next() {
    return this.sessions[this.index + 1] || null;
  }

  start() {
    if (this.running || !this.current()) return;
    this.running = true;
    if (this.announcedIndex !== this.index) {
      this.announcedIndex = this.index;
      this.onSession?.(this.current(), this.next());
    }
    this.tickView();
    this.interval = window.setInterval(() => this.step(), 1000);
  }

  pause() {
    this.running = false;
    window.clearInterval(this.interval);
    this.interval = null;
    this.tickView();
  }

  toggle() {
    if (this.running) this.pause();
    else this.start();
  }

  skip() {
    this.advance();
  }

  stop() {
    this.running = false;
    window.clearInterval(this.interval);
    this.interval = null;
  }

  step() {
    this.remaining -= 1;
    if (this.remaining === 10 && !this.warned) {
      this.warned = true;
      this.onTick?.(this.current(), this.next(), this.remaining, "warning");
    } else {
      this.onTick?.(this.current(), this.next(), this.remaining, "tick");
    }
    if (this.remaining <= 0) this.advance();
  }

  advance() {
    this.index += 1;
    this.warned = false;
    if (!this.sessions[this.index]) {
      this.stop();
      this.onComplete?.();
      return;
    }
    this.remaining = this.sessions[this.index].seconds;
    this.announcedIndex = this.index;
    this.onSession?.(this.current(), this.next());
    this.tickView();
  }

  tickView() {
    this.onTick?.(this.current(), this.next(), this.remaining, "view");
  }
}
