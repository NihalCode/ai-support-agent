/** Avoid duplicate investigation when the chat stream already produced output. */
export function shouldFallbackToInvestigate(streamHadProgress: boolean, content: string): boolean {
  return !streamHadProgress && !content.trim();
}
