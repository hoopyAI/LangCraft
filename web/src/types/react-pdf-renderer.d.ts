declare module '@react-pdf/renderer' {
  import * as React from 'react';

  type Style = Record<string, unknown>;
  type StyleProp = Style | Style[];

  export const Document: React.FC<{ children?: React.ReactNode; title?: string; author?: string; style?: StyleProp } & Record<string, unknown>>;
  export const Page: React.FC<{ children?: React.ReactNode; style?: StyleProp; size?: string; wrap?: boolean } & Record<string, unknown>>;
  export const Text: React.FC<{ children?: React.ReactNode; style?: StyleProp } & Record<string, unknown>>;
  export const View: React.FC<{ children?: React.ReactNode; style?: StyleProp; wrap?: boolean } & Record<string, unknown>>;

  export const StyleSheet: {
    create<T extends Record<string, Style>>(styles: T): T;
  };

  export const Font: {
    register(config: {
      family: string;
      src?: string;
      fontWeight?: string | number;
      fontStyle?: string;
      fonts?: Array<{
        src: string;
        fontWeight?: string | number;
        fontStyle?: string;
      }>;
      fallback?: boolean;
    }): void;
    registerHyphenationCallback(callback: (word: string) => string[]): void;
  };

  export const pdf: (
    element: React.ReactElement,
  ) => {
    toBlob(): Promise<Blob>;
    toString(): Promise<string>;
    toArrayBuffer(): Promise<ArrayBuffer>;
  };
}
