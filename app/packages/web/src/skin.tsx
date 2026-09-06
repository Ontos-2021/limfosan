import { createContext, useContext, type ReactNode } from 'react';

/** Barajas disponibles: clásica (PNG heredados) y propia (SVG original). */
export type Skin = 'png' | 'svg';

export const SKIN_STORAGE_KEY = 'mesa-skin';

const SkinContext = createContext<Skin>('png');

export function SkinProvider({
  value,
  children,
}: {
  value: Skin;
  children: ReactNode;
}) {
  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin(): Skin {
  return useContext(SkinContext);
}
