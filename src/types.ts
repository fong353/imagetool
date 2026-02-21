// src/types.ts

export type ProcessMode = "crop" | "pad";

export interface ImageItem {
  path: string;
  url: string;
  name: string;
  selected: boolean;
  size: string;
  isSupported: boolean;
}