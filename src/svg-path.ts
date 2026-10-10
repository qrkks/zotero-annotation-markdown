/** Bounded SVG path validation, including compact coordinates and arc flags. */
const PARAMETERS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

export function validateSvgPath(value: string): void {
  const numberToken = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iy;
  let index = 0;
  let command = "";
  let firstCommand = true;
  skipWhitespace();
  while (index < value.length) {
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(value[index])) {
      command = value[index++].toUpperCase();
      if (firstCommand && command !== "M") invalid();
      firstCommand = false;
      if (command === "Z") {
        command = "";
        skipWhitespace();
        continue;
      }
    } else if (!command) {
      invalid();
    }

    let groups = 0;
    do {
      for (let parameter = 0; parameter < PARAMETERS[command]; parameter++) {
        const arc = command === "A";
        const number = readNumber(groups > 0 || parameter > 0, arc && (parameter === 3 || parameter === 4), arc && parameter === 3);
        if (arc && parameter < 2 && number < 0) invalid();
      }
      groups++;
      skipWhitespace();
    } while (index < value.length && !/[MmLlHhVvCcSsQqTtAaZz]/.test(value[index]));
  }

  function skipWhitespace(): void {
    while (index < value.length && /[\t\n\f\r ]/.test(value[index])) index++;
  }
  function readNumber(allowComma: boolean, flag: boolean, requireSeparator: boolean): number {
    const start = index;
    skipWhitespace();
    let separated = index > start;
    if (value[index] === ",") {
      if (!allowComma) invalid();
      index++;
      skipWhitespace();
      separated = true;
    }
    if (requireSeparator && !separated) invalid();
    if (flag) {
      if (value[index] !== "0" && value[index] !== "1") invalid();
      return Number(value[index++]);
    }
    numberToken.lastIndex = index;
    const match = numberToken.exec(value);
    if (!match) invalid();
    index = numberToken.lastIndex;
    const number = Number(match![0]);
    if (!Number.isFinite(number) || Math.abs(number) > 100000) invalid();
    return number;
  }
  function invalid(): never { throw new Error("Unsupported or malformed SVG path."); }
}
