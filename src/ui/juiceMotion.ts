import { BOARD_X, BOARD_Y, CELL, WIDTH, HEIGHT } from "../core";
import type { GridPosition } from "../core";

/** Presentation only: never delays a command or writes game state. */
export class JuiceMotion {
  private readonly animations = new Set<Animation>();
  private readonly flights = new Set<HTMLElement>();
  enabled = true;

  clear(): void {
    for (const animation of this.animations) animation.cancel();
    for (const flight of this.flights) flight.remove();
    this.animations.clear();
    this.flights.clear();
  }

  pulse(element: HTMLElement, complete: boolean): void {
    if (!this.enabled) return;
    for (const animation of element.getAnimations()) animation.cancel();
    this.track(element.animate([
      { transform: "translateY(0) scale(1)" },
      { transform: complete ? "translateY(-9px) scale(1.12, .92)" : "translateY(-2px) scale(1.06, .96)", offset: 0.35 },
      { transform: "translateY(1px) scale(.97, 1.03)", offset: 0.7 },
      { transform: "translateY(0) scale(1)" },
    ], { duration: complete ? 520 : 320, easing: "ease-out" }));
  }

  collect(cells: GridPosition[], bottle: HTMLElement): void {
    if (!this.enabled || cells.length === 0) return;
    const board = document.querySelector<HTMLCanvasElement>("#gameCanvas")?.getBoundingClientRect();
    if (!board) return;
    const center = cells.reduce((sum, cell) => ({ x: sum.x + cell.x / cells.length, y: sum.y + cell.y / cells.length }), { x: 0, y: 0 });
    this.fly(bottle, {
      x: board.left + (BOARD_X + (center.x + 0.5) * CELL) * board.width / WIDTH,
      y: board.top + (BOARD_Y + (center.y + 0.5) * CELL) * board.height / HEIGHT,
    }, bottle);
  }

  toNext(bottle: HTMLElement): void {
    const next = document.querySelector<HTMLCanvasElement>("#nextCanvas");
    if (!this.enabled || !next) return;
    const rect = bottle.getBoundingClientRect();
    this.fly(bottle, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, next);
  }

  private fly(source: HTMLElement, from: { x: number; y: number }, target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    // Do not send decorations toward offscreen HUD on short/mobile viewports.
    if (rect.bottom < 0 || rect.top > innerHeight || from.y < 0 || from.y > innerHeight || this.flights.size >= 6) return;
    const to = { x: rect.left + rect.width / (target.id === "nextCanvas" ? 6 : 2), y: rect.top + rect.height / 2 };
    const flight = source.cloneNode(false) as HTMLElement;
    flight.className = "juice-flight";
    flight.setAttribute("aria-hidden", "true");
    flight.style.left = `${from.x - 16}px`;
    flight.style.top = `${from.y - 16}px`;
    document.body.append(flight);
    this.flights.add(flight);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const animation = flight.animate([
      { transform: "translate(0, 0) scale(.45)", opacity: 0 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 30}px) scale(1)`, opacity: 0.95, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(.55)`, opacity: 0 },
    ], { duration: 600, easing: "cubic-bezier(.22,.65,.35,1)" });
    this.track(animation);
    void animation.finished.catch(() => undefined).then(() => { flight.remove(); this.flights.delete(flight); });
  }

  private track(animation: Animation): void {
    this.animations.add(animation);
    void animation.finished.catch(() => undefined).then(() => this.animations.delete(animation));
  }
}
