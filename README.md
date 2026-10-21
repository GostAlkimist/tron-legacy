# OpenCulin: En busca de una nueva realidad

**Demo 2D educativa** (JavaScript + HTML5 Canvas) · Marketing de **ArcasShred Pro**

> Nombre de trabajo interno: "Tron Legacy". El título en pantalla es configurable en `data/config.json` (evitar conflicto de marca).

---

## Requisitos

- Navegador moderno (Chrome, Firefox, Edge, Safari): **ES modules** + **Web Crypto API**
- **Servidor HTTP local** (no uses `file://` — fallará la carga de JSON)

## Ejecución rápida

```bash
# 1. Descomprime el ZIP
# 2. Entra en la carpeta
cd tron-legacy

# 3. Arranca un servidor estático
python -m http.server 8080
# o:  python3 -m http.server 8080
# o:  npx --yes serve -p 8080

# 4. Abre en el navegador
#    http://localhost:8080
```

## Controles

| Entrada | Acción |
|---------|--------|
| **1 / Enter** (menú) | Jugar |
| **2** (menú) | Controles |
| **3** (menú) | Créditos |
| **WASD** / flechas | Mover a Don |
| **Shift** | Correr |
| **E** | Interactuar |
| **1 / 2 / 3** o clic | Elegir opción de diálogo |
| **Espacio / Enter** | Continuar texto |
| **Esc** | Pausa (árbol de decisiones + cadena SHA-256) |
| **F3** | FPS |
| **R** (final) | Reiniciar |
| **C / Enter** (final) | Abrir ArcasShred Pro |

## Flujo de juego

1. **Sector 1 — Entrada** · Tutorial, diálogo con Programadoras (**PD-1**), centinelas, escondites verdes, salida (se desbloquea tras el diálogo).
2. **Sector 2 — Archivos residuales** · Puzzle educativo (índice vs celdas), **PD-2** (sobrescribir vs firmware), mensaje FTL. Salida tras resolver.
3. **Sector 3 — Núcleo BIOS** · Elena + BIOS, **PD-3**, uno de **tres finales** + certificado con hash de cadena + CTA a ArcasShred Pro.

**Atajo Sector 2→3:** si la confianza media de aliados es ≥ 70 (elige bien en PD-1).

## Tesis educativa

1. Borrar suele quitar la **referencia**, no el contenido.
2. En **SSD**, la capa **FTL** puede hacer que sobrescribir no toque las celdas reales.
3. Borrar bien exige **método según el medio** y **evidencia** (cadena de rastro).

## Estructura del paquete

```
tron-legacy/
├── index.html
├── css/style.css
├── js/main.js, game.js, state.js, dialogue.js, chain.js
├── data/config.json, dialogs.json
├── test-logic.html          # pruebas CP de lógica
├── README.md, CREDITS.md, .gitignore
└── assets/                  # vacío (gráficos procedurales)
```

## Pruebas de lógica

Abre `http://localhost:8080/test-logic.html` — debe mostrar todos los casos en **OK** (confianza, amenaza, captura, cadena SHA-256).

## Distribución

1. Comprime la carpeta `tron-legacy` en un ZIP.
2. Envía el ZIP.
3. El receptor descomprime y ejecuta `python -m http.server 8080` dentro de la carpeta.
4. No requiere instalar dependencias npm: solo un servidor estático.

**Checklist de entrega**

- [x] Tres sectores jugables
- [x] Tres puntos de decisión (PD-1, PD-2, PD-3)
- [x] Tres finales + certificado + hash
- [x] Enlace ArcasShred Pro (`window.open`)
- [x] Menú: Jugar / Controles / Créditos
- [x] Pausa con árbol y cadena
- [x] Captura + checkpoint (decisiones conservadas)
- [x] Escondites (10 s → amenaza × 0.5)
- [x] Lógica core sin DOM/Canvas
- [x] README + CREDITS + aviso de marca

## Aviso de marca

"Tron" es franquicia de terceros. Este proyecto usa título de trabajo y título configurable. No incluye assets ni diseños de esa franquicia. Verifica marcas antes de publicar.

## Soporte

Si algo falla: abre la consola del navegador (F12). Errores típicos:

- `Failed to fetch` → no estás usando servidor local.
- Módulos no cargan → navegador muy antiguo o `file://`.
