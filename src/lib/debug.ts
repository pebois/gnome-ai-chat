export function debug(tag: string, msg: string, ...args: unknown[]): void {
  console.log(`[${tag}] ${msg}`, ...args)
}
