/* 主页面（今日榜单）逻辑 */
(function () {
  const listEl = document.getElementById('stock-list');
  const summaryEl = document.getElementById('summary');
  const searchInput = document.getElementById('search');
  const filterGroup = document.getElementById('filters');
  const dateTitle = document.getElementById('date-title');
  const fetchedAt = document.getElementById('fetched-at');

  let dayData = null;       // 当日完整数据
  let filter = 'all';       // 当前筛选
  let keyword = '';         // 搜索关键字

  function todayStr() {
    const now = new Date();
    const off = now.getTimezoneOffset();
    const cst = new Date(now.getTime() - off * 60000 + 8 * 3600000);
    return cst.toISOString().slice(0, 10);
  }

  // 依据 data/index.json 选择当日（非交易日/未更新时回退到最近交易日）
  async function resolveLatestDate() {
    const index = await loadJSON('data/index.json');
    if (index.dates && index.dates.length) {
      return index.dates[0].date;
    }
    return null;
  }

  function renderSummary(sum) {
    summaryEl.innerHTML = `
      <div class="sum-card"><div class="label">上榜家数</div><div class="value">${sum.count}</div></div>
      <div class="sum-card"><div class="label">净买合计</div><div class="value ${sum.netTotal > 0 ? 'up' : sum.netTotal < 0 ? 'down' : ''}">${fmtAmount(sum.netTotal)}</div></div>
      <div class="sum-card"><div class="label">沪深股通买入</div><div class="value gold">${sum.gutongBuyCount} 家</div><div class="hint">净额 ${fmtAmount(sum.gutongNet)}</div></div>
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
      stocks = stocks.filter(s =>
        s.code.includes(kw) || s.name.toLowerCase().includes(kw));
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

  // 筛选 chip 点击
  filterGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    filterGroup.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.filter;
    applyFilterAndRender();
  });

  // 搜索
  searchInput.addEventListener('input', (e) => {
    keyword = e.target.value.trim();
    applyFilterAndRender();
  });

  async function init() {
    try {
      const latest = await resolveLatestDate();
      if (!latest) {
        listEl.innerHTML = `<div class="empty"><div class="big">🌙</div>尚无数据<br>每个交易日 20:00 自动抓取后展示</div>`;
        return;
      }
      dayData = await loadJSON(`data/${latest}.json`);
      const d = new Date(latest + 'T00:00:00+08:00');
      const isToday = latest === todayStr();
      dateTitle.textContent = isToday ? `今日榜单 · ${latest}` : `${latest}（周${'日一二三四五六'[d.getDay()]}）`;
      if (!isToday) {
        const fallback = document.createElement('div');
        fallback.className = 'page-sub';
        fallback.textContent = '⚠ 今日（非交易日/数据未更新）暂无当日榜单，当前展示最近一个交易日数据';
        fallback.style.color = '#e3b341';
        dateTitle.after(fallback);
      }
      if (dayData.fetchedAt) {
        fetchedAt.textContent = `数据抓取时间：${dayData.fetchedAt.replace('T', ' ').slice(0, 19)}`;
      }
      renderSummary(dayData.summary);
      applyFilterAndRender();
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<div class="empty"><div class="big">⚠️</div>数据加载失败：${err.message}</div>`;
    }
  }

  init();
})();
