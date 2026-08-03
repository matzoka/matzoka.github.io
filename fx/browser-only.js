(() => {
  const FIVE_MINUTES = 5 * 60 * 1000;
  const retiredFeed = "api.github.com/repos/matzoka/matzoka.github.io/issues/1";
  const nativeFetch = window.fetch.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);

  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes(retiredFeed)) return Promise.reject(new Error("GitHub予備フィードは廃止済みです"));
    return nativeFetch(input, init);
  };

  window.setInterval = (callback, delay, ...args) => {
    if (callback?.name === "periodic") return 0;
    return nativeSetInterval(callback, delay, ...args);
  };

  function refreshDirectly() {
    const button = document.getElementById("refreshButton");
    if (!button || button.disabled) return;
    button.click();
  }

  setTimeout(refreshDirectly, 0);
  nativeSetInterval(refreshDirectly, FIVE_MINUTES);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshDirectly();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refreshDirectly();
  });
})();
