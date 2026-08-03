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
    
    // 计算每条线的总产量和达成（所有记录，不只是异常记录）
    const lineProduction = {};
    data.forEach(record => {
      const lineName = record.line_name || '';
      const target = record.target_value || 0;
      const achieved = record.achieved_value || 0;
      
      if (!lineProduction[lineName]) {
        lineProduction[lineName] = { target: 0, achieved: 0 };
      }
      lineProduction[lineName].target += target;
      lineProduction[lineName].achieved += achieved;
    });
    
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
    
    // 按线体汇总异常
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
    
    // 计算整体损失
    let totalTarget = 0, totalAchieved = 0, totalLoss = 0;
    let totalInternalLoss = 0, totalExternalLoss = 0, totalOtherLoss = 0;
    
    Object.values(lineStats).forEach(stats => {
      totalLoss += stats.totalShortage;
      Object.values(stats.reasons).forEach(reasonData => {
        if (reasonData.category === 'internal') totalInternalLoss += reasonData.totalShortage;
        else if (reasonData.category === 'external') totalExternalLoss += reasonData.totalShortage;
        else totalOtherLoss += reasonData.totalShortage;
      });
    });
    
    Object.values(lineProduction).forEach(p => {
      totalTarget += p.target;
      totalAchieved += p.achieved;
    });
    
    const overallStats = {
      totalTarget,
      totalAchieved,
      totalLoss,
      totalRate: totalTarget > 0 ? (totalAchieved / totalTarget * 100) : 0,
      totalInternalLoss,
      totalExternalLoss,
      totalOtherLoss
    };
    
    // 构建 HTML
    const html = buildReasonSummaryHtml(startDate, endDate, lineStats, lineProduction, overallStats);
    
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
function buildReasonSummaryHtml(startDate, endDate, lineStats, lineProduction, overallStats) {
  const categoryColors = {
    internal: { bg: '#fff3e0', text: '#e65100', label: '内部' },
    external: { bg: '#e3f2fd', text: '#1565c0', label: '外部' },
    other: { bg: '#f5f5f5', text: '#616161', label: '其他' }
  };
  
  const rateColor = (rate) => rate >= 100 ? '#4caf50' : rate >= 90 ? '#ff9800' : '#f44336';
  
  let html = `
    <div style="padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <h2 style="text-align:center;color:#d32f2f;margin-bottom:8px;font-size:24px;">📋 异常原因汇总</h2>
      <p style="text-align:center;color:#666;margin-bottom:16px;font-size:14px;">${startDate} 至 ${endDate}</p>
      
      <!-- 整体损失汇总 -->
      <div style="background:linear-gradient(135deg,#d32f2f,#b71c1c);color:#fff;border-radius:12px;padding:16px;margin-bottom:16px;">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px;text-align:center;">⚠️ 整体损失情况</div>
        <div style="display:flex;justify-content:space-around;text-align:center;">
          <div>
            <div style="font-size:11px;opacity:0.85;">总损失</div>
            <div style="font-size:24px;font-weight:700;">${overallStats.totalLoss.toLocaleString()}</div>
            <div style="font-size:11px;opacity:0.85;">台</div>
          </div>
          <div style="border-left:1px solid rgba(255,255,255,0.3);"></div>
          <div>
            <div style="font-size:11px;opacity:0.85;">内部损失</div>
            <div style="font-size:20px;font-weight:700;color:#ffcc80;">${overallStats.totalInternalLoss.toLocaleString()}</div>
          </div>
          <div style="border-left:1px solid rgba(255,255,255,0.3);"></div>
          <div>
            <div style="font-size:11px;opacity:0.85;">外部损失</div>
            <div style="font-size:20px;font-weight:700;color:#90caf9;">${overallStats.totalExternalLoss.toLocaleString()}</div>
          </div>
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.2);display:flex;justify-content:space-around;text-align:center;">
          <div>
            <div style="font-size:11px;opacity:0.85;">总目标</div>
            <div style="font-size:16px;font-weight:600;">${overallStats.totalTarget.toLocaleString()}</div>
          </div>
          <div>
            <div style="font-size:11px;opacity:0.85;">总达成</div>
            <div style="font-size:16px;font-weight:600;">${overallStats.totalAchieved.toLocaleString()}</div>
          </div>
          <div>
            <div style="font-size:11px;opacity:0.85;">达成率</div>
            <div style="font-size:16px;font-weight:700;color:${rateColor(overallStats.totalRate)};">${overallStats.totalRate.toFixed(1)}%</div>
          </div>
        </div>
      </div>
  `;
  
  // 按总损失排序
  const sortedLines = Object.entries(lineStats).sort((a, b) => b[1].totalShortage - a[1].totalShortage);
  
  sortedLines.forEach(([lineName, stats]) => {
    // 提取班长
    let leader = '';
    const match = lineName.match(/（(.+?)）/);
    if (match) leader = match[1];
    const shortName = lineName.replace(/（.+?）/, '');
    
    // 获取该线的产量达成数据
    const production = lineProduction[lineName] || { target: 0, achieved: 0 };
    const lineRate = production.target > 0 ? (production.achieved / production.target * 100) : 0;
    
    html += `
      <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:16px;font-weight:600;color:#333;">${shortName}${leader ? '（' + leader + '）' : ''}</span>
          <span style="font-size:14px;font-weight:600;color:#d32f2f;">损失 ${stats.totalShortage.toLocaleString()} 台</span>
        </div>
        <!-- 产量达成数据 -->
        <div style="background:#f9f9f9;border-radius:8px;padding:10px;margin-bottom:12px;display:flex;justify-content:space-around;text-align:center;">
          <div>
            <div style="font-size:11px;color:#888;">目标</div>
            <div style="font-size:14px;font-weight:600;color:#333;">${production.target.toLocaleString()}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#888;">达成</div>
            <div style="font-size:14px;font-weight:600;color:#333;">${production.achieved.toLocaleString()}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#888;">达成率</div>
            <div style="font-size:14px;font-weight:700;color:${rateColor(lineRate)};">${lineRate.toFixed(1)}%</div>
          </div>
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
