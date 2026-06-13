export class SendCancelledError extends Error {
  constructor(message = "Send cancelled") {
    super(message);
    this.name = "SendCancelledError";
  }
}

export function isSendCancelledError(err: unknown): boolean {
  return err instanceof SendCancelledError;
}
