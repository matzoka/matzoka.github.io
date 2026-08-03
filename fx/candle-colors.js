(() => {
  const replacements = new Map([
    ["#42d392", "#ff315f"],
    ["#ff6b7a", "#25c7e8"]
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
        descriptor.set.call(this, replacements.get(normalized) ?? value);
      }
    });
  }
})();
