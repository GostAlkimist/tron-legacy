/**
 * Cadena de rastro SHA-256 — lógica pura, sin DOM/Canvas.
 * Evidencia de alteraciones (tamper-evident) dentro de la partida.
 * Web Crypto API (crypto.subtle.digest).
 */

const GENESIS_HASH = "0".repeat(64);

async function sha256Hex(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export class DecisionChain {
  constructor() {
    this.blocks = [];
    this._genesisPromise = this._createGenesis();
  }

  async _createGenesis() {
    const block = {
      index: 0,
      timestamp: new Date().toISOString(),
      decision_id: "genesis",
      option_id: "start",
      sector: 0,
      prev_hash: GENESIS_HASH,
      hash: ""
    };
    block.hash = await this._computeHash(block);
    this.blocks.push(block);
    return block;
  }

  async ready() {
    await this._genesisPromise;
  }

  async _computeHash(block) {
    const payload = [
      block.index,
      block.timestamp,
      block.decision_id,
      block.option_id,
      block.sector,
      block.prev_hash
    ].join("|");
    return sha256Hex(payload);
  }

  async append(decisionId, optionId, sector) {
    await this.ready();
    const prev = this.blocks[this.blocks.length - 1];
    const block = {
      index: this.blocks.length,
      timestamp: new Date().toISOString(),
      decision_id: decisionId,
      option_id: optionId,
      sector: sector,
      prev_hash: prev.hash,
      hash: ""
    };
    block.hash = await this._computeHash(block);
    this.blocks.push(block);
    return block;
  }

  async verify() {
    await this.ready();
    if (this.blocks.length === 0) return { intact: true, firstCorruptIndex: -1 };

    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const expectedPrev = i === 0 ? GENESIS_HASH : this.blocks[i - 1].hash;
      if (b.prev_hash !== expectedPrev) {
        return { intact: false, firstCorruptIndex: i };
      }
      const recomputed = await this._computeHash(b);
      if (recomputed !== b.hash) {
        return { intact: false, firstCorruptIndex: i };
      }
    }
    return { intact: true, firstCorruptIndex: -1 };
  }

  getFinalHash() {
    if (this.blocks.length === 0) return GENESIS_HASH;
    return this.blocks[this.blocks.length - 1].hash;
  }

  getBlocks() {
    return this.blocks.map(b => ({ ...b }));
  }

  getDisplay() {
    return this.blocks.map(b => ({
      index: b.index,
      decision: b.decision_id,
      option: b.option_id,
      sector: b.sector,
      hash: b.hash.slice(0, 12) + "…"
    }));
  }
}
