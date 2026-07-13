<template>
  <div class="panel">
    <div class="stats-cards">
      <div class="stat-card">
        <span class="stat-num">{{ stats.total }}</span>
        <span class="stat-label">总命中</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{{ stats.corsFixed }}</span>
        <span class="stat-label">修复 CORS/CSP</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{{ stats.byDir.request }}</span>
        <span class="stat-label">请求头</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{{ stats.byDir.response }}</span>
        <span class="stat-label">响应头</span>
      </div>
    </div>

    <p class="note">
      📊 数据统计自工具栏图标的命中日志（需“已解压/开发者模式”加载）。下方的“24 小时”曲线按小时聚合。
    </p>

    <div v-if="hasData" class="chart-block">
      <h4 class="chart-title">最常修改的 Header</h4>
      <div ref="barEl" class="chart"></div>
    </div>
    <div v-if="hasData" class="chart-block">
      <h4 class="chart-title">请求 vs 响应 流量</h4>
      <div ref="pieEl" class="chart chart--sm"></div>
    </div>
    <div v-if="hasData" class="chart-block">
      <h4 class="chart-title">近 24 小时请求量</h4>
      <div ref="lineEl" class="chart chart--sm"></div>
    </div>

    <p v-if="!hasData" class="muted">还没有数据。开启规则并访问一些网站后，回到这里点“刷新”。</p>

    <div class="log-actions">
      <button class="btn btn--ghost btn--sm" @click="refresh">刷新</button>
      <button class="btn btn--ghost btn--sm" @click="onReset">清空统计</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, PieChart, LineChart } from 'echarts/charts';
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useProfiles } from '../composables/useProfiles.js';

echarts.use([BarChart, PieChart, LineChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer]);

const { fetchStats, resetStats } = useProfiles();
const stats = ref({ total: 0, corsFixed: 0, headerCounts: {}, byDir: { request: 0, response: 0 }, hours: {} });
const hasData = computed(() => stats.value.total > 0);

const barEl = ref(null);
const pieEl = ref(null);
const lineEl = ref(null);
let barChart = null;
let pieChart = null;
let lineChart = null;

const AXIS = '#94a3b8';
const SPLIT = 'rgba(148,163,184,0.18)';

async function refresh() {
  stats.value = await fetchStats();
  await nextTick();
  render();
}

function last24Buckets() {
  const keys = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    keys.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`);
  }
  return keys;
}

function render() {
  if (!hasData.value) {
    [barChart, pieChart, lineChart].forEach((c) => c && c.clear());
    return;
  }
  const s = stats.value;

  // Top headers bar
  const top = Object.entries(s.headerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .reverse();
  if (barEl.value) {
    barChart = barChart || echarts.init(barEl.value);
    barChart.setOption({
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', axisLabel: { color: AXIS }, splitLine: { lineStyle: { color: SPLIT } } },
      yAxis: {
        type: 'category',
        data: top.map((t) => t[0]),
        axisLabel: { color: AXIS, fontSize: 10 },
        axisLine: { lineStyle: { color: SPLIT } },
      },
      series: [
        {
          type: 'bar',
          data: top.map((t) => t[1]),
          itemStyle: { color: '#3b82f6', borderRadius: [0, 4, 4, 0] },
          barWidth: '60%',
        },
      ],
    });
  }

  // Request vs response pie
  if (pieEl.value) {
    pieChart = pieChart || echarts.init(pieEl.value);
    pieChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: AXIS, fontSize: 10 } },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '44%'],
          label: { color: AXIS, fontSize: 10 },
          data: [
            { name: '请求头', value: s.byDir.request, itemStyle: { color: '#3b82f6' } },
            { name: '响应头', value: s.byDir.response, itemStyle: { color: '#a855f7' } },
          ],
        },
      ],
    });
  }

  // 24h line
  const buckets = last24Buckets();
  const lineData = buckets.map((k) => s.hours[k] || 0);
  if (lineEl.value) {
    lineChart = lineChart || echarts.init(lineEl.value);
    lineChart.setOption({
      grid: { left: 8, right: 12, top: 12, bottom: 20, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: buckets.map((k) => k.slice(11)),
        axisLabel: { color: AXIS, fontSize: 9, interval: 3 },
        axisLine: { lineStyle: { color: SPLIT } },
      },
      yAxis: { type: 'value', axisLabel: { color: AXIS }, splitLine: { lineStyle: { color: SPLIT } } },
      series: [
        {
          type: 'line',
          smooth: true,
          data: lineData,
          areaStyle: { color: 'rgba(59,130,246,0.18)' },
          itemStyle: { color: '#3b82f6' },
          lineStyle: { color: '#3b82f6' },
        },
      ],
    });
  }
  [barChart, pieChart, lineChart].forEach((c) => c && c.resize());
}

async function onReset() {
  if (!confirm('清空所有统计数据？')) return;
  await resetStats();
  await refresh();
}

function onResize() {
  [barChart, pieChart, lineChart].forEach((c) => c && c.resize());
}

onMounted(async () => {
  await refresh();
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  [barChart, pieChart, lineChart].forEach((c) => c && c.dispose());
});
</script>
