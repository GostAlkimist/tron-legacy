/**
 * Punto de entrada — carga config + dialogs y arranca el juego.
 */

import { Game } from "./game.js";

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}: ${res.status}`);
  return res.json();
}

async function main() {
  const canvas = document.getElementById("game");
  if (!canvas) {
    document.body.innerHTML = "<p style='color:#0ff;font-family:sans-serif'>Error: canvas #game no encontrado.</p>";
    return;
  }

  let config;
  try {
    config = await loadJSON("data/config.json");
  } catch (e) {
    console.warn("config.json no disponible, usando valores por defecto", e);
    config = {
      title: "OpenCulin: En busca de una nueva realidad",
      subtitle: "Demo educativa · ArcasShred Pro",
      arcasShredUrl: "https://www.arcasshred.com",
      interactionRadius: 3,
      trust: { min: 0, max: 100, initial: 50, allyThreshold: 70 },
      threat: { increasePerSecond: 20, decayPerSecond: 5, hideDuration: 10, hideMultiplier: 0.5, pd1IgnoreMultiplier: 1.25 },
      player: { walkSpeed: 120, runSpeed: 220, radius: 12 },
      diagnostics: { showFps: false, logEvents: true }
    };
  }

  document.title = config.title || "OpenCulin";

  let dialogs;
  try {
    dialogs = await loadJSON("data/dialogs.json");
  } catch (e) {
    console.error("dialogs.json obligatorio", e);
    document.body.innerHTML = `<p style="color:#f44;font-family:sans-serif;padding:2rem">Error cargando data/dialogs.json. Ejecuta con un servidor local (python -m http.server).</p>`;
    return;
  }

  const game = new Game(canvas, config);
  await game.init(dialogs);
  requestAnimationFrame(t => game.loop(t));
}

main().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f44;padding:1rem">${err.message}\n${err.stack}</pre>`;
});
