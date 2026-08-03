(() => {
  const FIVE_MINUTES = 5 * 60 * 1000;

  function refreshDirectly() {
    const button = document.getElementById("refreshButton");
    if (!button || button.disabled) return;
    button.click();
  }

  // app.jsの初期表示が予備フィードを読み込んだ直後に、
  // Yahoo Financeへの直接照会へ切り替える。
  setTimeout(refreshDirectly, 0);

  // ページを開いたままの場合も、5分ごとに直接照会する。
  setInterval(refreshDirectly, FIVE_MINUTES);
})();
