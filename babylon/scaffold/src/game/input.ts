// Minimal keyboard input helper. Tracks held keys so gameplay code can poll
// state inside update(dt) rather than wiring its own listeners. Extend with
// pointer/gamepad handling per game.
export class Input {
  private held = new Set<string>();

  constructor(target: HTMLElement | Window = window) {
    target.addEventListener("keydown", this.onDown as EventListener);
    target.addEventListener("keyup", this.onUp as EventListener);
    this.target = target;
  }

  private target: HTMLElement | Window;

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** -1 / 0 / +1 along an axis defined by two key codes. */
  axis(negCode: string, posCode: string): number {
    return (this.isDown(posCode) ? 1 : 0) - (this.isDown(negCode) ? 1 : 0);
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onDown as EventListener);
    this.target.removeEventListener("keyup", this.onUp as EventListener);
    this.held.clear();
  }

  private onDown = (e: KeyboardEvent): void => {
    this.held.add(e.code);
  };

  private onUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };
}
