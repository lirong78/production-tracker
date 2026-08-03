// Replacement functions for generateReportImage and generateReasonSummary
// These now work entirely client-side with Supabase

// 生成产能报表 - 纯前端版本
async function generateReportImage() {
  const startDate = document.getElementById('analysisStartDate').value;
  const endDate = document.getElementById('analysisEndDate').value;
  
  if (!startDate || !endDate) {
    alert('请先选择开始和结束日期');
    return;
  }
  
  try {
    // 从 Supabase 获取数据
    const url = `${SUPABASE_URL}/rest/v1/production_records?record_date=gte.${startDate}&record_date=lte.${endDate}&select=*`;
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      alert('该日期范围没有数据');
      return;
    }
    
    // 获取线体信息
    const linesResp = await fetch(`${SUPABASE_URL}/rest/v1/production_lines?select=*&is_active=eq.true&order=sort_order`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    const lines = await linesResp.json();
    
    // 按线体+日期汇总
    const lineDaily = {};
    const lineTotal = {};
    
    data.forEach(record => {
      const lineName = record.line_name || '';
      const recordDate = record.record_date || '';
      const achieved = record.achieved_value || 0;
      const target = record.target_value || 0;
      
      const key = `${lineName}|||${recordDate}`;
      if (!lineDaily[key]) lineDaily[key] = { achieved: 0, target: 0 };
      lineDaily[key].achieved += achieved;
      lineDaily[key].target += target;
      
      if (!lineTotal[lineName]) lineTotal[lineName] = { achieved: 0, target: 0 };
      lineTotal[lineName].achieved += achieved;
      lineTotal[lineName].target += target;
    });
    
    // 排序
    const dates = [...new Set(data.map(r => r.record_date))].sort();
    const results = [];
    
    for (const lineName in lineTotal) {
      const stats = lineTotal[lineName];
      const rate = stats.target > 0 ? (stats.achieved / stats.target * 100) : 0;
      const diff = stats.achieved - stats.target;
      
      // 提取班长
      let leader = '';
      const match = lineName.match(/（(.+?)）/);
      if (match) leader = match[1];
      
      // 每日数据
      const dailyData = [];
      dates.forEach(d => {
        const key = `${lineName}|||${d}`;
        if (lineDaily[key] && lineDaily[key].target > 0) {
          const da = lineDaily[key].achieved;
          const dt = lineDaily[key].target;
          const dr = dt > 0 ? (da / dt * 100) : 0;
          dailyData.push({ date: d, achieved: da, target: dt, rate: dr });
        }
      });
      
      results.push({
        lineName,
        leader,
        achieved: stats.achieved,
        target: stats.target,
        rate,
        diff,
        daily: dailyData
      });
    }
    
    results.sort((a, b) => b.rate - a.rate);
    
    // 总计
    const totalAchieved = results.reduce((s, r) => s + r.achieved, 0);
    const totalTarget = results.reduce((s, r) => s + r.target, 0);
    const totalRate = totalTarget > 0 ? (totalAchieved / totalTarget * 100) : 0;
    
    // 构建 HTML 报表
    const reportHtml = buildReportHtml(startDate, endDate, results, totalAchieved, totalTarget, totalRate);
    
    // 用 html2canvas 生成图片
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;background:#f0f2f5;';
    tempDiv.innerHTML = reportHtml;
    document.body.appendChild(tempDiv);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const resultCanvas = await html2canvas(tempDiv, {
      scale: 2,
      backgroundColor: '#f0f2f5',
      useCORS: true,
      logging: false
    });
    
    document.body.removeChild(tempDiv);
    
    // 下载
    const link = document.createElement('a');
    link.download = `产能报表_${startDate}_至_${endDate}.png`;
    link.href = resultCanvas.toDataURL('image/png');
    link.click();
    
    alert('产能报表已生成！');
    
  } catch (error) {
    console.error('生成报表失败:', error);
    alert('生成报表失败: ' + error.message);
  }
}

