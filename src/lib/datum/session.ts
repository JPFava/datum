import type { StepSupplement } from "@/lib/datum/stepSupplement";
import type { Geometry } from "@/lib/datum/types";

export const session: {
  buffer: ArrayBuffer | null;
  geometry: Geometry | null;
  supplement: StepSupplement | null;
} = {
  buffer: null,
  geometry: null,
  supplement: null,
};
