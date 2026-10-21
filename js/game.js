/**
 * Game — Canvas 2D completo, listo para distribución.
 * Menú (Jugar/Controles/Créditos), 3 sectores, PD-1/2/3, amenaza, cadena, finales.
 */

import { GameState } from "./state.js";
import { DialogueEngine, buildCertificate } from "./dialogue.js";
import { DecisionChain } from "./chain.js";
import { AudioDirector } from "./audio.js";

const COLORS = {
  bg: "#0a0e17",
  grid: "#0d1a2f",
  cyan: "#00e5ff",
  cyanDim: "#0088aa",
  orange: "#ff6b00",
  red: "#ff2244",
  green: "#00cc66",
  violet: "#aa66ff",
  white: "#e0f0ff",
  panel: "rgba(8, 16, 32, 0.92)",
  panelBorder: "#00e5ff",
  dim: "#6a8099"
};

const SPEAKERS = {
  narrador: "Narrador",
  sistema: "Sistema",
  arranque_a: "Programadora A",
  arranque_b: "Programadora B",
  bios: "BIOS",
  elena: "Elena",
  archivo_residual: "Archivo residual"
};

export class Game {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    this.state = new GameState(config);
    this.dialogue = new DialogueEngine();
    this.chain = new DecisionChain();
    this.keys = {};
    this.lastTime = 0;
    this.fps = 0;
    this.fpsAcc = 0;
    this.fpsCount = 0;
    this.showFps = !!(config.diagnostics && config.diagnostics.showFps);
    this.certificate = null;
    this.interactHint = "";
    this.nearestInteractable = null;
    this.sentinels = [];
    this.walls = [];
    this.hides = [];
    this.interactables = [];
    this.sectorBounds = { w: 900, h: 600 };
    this.events = [];
    this.menuScreen = "main"; // main | controls | credits
    this.transitionTimer = 0;
    this.transitionTo = null;
    this.pulse = 0;
    this.showHelp = false;
    this.helpButton = { x: 0, y: 0, w: 96, h: 36 }; // actualizado en render
    this.audio = new AudioDirector(config);
    this._bindInput();
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  async init(dialogsData) {
    try {
      await this.chain.ready();
      this.dialogue.load(dialogsData);
      this.dialogue.onEnd = () => {
        this.state.inDialogue = false;
        this._onDialogueEnd();
      };
      this.state.gamePhase = "menu";
      this._loadSector(1);
    } catch (err) {
      console.error("Init error:", err);
      this.state.gamePhase = "menu";
    }
  }

