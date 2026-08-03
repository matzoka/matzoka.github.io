(() => {
  const FIVE_MINUTES = 5 * 60 * 1000;
  let lastTriggeredAt = 0;

  function refreshDirectly() {
    const button = document.getElementById("refreshButton");
    if (!button || button.disabled) return;

    const now = Date.now();
    if (now - lastTriggeredAt < 1500) return;
    lastTriggeredAt = now;
    button.click();
  }

  function refreshAfterInitialFeed() {
    // app.jsは起動直後に予備フィードを読み込むため、
    // その処理が終わった後に直接照会を実行する。
    setTimeout(refreshDirectly, 1200);

    // 通信順の逆転で古い予備フィードが後から描画された場合にも、
    // 最後は必ず直接取得した最新値で上書きする。
    setTimeout(refreshDirectly, 4200);
  }

  refreshAfterInitialFeed();

  // 戻る・進む操作やタブ復帰時も最新値へ更新する。
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) setTimeout(refreshDirectly, 200);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(refreshDirectly, 200);
  });

  // ページを開いたままの場合も、5分ごとに直接照会する。
  setInterval(refreshDirectly, FIVE_MINUTES);
})();
