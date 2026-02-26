// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debug(tag: string, msg: string, ...args: any[]): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  console.log(`[${tag}] ${msg}`, ...args)
}
