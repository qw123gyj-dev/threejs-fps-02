// The look plan, in one place. Emberline Works at dusk: indigo sky, amber reactor light,
// rusted steel and pale concrete. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#191722',
  surface: '#232030',
  hairline: '#3a3348',
  ink: '#efe9dc',
  muted: '#9a93a8',
  accent: '#ffb02e',
  ember: '#ff5a2e',
  steel: '#5d6b7a',
  floor: '#2a2733',
  siteA: '#ffb02e',
  siteB: '#3ec6ff',
};

export function shade(name) {
  return PALETTE[name];
}
