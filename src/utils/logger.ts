/** Prosty logger konsolowy - bez zależności zewnętrznych. */

const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR;

const paint = (code: string, text: string) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);

export const log = {
  info: (msg: string) => console.log(paint("36", "[info]"), msg),
  ok: (msg: string) => console.log(paint("32", "[ ok ]"), msg),
  warn: (msg: string) => console.log(paint("33", "[warn]"), msg),
  error: (msg: string) => console.log(paint("31", "[fail]"), msg),
  step: (msg: string) => console.log(paint("35", "[step]"), msg),
  raw: (msg: string) => console.log(msg),
};
