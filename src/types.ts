// src/types.ts

export type ProcessMode = "crop" | "pad" | "resize" | "border";

export interface ImageItem {
  path: string;
  url: string;
  name: string;
  selected: boolean;
  size: string;
  isSupported: boolean;
  dpi?: number;  // DPI 分辨率
}

export interface ProcessProgress {
  isProcessing: boolean;
  current: number;
  total: number;
  currentName: string;
  statusMessage: string;
}