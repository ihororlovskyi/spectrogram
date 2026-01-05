declare module 'colormap' {
  interface ColormapOptions {
    colormap?: string;
    nshades?: number;
    format?: 'hex' | 'rgb' | 'rgba' | 'rgbaString';
    alpha?: number | number[];
  }

  type ColorArray = [number, number, number, number];

  function colormap(options: ColormapOptions): ColorArray[];

  export = colormap;
}
