/** Deep‑freeze a value so it can be used as a key in Maps/Sets */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.getOwnPropertyNames(value).forEach((prop) => {
      // @ts‑ignore – index access OK
      deepFreeze((value as any)[prop]);
    });
    Object.freeze(value);
  }
  return value;
}