  _bindInput() {
    window.addEventListener("keydown", e => {
      // Evitar scroll con espacio/flechas
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      this.keys[e.code] = true;

      if (e.code === "F3") {
        this.showFps = !this.showFps;
        return;
      }

      // Ayuda: H o F1 en cualquier momento (excepto menú principal de créditos/controles)
      if (e.code === "KeyH" || e.code === "F1") {
        if (this.state.gamePhase !== "menu" || this.menuScreen === "main") {
          this.showHelp = !this.showHelp;
          if (this.showHelp && this.state.gamePhase === "pause") {
            // mantener pausa debajo
          }
        }
        return;
      }

      if (this.showHelp) {
        if (e.code === "Escape" || e.code === "Space" || e.code === "Enter") {
          this.showHelp = false;
        }
        return;
      }

      const phase = this.state.gamePhase;

      if (phase === "menu") {
        if (e.code === "Enter" || e.code === "Space" || e.code === "Digit1") {
          if (this.menuScreen === "main") this.startGame();
          else this.menuScreen = "main";
        }
        if (e.code === "Digit2") this.menuScreen = "controls";
        if (e.code === "Digit3") this.menuScreen = "credits";
        if (e.code === "Escape") this.menuScreen = "main";
        return;
      }

      if (phase === "final") {
        if (e.code === "KeyR") this.restart();
        if (e.code === "KeyC" || e.code === "Enter") {
          window.open(this.config.arcasShredUrl || "https://www.arcasshred.com", "_blank");
          this._log("cta_click");
        }
        return;
      }

      if (phase === "capture") {
        if (e.code === "Space" || e.code === "Enter") {
          this.state.afterCapture();
        }
        return;
      }

      if (e.code === "Escape") {
        this._togglePause();
        return;
      }

      if (this.state.inDialogue) {
        if (e.code === "Digit1" || e.code === "Numpad1") this._chooseOption(0);
        if (e.code === "Digit2" || e.code === "Numpad2") this._chooseOption(1);
        if (e.code === "Digit3" || e.code === "Numpad3") this._chooseOption(2);
        if (e.code === "Space" || e.code === "Enter") this._advanceDialogue();
        return;
      }

      if (e.code === "KeyE" && phase === "playing") {
        this._tryInteract();
      }
    });

    window.addEventListener("keyup", e => {
      this.keys[e.code] = false;
    });

    this.canvas.addEventListener("click", e => this._onClick(e));
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  startGame() {
    try {
      this.state.reset();
      this.certificate = null;
      this.menuScreen = "main";
      this.chain = new DecisionChain();
      this.chain.ready().then(async () => {
        this._loadSector(1);
        this.state.gamePhase = "playing";
        this.state.inDialogue = true;
        this.dialogue.start("intro_01");
        this._log("start");
        // Audio requiere gesto del usuario (clic/tecla); ya lo tenemos al iniciar
        await this.audio.startAmbient("explore");
      });
    } catch (err) {
      console.error("startGame:", err);
      this.state.gamePhase = "menu";
    }
  }

  restart() {
    this.certificate = null;
    this.startGame();
  }

  _togglePause() {
    if (this.state.gamePhase === "playing" && !this.state.inDialogue) {
      this.state.gamePhase = "pause";
    } else if (this.state.gamePhase === "pause") {
      this.state.gamePhase = "playing";
    }
  }

  _loadSector(n) {
    this.state.sector = n;
    this.walls = [];
    this.hides = [];
    this.interactables = [];
    this.sentinels = [];
    const W = this.sectorBounds.w;
    const H = this.sectorBounds.h;

    this.walls.push(
      { x: 0, y: 0, w: W, h: 24 },
      { x: 0, y: H - 24, w: W, h: 24 },
      { x: 0, y: 0, w: 24, h: H },
      { x: W - 24, y: 0, w: 24, h: H }
    );

    if (n === 1) {
      this.state.objective = "Habla con las Programadoras de Arranque";
      this.state.player.x = 100;
      this.state.player.y = 320;
      this.state.setCheckpoint(100, 320, 1);
      this.walls.push(
        { x: 220, y: 80, w: 24, h: 220 },
        { x: 420, y: 280, w: 24, h: 220 },
        { x: 620, y: 60, w: 24, h: 200 }
      );
      this.hides.push(
        { x: 260, y: 100, w: 70, h: 50, label: "ESCONDER" },
        { x: 460, y: 420, w: 70, h: 50, label: "ESCONDER" },
        { x: 700, y: 200, w: 70, h: 50, label: "ESCONDER" }
      );
      this.interactables.push(
        {
          id: "arranque",
          x: 160,
          y: 200,
          r: 28,
          type: "npc",
          label: "Hablar",
          dialog: "s1_arranque_01",
          once: true
        },
        {
          id: "exit1",
          x: 820,
          y: 320,
          r: 32,
          type: "exit",
          label: "Salida → Sector 2",
          nextSector: 2,
          requiresFlag: "sector1_dialog_done"
        }
      );
      this.sentinels.push({
        x: 520,
        y: 160,
        r: 14,
        waypoints: [
          { x: 520, y: 160 },
          { x: 720, y: 160 },
          { x: 720, y: 420 },
          { x: 520, y: 420 }
        ],
        wpIndex: 0,
        speed: 48,
        angle: 0,
        visionAngle: Math.PI * 0.55,
        visionDist: 150,
        state: "patrol",
        alertTimer: 0
      });
    } else if (n === 2) {
      this.state.objective = "Examina los archivos residuales";
      this.state.player.x = 100;
      this.state.player.y = 320;
      this.state.setCheckpoint(100, 320, 2);
      this.walls.push(
        { x: 280, y: 60, w: 24, h: 200 },
        { x: 520, y: 280, w: 24, h: 220 }
      );
      this.hides.push(
        { x: 320, y: 400, w: 80, h: 50, label: "ESCONDER" },
        { x: 660, y: 100, w: 80, h: 50, label: "ESCONDER" }
      );
      this.interactables.push(
        {
          id: "file1",
          x: 200,
          y: 180,
          r: 24,
          type: "file",
          label: "Archivo residual",
          dialog: "s2_file_talk"
        },
        {
          id: "cell1",
          x: 380,
          y: 200,
          r: 20,
          type: "cell",
          label: "Celda física (viva)",
          color: COLORS.green
        },
        {
          id: "cell2",
          x: 460,
          y: 200,
          r: 20,
          type: "cell",
          label: "Celda física (viva)",
          color: COLORS.green
        },
        {
          id: "cell3",
          x: 420,
          y: 280,
          r: 20,
          type: "cell",
          label: "Celda física",
          color: COLORS.orange
        },
        {
          id: "firmware",
          x: 700,
          y: 360,
          r: 30,
          type: "firmware",
          label: "Terminal firmware",
          dialog: "s2_pd2"
        },
        {
          id: "exit2",
          x: 820,
          y: 500,
          r: 32,
          type: "exit",
          label: "Salida → Núcleo BIOS",
          nextSector: 3,
          requiresFlag: "concepto_explicado"
        }
      );
      if (this.state.shortcutUnlocked) {
        this.interactables.push({
          id: "shortcut",
          x: 140,
          y: 500,
          r: 28,
          type: "exit",
          label: "Atajo (confianza alta)",
          nextSector: 3,
          requiresFlag: "concepto_explicado"
        });
      }
      this.sentinels.push({
        x: 580,
        y: 160,
        r: 14,
        waypoints: [
          { x: 580, y: 160 },
          { x: 780, y: 160 },
          { x: 780, y: 460 },
          { x: 580, y: 460 }
        ],
        wpIndex: 0,
        speed: 52,
        angle: 0,
        visionAngle: Math.PI * 0.55,
        visionDist: 140,
        state: "patrol",
        alertTimer: 0
      });
      if (!this.state.hasFlag("sector2_entered")) {
        this.state.setFlag("sector2_entered");
        this.state.inDialogue = true;
        this.dialogue.start("s2_entry");
      }
    } else if (n === 3) {
      this.state.objective = "Habla con el BIOS · Decisión final";
      this.state.player.x = 120;
      this.state.player.y = 420;
      this.state.setCheckpoint(120, 420, 3);
      this.walls.push(
        { x: 240, y: 80, w: 420, h: 24 },
        { x: 240, y: 80, w: 24, h: 220 },
        { x: 636, y: 80, w: 24, h: 220 }
      );
      this.interactables.push({
        id: "bios",
        x: 450,
        y: 240,
        r: 42,
        type: "bios",
        label: "BIOS — Autoridad",
        dialog: "s3_entry"
      });
      this.audio.setPhase("judgment");
    }
    this._log("sector_" + n);
  }

  _onDialogueEnd() {
    if (this.state.gamePhase === "final") return;

    if (this.state.hasFlag("sector1_dialog_done") && this.state.sector === 1) {
      this.state.objective = "Escapa a la salida (derecha) · Evita centinelas";
    }
    if (this.state.hasFlag("concepto_explicado") && this.state.sector === 2) {
      this.state.objective = "Ve a la salida del Sector 2";
    }
    if (this.state.hasFlag("puzzle_activo") && !this.state.hasFlag("concepto_explicado")) {
      this.state.objective = "Interactúa con archivo o terminal firmware";
    }
    if (this.state.ending) {
      this.certificate = buildCertificate(this.state, this.chain);
      this.state.gamePhase = "final";
      this.state.inDialogue = false;
      this.audio.setPhase("judgment");
      this._log("ending_" + this.state.ending);
    }
  }

  async _chooseOption(idx) {
    if (!this.state.inDialogue) return;
    try {
      const result = await this.dialogue.choose(idx, this.state, this.chain);
      if (result.ended) {
        this.state.inDialogue = false;
        this._onDialogueEnd();
      }
    } catch (err) {
      console.error("chooseOption:", err);
      this.state.inDialogue = false;
    }
  }

  _advanceDialogue() {
    if (!this.state.inDialogue) return;
    if (this.dialogue.hasOptions()) return;
    try {
      const result = this.dialogue.advance(this.state);
      if (result.ended) {
        this.state.inDialogue = false;
        this._onDialogueEnd();
      }
    } catch (err) {
      console.error("advanceDialogue:", err);
      this.state.inDialogue = false;
    }
  }

  _tryInteract() {
    if (this.state.inDialogue || this.state.gamePhase !== "playing") return;
    if (!this.nearestInteractable) return;
    const it = this.nearestInteractable;

    if (it.requiresFlag && !this.state.hasFlag(it.requiresFlag)) {
      this.interactHint = "Completa el objetivo primero";
      return;
    }

    if (it.type === "exit") {
      this._loadSector(it.nextSector);
      return;
    }

    if (it.type === "cell") {
      // Feedback visual only — cells are observational
      this.interactHint = it.label + " — el contenido sigue aquí";
      return;
    }

    if (it.dialog) {
      if (it.once && this.state.hasFlag("sector1_dialog_done") && it.id === "arranque") {
        return;
      }
      // No re-trigger PD-2 after resolved
      if (it.id === "firmware" && this.state.hasFlag("concepto_explicado")) {
        this.interactHint = "Puzzle ya resuelto";
        return;
      }
      if (it.id === "file1" && this.state.hasFlag("concepto_explicado")) {
        this.interactHint = "Ya examinaste este archivo";
        return;
      }
      this.state.inDialogue = true;
      this.dialogue.start(it.dialog);
    }
  }

  _onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Cerrar ayuda con clic
    if (this.showHelp) {
      this.showHelp = false;
      return;
    }

    // Botón AYUDA del HUD (siempre clicable en juego / pausa / diálogo)
    const hb = this.helpButton;
    if (
      hb &&
      mx >= hb.x &&
      mx <= hb.x + hb.w &&
      my >= hb.y &&
      my <= hb.y + hb.h &&
      (this.state.gamePhase === "playing" ||
        this.state.gamePhase === "pause" ||
        this.state.inDialogue)
    ) {
      this.showHelp = true;
      return;
    }

    if (this.state.gamePhase === "menu") {
      if (this.menuScreen !== "main") {
        this.menuScreen = "main";
        return;
      }
      const cy = H * 0.52;
      if (my > cy - 20 && my < cy + 20) this.startGame();
      else if (my > cy + 30 && my < cy + 60) this.menuScreen = "controls";
      else if (my > cy + 70 && my < cy + 100) this.menuScreen = "credits";
      return;
    }

    if (this.state.gamePhase === "final") {
      const bw = 340,
        bh = 50;
      const bx = W / 2 - bw / 2;
      const by = H - 150;
      if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
        window.open(this.config.arcasShredUrl || "https://www.arcasshred.com", "_blank");
        this._log("cta_click");
      }
      if (my > H - 90 && my < H - 50) this.restart();
      return;
    }

