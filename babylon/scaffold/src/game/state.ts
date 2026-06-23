// Game state contract. The render loop in BabylonApp calls `update(dt)` each
// frame, where dt is seconds since the last frame. Keep mutable gameplay state
// on the object the scene returns; replace/extend this shape per game.
export interface GameState {
  update?: (dt: number) => void;
}
