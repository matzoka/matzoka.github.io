(() => {
  const FIVE_MINUTES = 5 * 60 * 1000;

  // app.js が登録した「GitHub予備フィードの5分間隔」を停止する。
  // 通常時はYahoo Financeへの直接取得だけが5分ごとに動く。
  const marker = setInterval(() => {}, 2147483647);
  clearInterval(marker);
  for (let id = 1; id <= marker; id += 1) clearInterval(id);

  let lastTriggeredAt = 0;
  function refreshDirectly() {
    const button = document.getElementById("refreshButton");
    if (!button || button.disabled) return;

    const now = Date.now();
    if (now - lastTriggeredAt < 1500) return;
    lastTriggeredAt = now;
    button.click();
  }

  // 初回の予備フィード取得が終わった直後に直接取得へ切り替える。
  const status = document.getElementById("status");
  let switched = false;
  let observer = null;

  function switchToLive() {
    if (switched) return;
    switched = true;
    observer?.disconnect();
    refreshDirectly();
  }

  if (status) {
    observer = new MutationObserver(() => {
      const text = status.textContent || "";
      if (text.includes("定期フィード取得完了") || text.includes("取得できませんでした")) {
        switchToLive();
      }
    });
    observer.observe(status, { childList: true, characterData: true, subtree: true });

    if ((status.textContent || "").includes("定期フィード取得完了")) switchToLive();
  }

  // 予備フィードが極端に遅い場合の保険。
  setTimeout(switchToLive, 3000);

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) setTimeout(refreshDirectly, 200);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(refreshDirectly, 200);
  });

  // ページを開いたままの場合は、5分ごとに直接取得だけを実行する。
  setInterval(refreshDirectly, FIVE_MINUTES);
})();
