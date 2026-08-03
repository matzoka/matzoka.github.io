(() => {
  const swaps = new Map([
    ["#42d392", "#ff6b7a"],
    ["#ff6b7a", "#42d392"]
  ]);

  for (const property of ["fillStyle", "strokeStyle"]) {
    const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, property);
    if (!descriptor?.get || !descriptor?.set) continue;

    Object.defineProperty(CanvasRenderingContext2D.prototype, property, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        const normalized = typeof value === "string" ? value.toLowerCase() : value;
        descriptor.set.call(this, swaps.get(normalized) ?? value);
      }
    });
  }
})();
