import type { VoiceProvider } from "./types";
import { genericProvider } from "./providers/generic";

const registry: Record<string, VoiceProvider> = { [genericProvider.id]: genericProvider };
export const getProvider = (id: string) => registry[id] ?? null;
