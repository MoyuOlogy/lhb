/* 历史详情页逻辑 */
(function () {
  const dateEl = document.getElementById('detail-date');
  const weekEl = document.getElementById('detail-week');
  const summaryEl = document.getElementById('summary');
  const listEl = document.getElementById('stock-list');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const dateSelect = document.getElementById('date-select');
  const fetchedAt = document.getElementById('fetched-at');

  let allDates = [];      // 归档日期列表（降序）
  let currentDate = null;
  let dayData = null;
  let filter = 'all';
  let keyword = '';

  function weekText(dateStr) {
    const d = new Date(dateStr + 'T00:00:00+08:00');
    return '周' + '日一二三四五六'[d.getDay()];
  }

  function renderSummary(sum) {
    summaryEl.innerHTML = `
      <div class="sum-card"><div class="label">上榜家数</div><div class="value">${sum.count}</div></div>
      <div class="sum-card"><div class="label">净买合计</div><div class="value ${sum.netTotal > 0 ? 'up' : sum.netTotal < 0 ? 'down' : ''}">${fmtAmount(sum.netTotal)}</div></div>
      <div class="sum-card"><div class="label">沪深股通买入</div><div class="value accent">${sum.gutongBuyCount} 家</div><div class="hint">净额 ${fmtAmount(sum.gutongNet)}</div></div>
      <div class="sum-card"><div class="label">机构买入</div><div class="value">${sum.orgBuyCount} 家</div><div class="hint">净额 ${fmtAmount(sum.orgNet)}</div></div>
    `;
  }

  function applyFilterAndRender() {
    if (!dayData) return;
    let stocks = dayData.stocks;
    if (filter === 'deep') stocks = stocks.filter(s => s.hasDeepBuy);
    else if (filter === 'gutong') stocks = stocks.filter(s => s.hasGutongBuy);
    else if (filter === 'org') stocks = stocks.filter(s => s.hasOrgBuy);
    else if (filter === 'netup') stocks = stocks.filter(s => (s.lhbNet || 0) > 0);
    else if (filter === 'netdown') stocks = stocks.filter(s => (s.lhbNet || 0) < 0);
    if (keyword) {
      const kw = keyword.toLowerCase();
      stocks = stocks.filter(s => s.code.includes(kw) || s.name.toLowerCase().includes(kw));
    }
    if (!stocks.length) {
      listEl.innerHTML = `<div class="empty"><div class="big">🔍</div>没有符合条件的数据</div>`;
      return;
    }
    listEl.innerHTML = stocks.map(stockCardHtml).join('');
    listEl._dayData = dayData;
    bindExpand(listEl);
    document.getElementById('list-count').textContent = `共 ${stocks.length} 只`;
  }

  function updateNavState() {
    const idx = allDates.indexOf(currentDate);
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx < 0 || idx >= allDates.length - 1;
  }

  function updateSelect() {
    dateSelect.innerHTML = allDates.map(d =>
      `<option value="${d}" ${d === currentDate ? 'selected' : ''}>${d}</option>`).join('');
  }

  async function loadDate(dateStr) {
    listEl.innerHTML = `<div class="loading"><div class="spinner"></div>加载中…</div>`;
    try {
      dayData = await loadJSON(`data/${dateStr}.json`);
      currentDate = dateStr;
      dateEl.textContent = dateStr;
      weekEl.textContent = weekText(dateStr);
      if (dayData.fetchedAt) fetchedAt.textContent = `数据抓取时间：${dayData.fetchedAt.replace('T', ' ').slice(0, 19)}`;
      renderSummary(dayData.summary);
      applyFilterAndRender();
      updateNavState();
      updateSelect();
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<div class="empty"><div class="big">⚠️</div>该日数据加载失败：${err.message}</div>`;
    }
  }

  prevBtn.addEventListener('click', () => {
    const idx = allDates.indexOf(currentDate);
    if (idx > 0) loadDate(allDates[idx - 1]);
  });
  nextBtn.addEventListener('click', () => {
    const idx = allDates.indexOf(currentDate);
    if (idx >= 0 && idx < allDates.length - 1) loadDate(allDates[idx + 1]);
  });
  dateSelect.addEventListener('change', (e) => {
    if (e.target.value) loadDate(e.target.value);
  });

  document.getElementById('filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#filters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.filter;
    applyFilterAndRender();
  });
  document.getElementById('search').addEventListener('input', (e) => {
    keyword = e.target.value.trim();
    applyFilterAndRender();
  });

  async function init() {
    try {
      const index = await loadJSON('data/index.json');
      allDates = (index.dates || []).map(e => e.date);
      if (!allDates.length) {
        listEl.innerHTML = `<div class="empty"><div class="big">📅</div>暂无历史数据</div>`;
        return;
      }
      const params = new URLSearchParams(location.search);
      const reqDate = params.get('date');
      const target = allDates.includes(reqDate) ? reqDate : allDates[0];
      updateSelect();
      await loadDate(target);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<div class="empty"><div class="big">⚠️</div>历史数据加载失败：${err.message}</div>`;
    }
  }

  init();
})();
