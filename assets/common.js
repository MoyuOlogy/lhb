/* 共享工具库：金额格式化、席位渲染、数据加载 */

// 金额格式化：元 → 万 / 亿
function fmtAmount(v, digits = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const abs = Math.abs(v);
  let s;
  if (abs >= 1e8) s = (v / 1e8).toFixed(digits) + '亿';
  else if (abs >= 1e4) s = (v / 1e4).toFixed(digits) + '万';
  else s = v.toFixed(2);
  return (v > 0 ? '+' : '') + s;
}

// 金额格式化（不带符号，用于成交额等恒正字段）
function fmtMoney(v, digits = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e8) return (v / 1e8).toFixed(digits) + '亿';
  if (abs >= 1e4) return (v / 1e4).toFixed(digits) + '万';
  return v.toFixed(2);
}

// 带符号百分比
function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
}

// 涨跌 class
function pctClass(v) {
  if (v === null || v === undefined || isNaN(v) || v === 0) return '';
  return v > 0 ? 'up' : 'down';
}

// 席位标签渲染
function seatTagsHtml(tags) {
  if (!tags || !tags.length) return '';
  const cls = { '深股通': 'deep', '沪股通': 'hutong', '机构': 'org', '游资': 'youzi' };
  return tags.map(t => `<span class="tag ${cls[t] || ''}">${t}</span>`).join('');
}

// 个股标签（含深股通买入特别标注）
function stockTagsHtml(s) {
  let h = '';
  if (s.hasDeepBuy) h += '<span class="tag deep">深股通买入</span>';
  if (s.hasGutongBuy && !s.hasDeepBuy) h += '<span class="tag hutong">沪股通买入</span>';
  if (s.hasOrgBuy) h += '<span class="tag org">机构买入</span>';
  if (s.hasYouziBuy) h += '<span class="tag youzi">游资买入</span>';
  return h;
}

// 买卖五席位表格
function seatBodyHtml(s) {
  const rows = (side, label) => {
    const seats = s[side] || [];
    const rankPrefix = side === 'buySeats' ? '买' : '卖';
    if (!seats.length) return `<div class="seat-col ${side}"><h4><span class="side-tag">${label}</span>前五席位</h4><div class="seat-row">— 无数据 —</div></div>`;
    return `
    <div class="seat-col ${side}">
      <h4><span class="side-tag">${label}</span>前五席位</h4>
      ${seats.map((st, i) => {
        let rowCls = '';
        if (st.tags && st.tags.length) {
          if (st.tags.includes('深股通')) rowCls = 'deep';
          else if (st.tags.includes('沪股通')) rowCls = 'hutong';
          else if (st.tags.includes('机构')) rowCls = 'org';
          else if (st.tags.includes('游资')) rowCls = 'youzi';
        }
        const cls = rowCls ? 'seat-row ' + rowCls : 'seat-row';
        const amt = side === 'buySeats' ? st.buy : st.sell;
        return `
        <div class="${cls}">
          <span class="rank">${rankPrefix}${i + 1}</span>
          <span class="sname" title="${st.name}">${st.name}</span>
          <span class="st">${seatTagsHtml(st.tags)}</span>
          <span class="samt">${fmtAmount(amt)}</span>
          <span class="snet ${pctClass(st.net)}">${fmtAmount(st.net)}</span>
        </div>`;
      }).join('')}
    </div>`;
  };
  return `
  <div class="seat-body">
    ${rows('buySeats', '买入')}
    ${rows('sellSeats', '卖出')}
  </div>`;
}

// 单个股票卡片
function stockCardHtml(s) {
  const reasonChips = (s.reason || '').split('；').filter(Boolean)
    .map(r => `<span class="reason-chip">${r}</span>`).join('');
  return `
  <div class="stock-card" data-code="${s.code}">
    <div class="head">
      <span class="stock-code">${s.code}</span>
      <span class="stock-name">${s.name}</span>
      <span class="stock-tags">${stockTagsHtml(s)}</span>
      <div class="stock-metrics">
        <div class="metric"><div class="m-label">涨跌幅</div><div class="m-value ${pctClass(s.changePct)}">${fmtPct(s.changePct)}</div></div>
        <div class="metric"><div class="m-label">龙虎榜净买</div><div class="m-value ${s.lhbNet > 0 ? 'up' : s.lhbNet < 0 ? 'down' : ''}">${fmtAmount(s.lhbNet)}</div></div>
        <div class="metric"><div class="m-label">成交额</div><div class="m-value">${fmtMoney(s.amount, 1)}</div></div>
        <div class="metric"><div class="m-label">换手率</div><div class="m-value">${s.turnoverRate ? s.turnoverRate.toFixed(2) + '%' : '—'}</div></div>
      </div>
      <div class="stock-reason">${reasonChips}</div>
    </div>
  </div>`;
}

// 加载 JSON
async function loadJSON(url) {
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`加载失败 ${url}: ${resp.status}`);
  return resp.json();
}

// 展开/收起交互
function bindExpand(container) {
  container.querySelectorAll('.stock-card .head').forEach(head => {
    head.addEventListener('click', () => {
      const card = head.closest('.stock-card');
      const existing = card.querySelector('.seat-body');
      if (existing) { existing.remove(); return; }
      // 从缓存取数据
      const code = card.dataset.code;
      const data = container._dayData;
      const s = data.stocks.find(x => x.code === code);
      if (!s) return;
      head.insertAdjacentHTML('afterend', seatBodyHtml(s));
    });
  });
}

// 高亮搜索关键字
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
