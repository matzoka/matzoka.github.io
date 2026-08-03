(() => {
  const FIVE_MINUTES = 5 * 60 * 1000;
  const retiredFeed = "api.github.com/repos/matzoka/matzoka.github.io/issues/1";
  const nativeFetch = window.fetch.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);

  // 廃止したGitHub公開フィードへは接続しない。
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes(retiredFeed)) {
      return Promise.reject(new Error("GitHub予備フィードは廃止済みです"));
    }
    return nativeFetch(input, init);
  };

  // 旧app.jsが登録するGitHubフィード用の定期処理だけを無効化する。
  window.setInterval = (callback, delay, ...args) => {
    if (callback?.name === "periodic") return 0;
    return nativeSetInterval(callback, delay, ...args);
  };

  function refreshDirectly() {
    const button = document.getElementById("refreshButton");
    if (!button || button.disabled) return;
    button.click();
  }

  // ページを開いた直後に、ボタン操作と同じ直接取得を実行する。
  setTimeout(refreshDirectly, 0);

  // ページを開いている間は、5分ごとに直接取得する。
  nativeSetInterval(refreshDirectly, FIVE_MINUTES);

  // タブへ戻ったときも直ちに最新化する。
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshDirectly();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refreshDirectly();
  });
})();