// 构建报表 HTML
function buildReportHtml(startDate, endDate, results, totalAchieved, totalTarget, totalRate) {
  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const rateColor = (rate) => rate >= 100 ? '#4caf50' : rate >= 90 ? '#ff9800' : '#f44336';
  
  let html = `
    <div style="padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <h2 style="text-align:center;color:#1a73e8;margin-bottom:8px;font-size:24px;">📊 地刷车间产能报表</h2>
      <p style="text-align:center;color:#666;margin-bottom:16px;font-size:14px;">${startDate} 至 ${endDate}</p>
      
      <div style="background:linear-gradient(135deg,#1a73e8,#0d47a1);color:#fff;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;">
        <div style="font-size:13px;opacity:0.85;">★ 总达成率 ★</div>
        <div style="font-size:36px;font-weight:700;color:${rateColor(totalRate)};">${totalRate.toFixed(1)}%</div>
        <div style="font-size:13px;opacity:0.85;margin-top:4px;">达成 ${totalAchieved.toLocaleString()} / 目标 ${totalTarget.toLocaleString()}</div>
      </div>
  `;
  
  results.forEach((r, i) => {
    const medal = i < 3 ? `<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:${medalColors[i]};color:#333;text-align:center;line-height:28px;font-weight:700;font-size:14px;">${i+1}</span>` : `<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:#555;color:#fff;text-align:center;line-height:28px;font-weight:700;font-size:14px;">${i+1}</span>`;
    
    html += `
      <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;border-left:4px solid ${medalColors[i] || '#555'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            ${medal}
            <span style="font-size:16px;font-weight:600;color:#333;">${r.lineName}</span>
          </div>
          <span style="font-size:20px;font-weight:700;color:${rateColor(r.rate)};">${r.rate.toFixed(1)}%</span>
        </div>
        <div style="font-size:13px;color:#666;margin-bottom:8px;">
          达成 ${r.achieved.toLocaleString()} / 目标 ${r.target.toLocaleString()} | 
          ${r.diff >= 0 ? `<span style="color:#4caf50;">超产 ${r.diff.toLocaleString()}</span>` : `<span style="color:#f44336;">落产 ${Math.abs(r.diff).toLocaleString()}</span>`}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
    `;
    
    r.daily.forEach(d => {
      const dayNum = d.date.split('-')[2];
      html += `
        <div style="background:#f5f5f5;border-radius:6px;padding:4px 8px;font-size:11px;text-align:center;min-width:50px;">
          <div style="color:#888;">${parseInt(dayNum)}日</div>
          <div style="color:${rateColor(d.rate)};font-weight:600;">${d.rate.toFixed(0)}%</div>
        </div>
      `;
    });
    
    html += `</div></div>`;
  });
  
  html += `<p style="text-align:center;color:#999;font-size:12px;margin-top:16px;">- 产线小时达成录入系统 -</p></div>`;
  
  return html;
}

// 生成异常汇总 - 纯前端版本
async function generateReasonSummary() {
  const startDate = document.getElementById('analysisStartDate').value;
  const endDate = document.getElementById('analysisEndDate').value;
  
  if (!startDate || !endDate) {
    alert('请先选择开始和结束日期');
    return;
  }
  
  try {
    // 从 Supabase 获取数据
    const url = `${SUPABASE_URL}/rest/v1/production_records?record_date=gte.${startDate}&record_date=lte.${endDate}&select=*`;
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      alert('该日期范围没有数据');
      return;
    }
    
    // 筛选有异常原因的记录
    const reasonRecords = data.filter(d => d.reason && d.reason.trim());
    
    if (reasonRecords.length === 0) {
      alert('该日期范围没有异常记录');
      return;
    }
    
    // 内外部原因分类关键词
    const INTERNAL_KW = ['员工', '熟练度', '品质', '不良', '设备', '换型', '测试', '故障', '停线', '切换', '新员工', '复测'];
    const EXTERNAL_KW = ['物料', '来料', '供应商', '外部', '其他部门', '停电', '环境'];
    
    function classifyReason(reason) {
      for (const kw of EXTERNAL_KW) {
        if (reason.includes(kw)) return 'external';
      }
      for (const kw of INTERNAL_KW) {
        if (reason.includes(kw)) return 'internal';
      }
      return 'other';
    }
    
    // 按线体汇总
    const lineStats = {};
    
    reasonRecords.forEach(record => {
      const lineName = record.line_name || '';
      const reason = record.reason.trim();
      const target = record.target_value || 0;
      const achieved = record.achieved_value || 0;
      const shortage = target - achieved;
      
      if (!lineStats[lineName]) {
        lineStats[lineName] = {
          reasons: {},
          totalShortage: 0
        };
      }
      
      if (!lineStats[lineName].reasons[reason]) {
        lineStats[lineName].reasons[reason] = {
          count: 0,
          totalShortage: 0,
          category: classifyReason(reason)
        };
      }
      
      lineStats[lineName].reasons[reason].count++;
      lineStats[lineName].reasons[reason].totalShortage += shortage;
      lineStats[lineName].totalShortage += shortage;
    });
    
    // 构建 HTML
    const html = buildReasonSummaryHtml(startDate, endDate, lineStats);
    
    // 用 html2canvas 生成图片
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;background:#f5f5f5;';
    tempDiv.innerHTML = html;
    document.body.appendChild(tempDiv);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const resultCanvas = await html2canvas(tempDiv, {
      scale: 2,
      backgroundColor: '#f5f5f5',
      useCORS: true,
      logging: false
    });
    
    document.body.removeChild(tempDiv);
    
    // 下载
    const link = document.createElement('a');
    link.download = `异常汇总_${startDate}_至_${endDate}.png`;
    link.href = resultCanvas.toDataURL('image/png');
    link.click();
    
    alert('异常汇总已生成！');
    
  } catch (error) {
    console.error('生成异常汇总失败:', error);
    alert('生成异常汇总失败: ' + error.message);
  }
}