    if (this.state.gamePhase === "capture") {
      this.state.afterCapture();
      return;
    }

    if (this.state.inDialogue && this.dialogue.hasOptions()) {
      const node = this.dialogue.getCurrent();
      if (!node || !node.options) return;
      const startY = H - 160;
      for (let i = 0; i < node.options.length; i++) {
        const oy = startY + i * 36;
        if (my >= oy && my <= oy + 32) {
          this._chooseOption(i);
          break;
        }
      }
    }
  }

  // ——— Update ———
  update(dt) {
    this.pulse += dt;

    if (this.showHelp) return;
    if (this.state.gamePhase === "capture" || this.state.gamePhase === "menu" || this.state.gamePhase === "final") {
      return;
    }
    if (this.state.gamePhase === "pause") return;
    if (this.state.inDialogue) return;
    if (this.state.gamePhase !== "playing") return;

    const p = this.state.player;
    const cfg = this.config.player || {};
    const speed =
      this.keys["ShiftLeft"] || this.keys["ShiftRight"]
        ? cfg.runSpeed || 220
        : cfg.walkSpeed || 130;

    let dx = 0,
      dy = 0;
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) dy -= 1;
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) dy += 1;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) dx -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) dx += 1;

    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      p.vx = (dx / len) * speed;
      p.vy = (dy / len) * speed;
      if (dx !== 0) p.facing = dx > 0 ? 1 : -1;
    } else {
      p.vx = 0;
      p.vy = 0;
    }

    const nextX = p.x + p.vx * dt;
    const nextY = p.y + p.vy * dt;
    if (!this._collides(nextX, p.y, p.radius)) p.x = nextX;
    if (!this._collides(p.x, nextY, p.radius)) p.y = nextY;

    p.x = Math.max(p.radius + 28, Math.min(this.sectorBounds.w - p.radius - 28, p.x));
    p.y = Math.max(p.radius + 28, Math.min(this.sectorBounds.h - p.radius - 28, p.y));

    // Hide zones
    p.hidden = false;
    for (const h of this.hides) {
      if (p.x > h.x && p.x < h.x + h.w && p.y > h.y && p.y < h.y + h.h) {
        p.hidden = true;
        break;
      }
    }
    if (p.hidden) {
      p.hideTimer += dt;
      const hideDur = (this.config.threat && this.config.threat.hideDuration) || 10;
      if (p.hideTimer >= hideDur) {
        this.state.threat *= (this.config.threat && this.config.threat.hideMultiplier) || 0.5;
        p.hideTimer = 0;
      }
    } else {
      p.hideTimer = 0;
    }

    // Sentinels
    let seen = false;
    for (const s of this.sentinels) {
      this._updateSentinel(s, dt);
      if (this._sentinelSees(s, p) && !p.hidden) {
        seen = true;
        s.state = "alert";
        s.alertTimer = 2.5;
      } else if (s.state === "alert") {
        s.alertTimer -= dt;
        if (s.alertTimer <= 0) s.state = "patrol";
      }
    }

    const th = this.config.threat || {};
    const mult = this.state.pd1IgnoreMultiplier || 1;
    if (seen) {
      this.state.threat += (th.increasePerSecond || 20) * mult * dt;
    } else if (!p.hidden) {
      this.state.threat -= (th.decayPerSecond || 5) * dt;
    }
    this.state.threat = Math.max(0, Math.min(th.max || 100, this.state.threat));
    // Música: más tensa si amenaza alta
    if (this.state.threat > 60) {
      this.audio.setPhase("alert");
    } else if (this.state.sector === 3) {
      this.audio.setPhase("judgment");
    } else {
      this.audio.setPhase("explore");
    }
    if (this.state.threat >= (th.max || 100)) {
      this.state.capture();
      this.audio.captureSting();
      this._log("capture");
    }

    // Nearest interactable
    this.nearestInteractable = null;
    this.interactHint = "";
    const radius = ((this.config.interactionRadius || 3) * 22);
    let bestDist = radius;
    for (const it of this.interactables) {
      const d = Math.hypot(p.x - it.x, p.y - it.y);
      if (d < bestDist) {
        bestDist = d;
        this.nearestInteractable = it;
        if (it.requiresFlag && !this.state.hasFlag(it.requiresFlag)) {
          this.interactHint = "Objetivo incompleto";
        } else if (it.type === "cell") {
          this.interactHint = it.label;
        } else {
          this.interactHint = `[E] ${it.label}`;
        }
      }
    }
  }

  _collides(x, y, r) {
    for (const w of this.walls) {
      if (x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h) return true;
    }
    return false;
  }

  _updateSentinel(s, dt) {
    if (s.state === "alert") return;
    const wp = s.waypoints[s.wpIndex];
    const dx = wp.x - s.x;
    const dy = wp.y - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      s.wpIndex = (s.wpIndex + 1) % s.waypoints.length;
    } else {
      s.x += (dx / dist) * s.speed * dt;
      s.y += (dy / dist) * s.speed * dt;
      s.angle = Math.atan2(dy, dx);
    }
  }

  _sentinelSees(s, p) {
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist > s.visionDist) return false;
    const angleTo = Math.atan2(dy, dx);
    let diff = angleTo - s.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > s.visionAngle / 2) return false;
    const steps = 10;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this._collides(s.x + dx * t, s.y + dy * t, 2)) return false;
    }
    return true;
  }

  // ——— Render ———
  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    try {
      if (this.state.gamePhase === "menu") {
        this._renderMenu(ctx, W, H);
        return;
      }
      if (this.state.gamePhase === "final") {
        this._renderFinal(ctx, W, H);
        return;
      }
      if (this.state.gamePhase === "pause") {
        this._renderWorld(ctx, W, H);
        this._renderHUD(ctx, W, H);
        this._renderPause(ctx, W, H);
        if (this.showHelp) this._renderHelp(ctx, W, H);
        return;
      }
      if (this.state.gamePhase === "capture") {
        this._renderWorld(ctx, W, H);
        this._renderCapture(ctx, W, H);
        return;
      }

      this._renderWorld(ctx, W, H);
      this._renderHUD(ctx, W, H);
      if (this.state.inDialogue) this._renderDialogue(ctx, W, H);
      if (this.showHelp) this._renderHelp(ctx, W, H);
      if (this.showFps) {
        ctx.fillStyle = COLORS.cyan;
        ctx.font = "13px monospace";
        ctx.fillText(`FPS ${this.fps}`, 12, H - 12);
      }
    } catch (err) {
      console.error("Render error:", err);
      ctx.fillStyle = COLORS.red;
      ctx.font = "16px sans-serif";
      ctx.fillText("Error de renderizado. Revisa la consola.", 20, 40);
    }
  }

  _worldToScreen(wx, wy) {
    const scale =
      Math.min(this.canvas.width / this.sectorBounds.w, this.canvas.height / this.sectorBounds.h) *
      0.9;
    const ox = (this.canvas.width - this.sectorBounds.w * scale) / 2;
    const oy = (this.canvas.height - this.sectorBounds.h * scale) / 2;
    return { x: ox + wx * scale, y: oy + wy * scale, scale };
  }

  _renderWorld(ctx, W, H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, "#0d1528");
    g.addColorStop(1, "#050810");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const s0 = this._worldToScreen(0, 0);
    const scale = s0.scale;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.sectorBounds.w; x += 40) {
      const a = this._worldToScreen(x, 0);
      const b = this._worldToScreen(x, this.sectorBounds.h);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let y = 0; y <= this.sectorBounds.h; y += 40) {
      const a = this._worldToScreen(0, y);
      const b = this._worldToScreen(this.sectorBounds.w, y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const w of this.walls) {
      const p = this._worldToScreen(w.x, w.y);
      ctx.fillStyle = "#152238";
      ctx.strokeStyle = COLORS.cyanDim;
      ctx.lineWidth = 1.5;
      ctx.fillRect(p.x, p.y, w.w * scale, w.h * scale);
      ctx.strokeRect(p.x, p.y, w.w * scale, w.h * scale);
    }

    for (const h of this.hides) {
      const p = this._worldToScreen(h.x, h.y);
      const alpha = 0.2 + Math.sin(this.pulse * 2) * 0.05;
      ctx.fillStyle = `rgba(0, 180, 80, ${alpha})`;
      ctx.strokeStyle = COLORS.green;
      ctx.lineWidth = 2;
      ctx.fillRect(p.x, p.y, h.w * scale, h.h * scale);
      ctx.strokeRect(p.x, p.y, h.w * scale, h.h * scale);
      ctx.fillStyle = COLORS.green;
      ctx.font = `${Math.max(10, 11 * scale)}px sans-serif`;
      ctx.fillText(h.label, p.x + 6, p.y + 16 * scale);
    }

    for (const it of this.interactables) {
      const p = this._worldToScreen(it.x, it.y);
      const r = it.r * scale;
      const near = this.nearestInteractable === it;

      if (it.type === "npc" || it.type === "bios") {
        ctx.fillStyle = it.type === "bios" ? COLORS.violet : COLORS.cyan;
        if (near) {
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 16;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = COLORS.white;
        ctx.font = `bold ${Math.max(10, 11 * scale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(it.type === "bios" ? "BIOS" : "NPC", p.x, p.y + r + 14);
        ctx.textAlign = "left";
      } else if (it.type === "file") {
        ctx.fillStyle = COLORS.orange;
        if (near) {
          ctx.shadowColor = COLORS.orange;
          ctx.shadowBlur = 12;
        }
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = COLORS.white;
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.fillStyle = COLORS.white;
        ctx.font = `${Math.max(9, 9 * scale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("¿ELIMINADO?", p.x, p.y + r + 12);
        ctx.textAlign = "left";
      } else if (it.type === "cell") {
        ctx.fillStyle = it.color || COLORS.green;
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = COLORS.white;
        ctx.font = `${Math.max(8, 8 * scale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("CELDA", p.x, p.y + r + 11);
        ctx.textAlign = "left";
      } else if (it.type === "firmware") {
        ctx.fillStyle = COLORS.violet;
        if (near) {
          ctx.shadowColor = COLORS.violet;
          ctx.shadowBlur = 14;
        }
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.fillStyle = COLORS.white;
        ctx.font = `bold ${Math.max(10, 10 * scale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("FW", p.x, p.y + 4);
        ctx.font = `${Math.max(8, 8 * scale)}px sans-serif`;
        ctx.fillText("firmware", p.x, p.y + r + 12);
        ctx.textAlign = "left";
      } else if (it.type === "exit") {
        const locked = it.requiresFlag && !this.state.hasFlag(it.requiresFlag);
        ctx.strokeStyle = locked ? COLORS.dim : COLORS.cyan;
        ctx.lineWidth = 3;
        ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
        if (!locked) {
          ctx.fillStyle = "rgba(0, 229, 255, 0.15)";
          ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        }
        ctx.fillStyle = locked ? COLORS.dim : COLORS.cyan;
        ctx.font = `bold ${Math.max(14, 16 * scale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(locked ? "✕" : "→", p.x, p.y + 6);
        ctx.font = `${Math.max(9, 9 * scale)}px sans-serif`;
        ctx.fillText(locked ? "bloqueada" : "salida", p.x, p.y + r + 12);
        ctx.textAlign = "left";
      }
    }

    for (const s of this.sentinels) {
      const p = this._worldToScreen(s.x, s.y);
      const r = s.r * scale;
      ctx.fillStyle =
        s.state === "alert" ? "rgba(255, 40, 60, 0.22)" : "rgba(255, 80, 40, 0.12)";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(
        p.x,
        p.y,
        s.visionDist * scale,
        s.angle - s.visionAngle / 2,
        s.angle + s.visionAngle / 2
      );
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = s.state === "alert" ? COLORS.red : COLORS.orange;
      if (s.state === "alert") {
        ctx.shadowColor = COLORS.red;
        ctx.shadowBlur = 10;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Player
    const pp = this._worldToScreen(this.state.player.x, this.state.player.y);
    const pr = this.state.player.radius * scale;
    const hidden = this.state.player.hidden;
    ctx.fillStyle = hidden ? "rgba(0, 229, 255, 0.35)" : COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = hidden ? 6 : 14;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.bg;
    ctx.font = `bold ${Math.max(9, 10 * scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("DON", pp.x, pp.y + 4);
    ctx.textAlign = "left";

    // Hide progress ring
    if (hidden && this.state.player.hideTimer > 0) {
      const hideDur = (this.config.threat && this.config.threat.hideDuration) || 10;
      const pct = Math.min(1, this.state.player.hideTimer / hideDur);
      ctx.strokeStyle = COLORS.green;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, pr + 8, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      ctx.stroke();
    }

    // Vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.9);
    vig.addColorStop(0, "transparent");
    vig.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Threat pulse overlay
    if (this.state.threat > 70) {
      const a = ((this.state.threat - 70) / 30) * 0.25 * (0.7 + Math.sin(this.pulse * 6) * 0.3);
      ctx.fillStyle = `rgba(255, 30, 40, ${a})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  _renderHUD(ctx, W, H) {
    const barW = 200,
      barH = 12;
    const bx = W - barW - 28,
      by = 24;
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.panelBorder;
    ctx.lineWidth = 1;
    ctx.fillRect(bx - 10, by - 10, barW + 20, 52);
    ctx.strokeRect(bx - 10, by - 10, barW + 20, 52);
    ctx.fillStyle = COLORS.white;
    ctx.font = "11px sans-serif";
    ctx.fillText("AMENAZA", bx, by + 2);
    ctx.fillStyle = "#121a28";
    ctx.fillRect(bx, by + 10, barW, barH);
    const threatPct = this.state.threat / 100;
    ctx.fillStyle =
      threatPct > 0.7 ? COLORS.red : threatPct > 0.4 ? COLORS.orange : COLORS.cyan;
    ctx.fillRect(bx, by + 10, barW * threatPct, barH);
    if (this.state.player.hidden) {
      ctx.fillStyle = COLORS.green;
      ctx.font = "10px sans-serif";
      ctx.fillText("OCULTO", bx, by + 36);
    }

    const panelW = Math.min(440, W * 0.48);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(16, 16, panelW, 58);
    ctx.strokeStyle = COLORS.panelBorder;
    ctx.strokeRect(16, 16, panelW, 58);
    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`SECTOR ${this.state.sector}`, 28, 36);
    ctx.fillStyle = COLORS.white;
    ctx.font = "12px sans-serif";
    ctx.fillText(this.state.objective, 28, 56);

    if (this.interactHint && !this.state.inDialogue) {
      ctx.font = "14px sans-serif";
      const tw = ctx.measureText(this.interactHint).width + 28;
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(W / 2 - tw / 2, H - 52, tw, 34);
      ctx.strokeStyle = COLORS.cyan;
      ctx.strokeRect(W / 2 - tw / 2, H - 52, tw, 34);
      ctx.fillStyle = COLORS.cyan;
      ctx.textAlign = "center";
      ctx.fillText(this.interactHint, W / 2, H - 30);
      ctx.textAlign = "left";
    }

    // Botón AYUDA (esquina inferior derecha)
    const btnW = 100;
    const btnH = 36;
    const btnX = W - btnW - 20;
    const btnY = H - btnH - 20;
    this.helpButton = { x: btnX, y: btnY, w: btnW, h: btnH };
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("?  AYUDA", btnX + btnW / 2, btnY + 24);
    ctx.textAlign = "left";
  }

  _renderHelp(ctx, W, H) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(640, W - 24);
    const ph = Math.min(520, H - 24);
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2;
    this._drawPanel(ctx, px, py, pw, ph);

    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("AYUDA · CONTROLES", W / 2, py + 36);

    // —— Teclado gráfico ——
    const keyW = 42;
    const keyH = 42;
    const gap = 6;
    const kbLeft = W / 2 - (7 * (keyW + gap)) / 2;
    const kbTop = py + 58;

    const drawKey = (x, y, label, sub, active) => {
      ctx.fillStyle = active ? "rgba(0, 229, 255, 0.28)" : "rgba(20, 35, 55, 0.95)";
      ctx.strokeStyle = active ? COLORS.cyan : COLORS.cyanDim;
      ctx.lineWidth = active ? 2.5 : 1.5;
      ctx.beginPath();
      // rounded rect
      const r = 6;
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + keyW, y, x + keyW, y + keyH, r);
      ctx.arcTo(x + keyW, y + keyH, x, y + keyH, r);
      ctx.arcTo(x, y + keyH, x, y, r);
      ctx.arcTo(x, y, x + keyW, y, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? COLORS.cyan : COLORS.white;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, x + keyW / 2, y + (sub ? 18 : 26));
      if (sub) {
        ctx.fillStyle = COLORS.dim;
        ctx.font = "9px sans-serif";
        ctx.fillText(sub, x + keyW / 2, y + 34);
      }
    };

    const drawWideKey = (x, y, w, label, sub, active) => {
      ctx.fillStyle = active ? "rgba(0, 229, 255, 0.28)" : "rgba(20, 35, 55, 0.95)";
      ctx.strokeStyle = active ? COLORS.cyan : COLORS.cyanDim;
      ctx.lineWidth = active ? 2.5 : 1.5;
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + keyH, r);
      ctx.arcTo(x + w, y + keyH, x, y + keyH, r);
      ctx.arcTo(x, y + keyH, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? COLORS.cyan : COLORS.white;
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, x + w / 2, y + (sub ? 18 : 26));
      if (sub) {
        ctx.fillStyle = COLORS.dim;
        ctx.font = "9px sans-serif";
        ctx.fillText(sub, x + w / 2, y + 34);
      }
    };

    // Fila WASD (movimiento)
    const row1Y = kbTop;
    drawKey(kbLeft + (keyW + gap), row1Y, "W", "↑", true);
    const row2Y = kbTop + keyH + gap;
    drawKey(kbLeft, row2Y, "A", "←", true);
    drawKey(kbLeft + (keyW + gap), row2Y, "S", "↓", true);
    drawKey(kbLeft + 2 * (keyW + gap), row2Y, "D", "→", true);

    // Etiqueta movimiento
    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("MOVER", kbLeft, row1Y - 8);

    // Shift (correr) a la izquierda abajo
    const row3Y = row2Y + keyH + gap + 8;
    drawWideKey(kbLeft - 20, row3Y, keyW * 2 + gap + 20, "SHIFT", "Correr", true);

    // E interactuar
    drawKey(kbLeft + 3 * (keyW + gap) + 10, row2Y, "E", "Acción", true);
    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("INTERACTUAR", kbLeft + 3 * (keyW + gap) + 10, row1Y - 8);

    // 1 2 3 diálogo
    const numX = kbLeft + 5 * (keyW + gap);
    drawKey(numX, row1Y, "1", "Opción", true);
    drawKey(numX + keyW + gap, row1Y, "2", "Opción", true);
    drawKey(numX + 2 * (keyW + gap), row1Y, "3", "Opción", true);
    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("DIÁLOGO", numX, row1Y - 8);

    // Espacio continuar
    drawWideKey(kbLeft + 2 * (keyW + gap), row3Y, keyW * 4 + gap * 3, "ESPACIO", "Continuar texto", true);

    // Esc / H
    const row4Y = row3Y + keyH + gap + 10;
    drawWideKey(kbLeft - 20, row4Y, keyW * 1.6, "ESC", "Pausa", true);
    drawKey(kbLeft + keyW * 1.6 + gap, row4Y, "H", "Ayuda", true);
    drawKey(kbLeft + keyW * 1.6 + gap + keyW + gap, row4Y, "F1", "Ayuda", true);
    drawKey(kbLeft + keyW * 1.6 + gap + 2 * (keyW + gap), row4Y, "F3", "FPS", false);

    // Consejos
    const tipY = row4Y + keyH + 28;
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.white;
    ctx.font = "13px sans-serif";
    const tips = [
      "Zonas verdes = ESCONDER (10 s → reduce amenaza a la mitad)",
      "Centinelas naranjas: evita el cono rojo de visión",
      "Las salidas se desbloquean al completar el objetivo del sector"
    ];
    tips.forEach((t, i) => {
      ctx.fillStyle = i === 0 ? COLORS.green : i === 1 ? COLORS.orange : COLORS.cyanDim;
      ctx.fillText(t, W / 2, tipY + i * 20);
    });

    ctx.fillStyle = COLORS.cyan;
    ctx.font = "13px sans-serif";
    ctx.fillText("[ Clic · Espacio · Esc ] Cerrar ayuda", W / 2, py + ph - 22);
    ctx.textAlign = "left";
  }

  _renderDialogue(ctx, W, H) {
    const node = this.dialogue.getCurrent();
    if (!node) return;
    const hasOpts = this.dialogue.hasOptions();
    const boxH = hasOpts ? 210 : 130;
    const boxY = H - boxH - 20;
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.panelBorder;
    ctx.lineWidth = 2;
    ctx.fillRect(20, boxY, W - 40, boxH);
    ctx.strokeRect(20, boxY, W - 40, boxH);

    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(SPEAKERS[node.speaker] || node.speaker, 36, boxY + 28);

    ctx.fillStyle = COLORS.white;
    ctx.font = "15px sans-serif";
    this._wrapText(ctx, node.text, 36, boxY + 54, W - 80, 22);

    if (hasOpts) {
      node.options.forEach((opt, i) => {
        const oy = boxY + 105 + i * 34;
        ctx.fillStyle = "rgba(0, 229, 255, 0.1)";
        ctx.fillRect(36, oy - 6, W - 90, 30);
        ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
        ctx.strokeRect(36, oy - 6, W - 90, 30);
        ctx.fillStyle = COLORS.cyan;
        ctx.font = "14px sans-serif";
        ctx.fillText(`${i + 1}. ${opt.text}`, 48, oy + 14);
      });
    } else {
      ctx.fillStyle = COLORS.cyanDim;
      ctx.font = "12px sans-serif";
      ctx.fillText("[Espacio / Enter] Continuar", 36, boxY + boxH - 18);
    }
  }

  _wrapText(ctx, text, x, y, maxW, lineH) {
    const words = String(text).split(" ");
    let line = "";
    let cy = y;
    for (const w of words) {
      const test = line + w + " ";
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, cy);
        line = w + " ";
        cy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  }

  _renderMenu(ctx, W, H) {
    // Background grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    if (this.menuScreen === "controls") {
      this._drawPanel(ctx, W / 2 - 280, H / 2 - 200, 560, 400);
      ctx.fillStyle = COLORS.cyan;
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CONTROLES", W / 2, H / 2 - 160);
      ctx.fillStyle = COLORS.white;
      ctx.font = "15px sans-serif";
      const lines = [
        "W A S D / Flechas — Mover",
        "Shift — Correr",
        "E — Interactuar",
        "1 / 2 / 3 o clic — Elegir diálogo",
        "Espacio / Enter — Continuar texto",
        "Esc — Pausa (árbol y cadena)",
        "H / F1 o botón AYUDA — Controles en juego",
        "F3 — Mostrar FPS",
        "",
        "Zonas verdes = esconderse (10 s → amenaza ×0.5)",
        "Centinelas: evita su cono de visión",
        "",
        "[Esc o clic] Volver"
      ];
      lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 120 + i * 24));
      ctx.textAlign = "left";
      return;
    }

    if (this.menuScreen === "credits") {
      this._drawPanel(ctx, W / 2 - 280, H / 2 - 180, 560, 360);
      ctx.fillStyle = COLORS.cyan;
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CRÉDITOS", W / 2, H / 2 - 140);
      ctx.fillStyle = COLORS.white;
      ctx.font = "14px sans-serif";
      [
        "Demo educativa · ArcasShred Pro",
        "Gráficos procedurales (Canvas 2D)",
        "Cadena de rastro: Web Crypto SHA-256",
        "Inspiración UI: Detroit Become Human",
        "Título de trabajo interno — sin afiliación",
        "con franquicias de terceros.",
        "",
        "Ver CREDITS.md en el paquete.",
        "",
        "[Esc o clic] Volver"
      ].forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 100 + i * 22));
      ctx.textAlign = "left";
      return;
    }

    // Main menu
    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 24;
    ctx.fillText(this.config.title || "OpenCulin", W / 2, H * 0.28);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.white;
    ctx.font = "17px sans-serif";
    ctx.fillText(this.config.subtitle || "Demo educativa", W / 2, H * 0.28 + 36);

    ctx.fillStyle = COLORS.cyanDim;
    ctx.font = "13px sans-serif";
    ctx.fillText("Aventura narrativa · 10–15 min · Tres finales", W / 2, H * 0.42);

    const items = [
      { key: "1", label: "JUGAR" },
      { key: "2", label: "CONTROLES" },
      { key: "3", label: "CRÉDITOS" }
    ];
    items.forEach((it, i) => {
      const y = H * 0.52 + i * 42;
      ctx.fillStyle = i === 0 ? COLORS.cyan : COLORS.white;
      ctx.font = i === 0 ? "bold 20px sans-serif" : "18px sans-serif";
      ctx.fillText(`[ ${it.key} ]  ${it.label}`, W / 2, y);
    });

    ctx.fillStyle = COLORS.dim;
    ctx.font = "12px sans-serif";
    ctx.fillText("Pieza educativa y de marketing de ArcasShred Pro", W / 2, H * 0.88);
    ctx.textAlign = "left";
  }

  _drawPanel(ctx, x, y, w, h) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.panelBorder;
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  _renderPause(ctx, W, H) {
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(0, 0, W, H);
    const pw = 460,
      ph = 400;
    const px = W / 2 - pw / 2,
      py = H / 2 - ph / 2;
    this._drawPanel(ctx, px, py, pw, ph);

    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PAUSA", W / 2, py + 40);

    ctx.fillStyle = COLORS.white;
    ctx.font = "14px sans-serif";
    ctx.fillText("Esc — Reanudar", W / 2, py + 72);
    ctx.fillText(
      `Confianza aliados: ${this.state.getAllyTrust()}  ·  Atajo: ${
        this.state.shortcutUnlocked ? "SÍ" : "no (≥70)"
      }`,
      W / 2,
      py + 100
    );

    ctx.fillStyle = COLORS.cyan;
    ctx.font = "13px sans-serif";
    ctx.fillText("Árbol de decisiones", W / 2, py + 140);
    ctx.fillStyle = COLORS.white;
    ctx.font = "12px monospace";
    const tree = this.state.getDecisionTreeDisplay();
    if (tree.length === 0) ctx.fillText("(ninguna aún)", W / 2, py + 165);
    else tree.forEach((line, i) => ctx.fillText(line, W / 2, py + 165 + i * 18));

    ctx.fillStyle = COLORS.cyan;
    ctx.font = "13px sans-serif";
    ctx.fillText("Cadena de rastro", W / 2, py + 260);
    ctx.fillStyle = COLORS.white;
    ctx.font = "11px monospace";
    const blocks = this.chain.getDisplay();
    blocks.slice(-5).forEach((b, i) => {
      ctx.fillText(`#${b.index} ${b.decision}/${b.option} ${b.hash}`, W / 2, py + 282 + i * 16);
    });
    ctx.textAlign = "left";
  }

  _renderCapture(ctx, W, H) {
    ctx.fillStyle = "rgba(50, 0, 12, 0.78)";
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(255, 30, 60, ${0.08 + Math.random() * 0.18})`;
      ctx.fillRect(0, Math.random() * H, W, 2 + Math.random() * 5);
    }
    ctx.fillStyle = COLORS.red;
    ctx.font = "bold 38px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CAPTURADO", W / 2, H / 2 - 24);
    ctx.fillStyle = COLORS.white;
    ctx.font = "16px sans-serif";
    ctx.fillText("Reapareces en el checkpoint. Decisiones y cadena conservadas.", W / 2, H / 2 + 18);
    ctx.fillStyle = COLORS.cyan;
    ctx.font = "14px sans-serif";
    ctx.fillText("[Espacio / clic] Continuar", W / 2, H / 2 + 56);
    ctx.textAlign = "left";
  }

  _renderFinal(ctx, W, H) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const cert = this.certificate || buildCertificate(this.state, this.chain);
    const edu = this.dialogue.getEducational() || {};

    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FINAL · " + cert.title, W / 2, 70);

    ctx.fillStyle = COLORS.white;
    ctx.font = "15px sans-serif";
    this._wrapText(ctx, cert.educational || "", W / 2 - 300, 110, 600, 22);

    this._drawPanel(ctx, W / 2 - 310, 170, 620, 210);
    ctx.fillStyle = COLORS.cyan;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("CERTIFICADO DE DECISIONES", W / 2, 200);
    ctx.fillStyle = COLORS.white;
    ctx.font = "13px monospace";
    (cert.decisions || []).forEach((d, i) => {
      ctx.fillText(d, W / 2, 230 + i * 20);
    });
    ctx.fillStyle = COLORS.cyanDim;
    ctx.font = "12px monospace";
    const y0 = 230 + (cert.decisions || []).length * 20 + 12;
    ctx.fillText(`Hash final: ${(cert.finalHash || "").slice(0, 40)}…`, W / 2, y0);
    ctx.fillText(`Bloques en cadena: ${cert.chainLength || 0}`, W / 2, y0 + 20);

    const bw = 340,
      bh = 50;
    const bx = W / 2 - bw / 2;
    const by = H - 150;
    ctx.fillStyle = COLORS.orange;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = "#0a0e17";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(edu.cta_final || "Conocer ArcasShred Pro", W / 2, by + 32);

    ctx.fillStyle = COLORS.cyan;
    ctx.font = "14px sans-serif";
    ctx.fillText("[C / Enter] Abrir enlace   ·   [R] Reiniciar", W / 2, H - 70);
    ctx.textAlign = "left";
  }

  _log(event) {
    if (!(this.config.diagnostics && this.config.diagnostics.logEvents)) return;
    const entry = { t: new Date().toISOString(), event, sector: this.state.sector };
    this.events.push(entry);
    try {
      const prev = JSON.parse(localStorage.getItem("openculin_events") || "[]");
      prev.push(entry);
      localStorage.setItem("openculin_events", JSON.stringify(prev.slice(-200)));
    } catch (_) {}
  }

  loop(ts) {
    const dt = Math.min(0.05, (ts - this.lastTime) / 1000 || 0);
    this.lastTime = ts;
    this.fpsAcc += dt;
    this.fpsCount++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsCount / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsCount = 0;
    }
    this.update(dt);
    this.render();
    requestAnimationFrame(t => this.loop(t));
  }
}
