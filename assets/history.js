/* 历史归档页逻辑 */
(function () {
  const listEl = document.getElementById('day-list');
  const updatedEl = document.getElementById('updated');

  function weekText(dateStr) {
    const d = new Date(dateStr + 'T00:00:00+08:00');
    return '周' + '日一二三四五六'[d.getDay()];
  }

  function render(dates) {
    if (!dates || !dates.length) {
      listEl.innerHTML = `<div class="empty"><div class="big">📅</div>暂无历史数据</div>`;
      return;
    }
    // 按月份分组
    const groups = {};
    dates.forEach(e => {
      const month = e.date.slice(0, 7);
      (groups[month] = groups[month] || []).push(e);
    });

    let html = '';
    Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach(month => {
      const items = groups[month].map(e => `
        <div class="day-card" data-date="${e.date}">
          <div>
            <div class="d-date">${e.date}</div>
            <div class="d-week">${weekText(e.date)}</div>
          </div>
          <div class="d-metrics">
            <div class="cnt">${e.count}</div>
            <div class="sub">家上榜</div>
          </div>
          <div class="d-metrics">
            <div class="cnt ${e.netTotal > 0 ? 'up' : e.netTotal < 0 ? 'down' : ''}">${fmtAmount(e.netTotal)}</div>
            <div class="sub">净买额</div>
          </div>
          <span class="d-arrow">›</span>
        </div>`).join('');
      html += `
        <div class="month-group">
          <div class="month-label">${month.slice(0, 4)} 年 ${parseInt(month.slice(5), 10)} 月</div>
          <div class="day-list">${items}</div>
        </div>`;
    });
    listEl.innerHTML = html;

    // 点击进入详情页
    listEl.querySelectorAll('.day-card').forEach(card => {
      card.addEventListener('click', () => {
        location.href = `detail.html?date=${card.dataset.date}`;
      });
    });
  }

  async function init() {
    try {
      const index = await loadJSON('data/index.json');
      updatedEl.textContent = index.updatedAt ? `归档更新：${index.updatedAt.replace('T', ' ').slice(0, 19)}` : '';
      render(index.dates);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<div class="empty"><div class="big">⚠️</div>历史数据加载失败：${err.message}</div>`;
    }
  }

  init();
})();
