/**
 * GameState — lógica pura, sin DOM ni Canvas.
 * Gestiona sector, flags, trust, threat, decisions, checkpoint, player, objective, ending.
 */

export class GameState {
  constructor(config = {}) {
    this.config = config;
    this.reset();
  }

  reset() {
    const t = this.config.trust || {};
    this.sector = 1;
    this.flags = new Set();
    this.trust = {
      arranque_a: t.initial ?? 50,
      arranque_b: t.initial ?? 50
    };
    this.threat = 0;
    this.decisions = [];
    this.checkpoint = { sector: 1, x: 80, y: 300 };
    this.player = {
      x: 80,
      y: 300,
      vx: 0,
      vy: 0,
      radius: (this.config.player && this.config.player.radius) || 12,
      hidden: false,
      hideTimer: 0,
      facing: 1
    };
    this.objective = "Habla con las Programadoras de Arranque";
    this.ending = null;
    this.captured = false;
    this.inDialogue = false;
    this.gamePhase = "menu"; // menu | intro | playing | pause | capture | final | credits
    this.pd1IgnoreMultiplier = 1;
    this.shortcutUnlocked = false;
  }

  setFlag(name) {
    this.flags.add(name);
  }

  hasFlag(name) {
    return this.flags.has(name);
  }

  clearFlag(name) {
    this.flags.delete(name);
  }

  applyTrustDelta(deltas = {}) {
    const min = (this.config.trust && this.config.trust.min) ?? 0;
    const max = (this.config.trust && this.config.trust.max) ?? 100;
    for (const [npc, delta] of Object.entries(deltas)) {
      if (!(npc in this.trust)) this.trust[npc] = (this.config.trust && this.config.trust.initial) ?? 50;
      this.trust[npc] = Math.max(min, Math.min(max, this.trust[npc] + delta));
    }
    this._updateAllyTrust();
  }

  getAllyTrust() {
    const vals = Object.values(this.trust);
    if (vals.length === 0) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  _updateAllyTrust() {
    const threshold = (this.config.trust && this.config.trust.allyThreshold) ?? 70;
    this.shortcutUnlocked = this.getAllyTrust() >= threshold;
  }

  recordDecision(decisionId, optionId, sector) {
    this.decisions.push({
      decision_id: decisionId,
      option_id: optionId,
      sector: sector ?? this.sector,
      timestamp: new Date().toISOString()
    });
  }

  getDecisionTreeDisplay() {
    return this.decisions.map((d, i) =>
      `${i + 1}. ${d.decision_id} → ${d.option_id} (Sector ${d.sector})`
    );
  }

  setCheckpoint(x, y, sector) {
    this.checkpoint = {
      sector: sector ?? this.sector,
      x: x ?? this.player.x,
      y: y ?? this.player.y
    };
  }

  capture() {
    this.captured = true;
    this.threat = 0;
    this.player.x = this.checkpoint.x;
    this.player.y = this.checkpoint.y;
    this.player.hidden = false;
    this.player.hideTimer = 0;
    this.sector = this.checkpoint.sector;
    this.gamePhase = "capture";
  }

  afterCapture() {
    this.captured = false;
    this.gamePhase = "playing";
  }

  setEnding(id) {
    this.ending = id;
    this.gamePhase = "final";
  }

  toJSON() {
    return {
      sector: this.sector,
      flags: [...this.flags],
      trust: { ...this.trust },
      threat: this.threat,
      decisions: [...this.decisions],
      checkpoint: { ...this.checkpoint },
      player: { ...this.player },
      objective: this.objective,
      ending: this.ending,
      shortcutUnlocked: this.shortcutUnlocked
    };
  }
}
