export type VoiceEvent = { type: "start" | "turn" | "end"; callId: string; text?: string; from?: string };

/** Implement this interface to add a telephony/voice provider. Nothing else in the app changes. */
export interface VoiceProvider {
  id: string;
  verify(rawBody: string, headers: Headers, secret: string): boolean;
  parse(rawBody: string): VoiceEvent;
  formatReply(reply: string): unknown;
}