// 构建异常汇总 HTML
function buildReasonSummaryHtml(startDate, endDate, lineStats) {
  const categoryColors = {
    internal: { bg: '#fff3e0', text: '#e65100', label: '内部' },
    external: { bg: '#e3f2fd', text: '#1565c0', label: '外部' },
    other: { bg: '#f5f5f5', text: '#616161', label: '其他' }
  };
  
  let html = `
    <div style="padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <h2 style="text-align:center;color:#d32f2f;margin-bottom:8px;font-size:24px;">📋 异常原因汇总</h2>
      <p style="text-align:center;color:#666;margin-bottom:16px;font-size:14px;">${startDate} 至 ${endDate}</p>
  `;
  
  // 按总损失排序
  const sortedLines = Object.entries(lineStats).sort((a, b) => b[1].totalShortage - a[1].totalShortage);
  
  sortedLines.forEach(([lineName, stats]) => {
    // 提取班长
    let leader = '';
    const match = lineName.match(/（(.+?)）/);
    if (match) leader = match[1];
    const shortName = lineName.replace(/（.+?）/, '');
    
    html += `
      <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-size:16px;font-weight:600;color:#333;">${shortName}${leader ? '（' + leader + '）' : ''}</span>
          <span style="font-size:14px;font-weight:600;color:#d32f2f;">总损失 ${stats.totalShortage.toLocaleString()} 台</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:8px;text-align:left;border-bottom:1px solid #e0e0e0;">异常原因</th>
              <th style="padding:8px;text-align:center;border-bottom:1px solid #e0e0e0;width:60px;">次数</th>
              <th style="padding:8px;text-align:center;border-bottom:1px solid #e0e0e0;width:80px;">损失</th>
              <th style="padding:8px;text-align:center;border-bottom:1px solid #e0e0e0;width:60px;">分类</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    // 按损失排序
    const sortedReasons = Object.entries(stats.reasons).sort((a, b) => b[1].totalShortage - a[1].totalShortage);
    
    sortedReasons.forEach(([reason, data]) => {
      const cat = categoryColors[data.category] || categoryColors.other;
      html += `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px;">${reason}</td>
          <td style="padding:8px;text-align:center;">${data.count}</td>
          <td style="padding:8px;text-align:center;color:#d32f2f;font-weight:600;">${data.totalShortage.toLocaleString()}</td>
          <td style="padding:8px;text-align:center;"><span style="background:${cat.bg};color:${cat.text};padding:2px 8px;border-radius:4px;font-size:11px;">${cat.label}</span></td>
        </tr>
      `;
    });
    
    html += `</tbody></table></div>`;
  });
  
  html += `<p style="text-align:center;color:#999;font-size:12px;margin-top:16px;">- 产线小时达成录入系统 -</p></div>`;
  
  return html;
}
