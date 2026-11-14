import type { CameraState, ViewName } from "@/lib/datum/types";

type Bridge = {
  getCamera: () => CameraState | null;
  restoreCamera: (camera: CameraState) => void;
  fit: (meshIds?: string[]) => void;
  view: (name: ViewName) => void;
  snapshot: () => string | null;
};

export const bridge: Bridge = {
  getCamera: () => null,
  restoreCamera: () => {},
  fit: () => {},
  view: () => {},
  snapshot: () => null,
};
