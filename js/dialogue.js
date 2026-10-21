/**
 * DialogueEngine — lógica pura, sin DOM/Canvas.
 * Carga y recorre árboles desde JSON. Aplica trust, flags y decisions a la cadena.
 */

export class DialogueEngine {
  constructor() {
    this.nodes = new Map();
    this.currentId = null;
    this.onEnd = null;
    this.educational = {};
  }

  load(data) {
    this.nodes.clear();
    if (data.nodes) {
      for (const n of data.nodes) {
        this.nodes.set(n.id, n);
      }
    }
    this.educational = data.educational || {};
  }

  start(nodeId) {
    if (!this.nodes.has(nodeId)) {
      console.warn("Dialogue node not found:", nodeId);
      return false;
    }
    this.currentId = nodeId;
    return true;
  }

  getCurrent() {
    if (!this.currentId) return null;
    return this.nodes.get(this.currentId) || null;
  }

  hasOptions() {
    const node = this.getCurrent();
    return node && Array.isArray(node.options) && node.options.length > 0;
  }

  isAvailable(node, state) {
    if (!node) return false;
    if (!node.requires_flags || node.requires_flags.length === 0) return true;
    return node.requires_flags.every(f => state.hasFlag(f));
  }

  /**
   * Elige opción por índice (0-based). Aplica efectos a state y chain.
   * @returns {Promise<{advanced: boolean, ended: boolean}>}
   */
  async choose(index, state, chain) {
    const node = this.getCurrent();
    if (!node || !node.options || index < 0 || index >= node.options.length) {
      return { advanced: false, ended: false };
    }
    const opt = node.options[index];

    if (opt.trust_delta) {
      state.applyTrustDelta(opt.trust_delta);
    }
    if (opt.set_flags) {
      for (const f of opt.set_flags) state.setFlag(f);
    }
    if (opt.clear_flags) {
      for (const f of opt.clear_flags) state.clearFlag(f);
    }
    if (opt.decision_id) {
      state.recordDecision(opt.decision_id, opt.option_id || String(index), state.sector);
      if (chain) {
        await chain.append(opt.decision_id, opt.option_id || String(index), state.sector);
      }
      // PD-1 ignore multiplier
      if (opt.decision_id === "PD-1" && (opt.option_id === "ignorar" || index === 2)) {
        state.pd1IgnoreMultiplier = (state.config.threat && state.config.threat.pd1IgnoreMultiplier) || 1.25;
      }
      // PD-3 endings
      if (opt.decision_id === "PD-3") {
        if (opt.option_id === "destruir") state.setEnding("destroy");
        else if (opt.option_id === "rescatar") state.setEnding("rescue");
        else if (opt.option_id === "escapar") state.setEnding("escape");
      }
    }

    if (opt.next) {
      this.currentId = opt.next;
      return { advanced: true, ended: false };
    }
    this.currentId = null;
    if (this.onEnd) this.onEnd();
    return { advanced: true, ended: true };
  }

  /**
   * Avanza un nodo sin opciones (next).
   */
  advance(state) {
    const node = this.getCurrent();
    if (!node) return { advanced: false, ended: true };

    if (node.set_flags) {
      for (const f of node.set_flags) state.setFlag(f);
    }
    if (node.next) {
      // Buscar siguiente disponible si hay requires_flags
      let nextId = node.next;
      let nextNode = this.nodes.get(nextId);
      // Si el next tiene requires y no se cumple, intentar variantes conocidas
      if (nextNode && !this.isAvailable(nextNode, state)) {
        // fallback simple: buscar nodos alternativos por patrón
        const alt = this._findAvailableAlt(nextId, state);
        if (alt) nextId = alt;
      }
      this.currentId = nextId;
      return { advanced: true, ended: false };
    }
    this.currentId = null;
    if (this.onEnd) this.onEnd();
    return { advanced: true, ended: true };
  }

  _findAvailableAlt(baseId, state) {
    const candidates = [
      baseId + "_alt",
      baseId.replace(/_help$/, "_help_alt"),
      baseId.replace(/_alt$/, ""),
      baseId
    ];
    for (const a of candidates) {
      const n = this.nodes.get(a);
      if (n && this.isAvailable(n, state)) return a;
    }
    const altId = baseId.endsWith("_alt") ? baseId : baseId + "_alt";
    if (this.nodes.has(altId) && this.isAvailable(this.nodes.get(altId), state)) {
      return altId;
    }
    const base = this.nodes.get(baseId);
    if (base && (!base.requires_flags || base.requires_flags.length === 0)) return baseId;
    if (base && base.next) return base.next;
    return baseId;
  }

  isActive() {
    return this.currentId !== null;
  }

  getEducational() {
    return this.educational;
  }
}

/**
 * Construye el certificado de final.
 */
export function buildCertificate(state, chain) {
  const endingLabels = {
    destroy: "Destruir el rastro",
    rescue: "Rescatar los datos",
    escape: "Escapar con Elena"
  };
  const edu = {
    destroy: "El borrado criptográfico es irreversible por diseño.",
    rescue: "La evidencia sobrevive al intento de ocultamiento.",
    escape: "Lo que no se sanitiza, permanece."
  };
  const ending = state.ending || "unknown";
  return {
    title: endingLabels[ending] || ending,
    educational: edu[ending] || "",
    decisions: state.getDecisionTreeDisplay(),
    chainLength: chain ? chain.getBlocks().length : 0,
    finalHash: chain ? chain.getFinalHash() : "",
    allyTrust: state.getAllyTrust(),
    timestamp: new Date().toISOString()
  };
}
