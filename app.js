document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const reservoirSelect = document.getElementById("reservoir-select");
  const datePicker = document.getElementById("date-picker");
  const stationSelect = document.getElementById("station-select");
  const daysSelect = document.getElementById("days-select");
  const avgToggle = document.getElementById("avg-toggle");
  const showAllStationsToggle = document.getElementById("show-all-stations-toggle");
  const exportBtn = document.getElementById("export-btn");  const findRainDayDropdown = document.getElementById('find-rain-day-dropdown');
  const toggleLayoutBtn = document.getElementById('toggle-layout-btn');
  const chartCol = document.getElementById('chart-col');
  const mapCol = document.getElementById('map-col');
  const mapContainer = document.getElementById('map');
  const ctx = document.getElementById("rainfallChart").getContext("2d");
  const avgTotalDisplay = document.getElementById('avg-rainfall-total-display');
  const downloadCsvBtn = document.getElementById('download-csv-btn');
  // Toast elements for notifications
  const infoToastEl = document.getElementById('info-toast');
  const infoToastBody = document.getElementById('info-toast-body');
  const infoToast = new bootstrap.Toast(infoToastEl);

  let chart;
  // Cache for the full year's data
  let fullYearStationData = {};
  let fullYearAvgData = [];
  let currentLoadedYear = null;
  let currentLoadedReservoir = null;
  let stationMarkers = {}; // To store marker references by station ID
  let initialMapBounds = null; // To store the initial map bounds for the "Home" button
  let originalDatasetStyles = []; // To store original chart dataset styles for hover effect

  // --- Leaflet Icon Definitions ---
  const defaultIcon = new L.Icon({
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
  });

  const highlightedIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
  });

  const aboveAverageIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
  });

  const belowAverageIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
  });

  const noDataIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
  });




  // --- Custom Chart.js Plugin for "No Data" message ---
  const noDataPlugin = {
    id: 'noData',
    afterDraw: (chart) => {
      // Check if all datasets are empty
      if (chart.data.datasets.every(ds => ds.data.length === 0)) {
        const { ctx, chartArea: { left, top, right, bottom } } = chart;
        const width = right - left;
        const height = bottom - top;
        
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "20px 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
        ctx.fillStyle = '#888';
        ctx.fillText('此日期無資料', left + width / 2, top + height / 2);
        ctx.restore();
      }
    }
  };
  Chart.register(noDataPlugin);
  // --- Chart Configuration ---
  const chartConfig = {
    type: "bar",
    data: {
      datasets: [],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "time",
          time: {
            tooltipFormat: "yyyy-MM-dd HH:mm",
            displayFormats: {
              hour: "HH:mm",
              day: "MM-dd",
            },
          },
          title: {
            display: true,
            text: "時間",
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "雨量 (mm)",
          },
        },
      },
      plugins: {
        title: {
          display: true,
          text: "雨量時間序列圖",
          font: {
            size: 22,
            weight: 'bold'
          }
        },
        legend: {
          position: "top",
        },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              const value = context.parsed.y;
              if (value !== null && value !== undefined) {
                label += value.toFixed(1);
              } else {
                // If value is null (missing data), display '0.0' as requested.
                label += '0.0';
              }
              return label;
            }
          }
        },
        datalabels: {
          // 將標籤顯示在柱子的頂端外部
          anchor: 'end',
          align: 'top',
          // 格式化數值，顯示到小數點後一位
          formatter: (value, context) => {
            const val = value.y;
            // 只顯示大於 0 的數值
            return val !== null && val > 0 ? val.toFixed(1) : null;
          },
          // 只在柱狀圖上顯示標籤 (不顯示在平均雨量線上)
          display: (context) => {
            // Only display for bar charts AND when not in "show all" mode
            const showAllStations = document.getElementById("show-all-stations-toggle").checked;
            return context.dataset.type !== 'line' && !showAllStations;
          },
          color: '#115293', // 使用深藍色以增加可讀性
          font: {
            weight: 'bold',
          }
        }
      },
      interaction: {
        mode: "nearest",
        axis: "x",
        intersect: false,
      },
    },
  };

  // --- Functions ---

  /**
   * Generates a color from a predefined palette based on an index.
   * @param {number} index - The index to pick a color for.
   * @returns {string} A color in rgba format.
   */
  function getColor(index) {
    const colors = [
        'rgba(54, 162, 235, 1)',  // Blue
        'rgba(75, 192, 192, 1)',  // Green
        'rgba(255, 159, 64, 1)',  // Orange
        'rgba(153, 102, 255, 1)', // Purple
        'rgba(255, 205, 86, 1)',  // Yellow
        'rgba(231, 76, 60, 1)',   // Red
        'rgba(52, 152, 219, 1)',  // Peter River
        'rgba(46, 204, 113, 1)',  // Emerald
        'rgba(241, 196, 15, 1)',  // Sun Flower
        'rgba(142, 68, 173, 1)',  // Wisteria
        'rgba(26, 188, 156, 1)',  // Turquoise
        'rgba(211, 84, 0, 1)',    // Pumpkin
    ];
    return colors[index % colors.length];
  }

  /**
   * Converts a solid color to a semi-transparent version.
   * @param {string} color - The solid color (e.g., 'rgba(r, g, b, 1)').
   * @returns {string} A transparent color (e.g., 'rgba(r, g, b, 0.5)').
   */
  function getBackgroundColor(color) {
      return color.replace(', 1)', ', 0.5)');
  }

  /**
   * Formats a Date object into a 'YYYY-MM-DD' string.
   * @param {Date} date - The date to format.
   * @returns {string} The formatted date string.
   */
  function getDayKey(date) {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const dayOfMonth = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${dayOfMonth}`;
  }
  /**
   * Creates a dense hourly dataset from a sparse one for a given time range.
   * @param {Array} sparseData - The sparse source data array.
   * @param {Date} startDate - The start of the range.
   * @param {Date} endDate - The end of the range.
   * @returns {Array} A dense data array with hourly points, filling gaps with null.
   */
  function densifyHourlyData(sparseData, startDate, endDate) {
    const denseData = [];
    const sourceMap = new Map(sparseData.map(p => [p.x.getTime(), p.y]));

    let currentDate = new Date(startDate);
    while (currentDate < endDate) {
        const value = sourceMap.get(currentDate.getTime());
        denseData.push({
            x: new Date(currentDate),
            y: (value !== null && value !== undefined) ? value : null
        });
        currentDate.setHours(currentDate.getHours() + 1);
    }
    return denseData;
  }

  /**
   * Parses CSV text into an array of objects.
   * Assumes first row is headers.
   * @param {string} csvText - The raw CSV text.
   * @returns {Array<Object>} Parsed data.
   */
  function parseCSV(csvText) {
    const lines = csvText.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",");
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = values[index].trim();
      });
      data.push(entry);
    }
    return data;
  }

  /**
   * Fetches and processes data for the selected reservoir and date.
   */
  async function loadData() {
    const reservoirId = reservoirSelect.value;
    const selectedDate = datePicker.value;

    if (!reservoirId || !selectedDate) {
      alert("請選擇水庫和日期");
      return;
    }

    const selectedYear = new Date(selectedDate).getFullYear();

    // Fetch new data only if reservoir or year has changed
    if (
      reservoirId !== currentLoadedReservoir ||
      selectedYear !== currentLoadedYear
    ) {
      console.log(
        `Loading data for Reservoir ${reservoirId}, Year ${selectedYear}...`
      );

      // Based on the Python script's naming convention, the yearly file is named after the first day of the year.
      const yearStartDate = `${selectedYear}-01-01`;
      const individualFile = `rain_data/${reservoirId}/${reservoirId}_${yearStartDate}.csv`;

      try {
        const individualRes = await fetch(individualFile);

        if (!individualRes.ok)
          throw new Error(`無法載入測站資料: ${individualFile}`);

        const individualText = await individualRes.text();

        // Parse and cache the entire year's data
        const individualData = parseCSV(individualText);
        console.log(`載入 ${individualData.length} 筆測站資料`);

        fullYearStationData = {};
        const stations = new Set();
        individualData.forEach((row) => {
          const station = row.Station_No;
          stations.add(station);
          if (!fullYearStationData[station]) {
            fullYearStationData[station] = [];
          }
          fullYearStationData[station].push({
            // Replace space with 'T' for better cross-browser date parsing consistency
            x: new Date(row.Date_Time.replace(' ', 'T')),
            y: parseFloat(row.RAIN) >= 0 ? parseFloat(row.RAIN) : null,
          });
        });

        // --- 動態計算所有測站的平均雨量 ---
        console.log('正在計算所有測站的平均雨量...');
        const hourlyAverages = new Map(); // Map<timestamp, { sum: number, count: number }>

        // 遍歷所有測站資料，將同一時間點的雨量加總
        Object.values(fullYearStationData).forEach(stationData => {
            stationData.forEach(point => {
                if (point.y !== null && point.y >= 0) {
                    const timeKey = point.x.getTime();
                    if (!hourlyAverages.has(timeKey)) {
                        hourlyAverages.set(timeKey, { sum: 0, count: 0 });
                    }
                    const current = hourlyAverages.get(timeKey);
                    current.sum += point.y;
                    current.count++;
                }
            });
        });

        // 計算平均值並存入 fullYearAvgData
        fullYearAvgData = Array.from(hourlyAverages.entries())
            .map(([timeKey, data]) => ({
                x: new Date(timeKey),
                y: data.count > 0 ? data.sum / data.count : null,
            }))
            .sort((a, b) => a.x - b.x); // 確保資料按時間排序
        console.log(`計算完成，共 ${fullYearAvgData.length} 筆平均雨量資料。`);

        // Update cache trackers
        currentLoadedReservoir = reservoirId;
        currentLoadedYear = selectedYear;

        // Populate station selector
        const currentStation = stationSelect.value;
        stationSelect.innerHTML = "";
        [...stations].sort().forEach((station) => {
          const option = document.createElement("option");
          option.value = station;
          option.textContent = station;
          stationSelect.appendChild(option);
        });
        // Preserve selection if possible
        if ([...stations].includes(currentStation)) {
          stationSelect.value = currentStation;
        }
      } catch (error) {
        console.error("載入資料失敗:", error);
        alert(
          `載入資料失敗，請確認檔案是否存在且網頁是透過伺服器執行。\n檔案名稱應為: ${individualFile}\n錯誤: ${error.message}`
        );
        // Reset cache and clear chart on error
        currentLoadedReservoir = null;
        currentLoadedYear = null;
        fullYearStationData = {};
        fullYearAvgData = [];
        if (chart) {
          chart.data.datasets = [];
          chart.update();
        }
        renderDataTable(); // Clear the table on error
        return; // Stop further execution
      }
    }

    // Always update the chart with the filtered data for the selected date
    updateChart();
  }

  /**
   * Updates the chart based on current selections.
   */
  function updateChart() {
    if (!chart) {
      chart = new Chart(ctx, chartConfig);
    }

    // Reset any hover styles before rebuilding datasets
    originalDatasetStyles = [];

    const selectedStation = stationSelect.value;
    const showAvg = avgToggle.checked;
    const showAllStations = showAllStationsToggle.checked;
    const selectedDateStr = datePicker.value; // "YYYY-MM-DD"
    const numDays = parseInt(daysSelect.value, 10);

    // --- Update Card Header Title ---
    // Highlight marker on map
    // Only highlight if we are not in "show all stations" mode
    if (!showAllStations) {
        highlightStationMarker(selectedStation);
    } else {
        // When showing all stations, reset any highlight and close popups
        highlightStationMarker(null);
    }


    const reservoirText = reservoirSelect.options[reservoirSelect.selectedIndex].text;
    document.getElementById('selected-reservoir').textContent = `${reservoirText} `;
    if (showAllStations) {
        document.getElementById('selected-station').textContent = '所有測站 ';
    } else {
        document.getElementById('selected-station').textContent = selectedStation ? `${selectedStation} ` : '';
    }

    // Calculate date range
    const startDate = new Date(selectedDateStr + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + numDays);

    const datasets = [];

    // Helper function to filter data for the date range
    const filterByDateRange = (data) => {
      if (!data) return [];
      return data.filter(d => d.x >= startDate && d.x < endDate);
    };

    // Add selected station data
    if (showAllStations) {
        // Show all stations
        const stationIds = Object.keys(fullYearStationData).sort();
        stationIds.forEach((stationId, index) => {
            if (fullYearStationData[stationId]) {
                const stationColor = getColor(index);
                datasets.push({
                    label: `測站 ${stationId}`,
                    data: filterByDateRange(fullYearStationData[stationId]),
                    borderColor: stationColor,
                    backgroundColor: getBackgroundColor(stationColor),
                    borderWidth: 1,
                });
            }
        });
    } else if (selectedStation && fullYearStationData[selectedStation]) {
        // Show only the selected station
        const stationDataForRange = filterByDateRange(fullYearStationData[selectedStation]);
        datasets.push({
            label: `測站 ${selectedStation}`,
            data: stationDataForRange,
            borderColor: "rgba(54, 162, 235, 1)",
            backgroundColor: "rgba(54, 162, 235, 0.5)",
            borderWidth: 1,
        });
    }

    // Add average data if toggled
    if (showAvg && fullYearAvgData.length > 0) {
      // Create a dense dataset to ensure tooltips show '0' for missing data points.
      const avgDataForRange = filterByDateRange(fullYearAvgData);
      const denseAvgData = densifyHourlyData(avgDataForRange, startDate, endDate);
      datasets.push({
        type: 'line', // Overlay as a line chart
        label: "平均雨量",
        data: denseAvgData,
        borderColor: "rgba(255, 99, 132, 1)",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        borderWidth: 2,
        pointRadius: 2,
        borderDash: [5, 5],
        tension: 0.1,
        fill: false,
      });
    }

    chart.data.datasets = datasets;
    
    // --- 動態計算Y軸最大值 ---
    let maxVisibleValue = 0;
    datasets.forEach(dataset => {
      dataset.data.forEach(point => {
        if (point.y !== null && point.y > maxVisibleValue) {
          maxVisibleValue = point.y;
        }
      });
    });

    // 將 Y 軸最大值設為最大雨量的 1.33 倍，並向上取整數。
    // 如果沒有資料 (maxVisibleValue為0)，則讓 Chart.js 自動調整。
    const newYMax = maxVisibleValue > 0 ? Math.ceil(maxVisibleValue * 1.33) : undefined;
    chart.options.scales.y.max = newYMax;

    // Update chart title with date range and total rainfall
    let titleText;
    if (numDays > 1) {
        const lastDayOfRange = new Date(endDate);
        lastDayOfRange.setDate(endDate.getDate() - 1);
        const endYear = lastDayOfRange.getFullYear();
        const endMonth = (lastDayOfRange.getMonth() + 1).toString().padStart(2, '0');
        const endDay = lastDayOfRange.getDate().toString().padStart(2, '0');
        const endDateStr = `${endYear}-${endMonth}-${endDay}`;
        titleText = `雨量時間序列圖 - ${selectedDateStr} to ${endDateStr}`;
    } else {
        titleText = `雨量時間序列圖 - ${selectedDateStr}`;
    }

    if (!showAllStations && selectedStation && fullYearStationData[selectedStation]) {
      const stationDataForRange = filterByDateRange(fullYearStationData[selectedStation]);
      const rangeTotal = stationDataForRange.reduce((sum, dataPoint) => {
        if (dataPoint.y !== null && dataPoint.y > 0) {
          return sum + dataPoint.y;
        }
        return sum;
      }, 0);
      titleText += ` (測站 ${selectedStation} 總雨量: ${rangeTotal.toFixed(1)} mm)`;
    }
    chart.options.plugins.title.text = titleText;

    // --- Calculate and display total average rainfall in the top-right corner ---
    if (showAvg && fullYearAvgData.length > 0) {
        const avgDataForRange = filterByDateRange(fullYearAvgData);
        const avgTotal = avgDataForRange.reduce((sum, dataPoint) => {
            // Ensure we only sum up positive numbers
            return sum + (dataPoint.y > 0 ? dataPoint.y : 0);
        }, 0);

        // Only show the display if there is a total to show
        if (avgTotal > 0) {
            avgTotalDisplay.innerHTML = `期間平均總雨量: <strong>${avgTotal.toFixed(1)} mm</strong>`;
            avgTotalDisplay.style.display = 'block';
        } else {
            avgTotalDisplay.style.display = 'none';
        }
    } else {
        // Hide the display if the average toggle is off
        avgTotalDisplay.style.display = 'none';
    }

    // Dynamically adjust x-axis unit
    if (numDays > 2) {
        chart.options.scales.x.time.unit = 'day';
    } else {
        chart.options.scales.x.time.unit = 'hour';
    }

    chart.update();
    // After updating the chart, update the map marker colors
    updateStationMarkerColors(startDate, endDate);

    renderDataTable();
  }

  /**
   * Updates the color of station markers on the map based on their rainfall
   * compared to the average rainfall for the selected period.
   * @param {Date} startDate - The start of the date range.
   * @param {Date} endDate - The end of the date range.
   */
  function updateStationMarkerColors(startDate, endDate) {
      const showAvg = avgToggle.checked;

      // If 'show average' is off, reset all markers to default and exit
      if (!showAvg) {
          Object.values(stationMarkers).forEach(marker => marker.setIcon(defaultIcon));
          return;
      }

      const filterByDateRange = (data) => {
          if (!data) return [];
          return data.filter(d => d.x >= startDate && d.x < endDate);
      };

      // Calculate total average rainfall for the period
      const avgDataForRange = filterByDateRange(fullYearAvgData);
      const avgTotal = avgDataForRange.reduce((sum, dataPoint) => sum + (dataPoint.y > 0 ? dataPoint.y : 0), 0);

      // Iterate through each station and update its marker color
      Object.keys(fullYearStationData).forEach(stationId => {
          const marker = stationMarkers[stationId];
          if (!marker) return; // Skip if marker doesn't exist

          const stationDataForRange = filterByDateRange(fullYearStationData[stationId]);
          const stationTotal = stationDataForRange.reduce((sum, dataPoint) => sum + (dataPoint.y > 0 ? dataPoint.y : 0), 0);

          if (stationTotal > 0) {
              if (stationTotal > avgTotal) {
                  marker.setIcon(aboveAverageIcon);
              } else {
                  marker.setIcon(belowAverageIcon);
              }
          } else {
              marker.setIcon(noDataIcon);
          }
      });
  }

  /**
   * Renders a data table below the chart with hourly data for all stations.
   */
  function renderDataTable() {
    const tableContainer = document.getElementById('data-table-container');
    const showAvg = avgToggle.checked;
    const selectedDateStr = datePicker.value;
    const numDays = parseInt(daysSelect.value, 10);

    // If no data is loaded, clear the table and return
    if (Object.keys(fullYearStationData).length === 0) {
        tableContainer.innerHTML = '<div class="text-center text-muted p-3">此範圍無資料可列表顯示。</div>';
        return;
    }

    const startDate = new Date(selectedDateStr + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + numDays);

    const stationIds = Object.keys(fullYearStationData).sort();
    const timeMap = new Map();

    // Helper to format date consistently
    const formatTimeKey = (date) => date.toISOString();

    // Populate map with station data
    stationIds.forEach(id => {
        const stationData = fullYearStationData[id] || [];
        stationData.forEach(point => {
            if (point.x >= startDate && point.x < endDate) {
                const timeKey = formatTimeKey(point.x);
                if (!timeMap.has(timeKey)) timeMap.set(timeKey, {});
                timeMap.get(timeKey)[id] = point.y;
            }
        });
    });

    // Populate map with average data
    if (showAvg) {
        fullYearAvgData.forEach(point => {
            if (point.x >= startDate && point.x < endDate) {
                const timeKey = formatTimeKey(point.x);
                if (!timeMap.has(timeKey)) timeMap.set(timeKey, {});
                timeMap.get(timeKey)['Avg_Rain'] = point.y;
            }
        });
    }

    const sortedTimes = Array.from(timeMap.keys()).sort();

    if (sortedTimes.length === 0) {
        tableContainer.innerHTML = '<div class="text-center text-muted p-3">此範圍無資料可列表顯示。</div>';
        return;
    }

    // --- Find the top three values in the current view ---
    const allValues = [];
    sortedTimes.forEach(timeKey => {
        const rowData = timeMap.get(timeKey);
        Object.values(rowData).forEach(value => {
            if (value !== null && value !== undefined && value > 0) {
                allValues.push(value);
            }
        });
    });

    // Get unique values, sort descending, and take the top 3
    const topThreeValues = [...new Set(allValues)]
        .sort((a, b) => b - a)
        .slice(0, 3);
    const [firstMax, secondMax, thirdMax] = topThreeValues;

    const getClassForValue = (value) => {
        if (value === undefined || value === null || value <= 0) return '';
        if (value === firstMax) return ' class="bg-warning fw-bold"';
        if (value === secondMax) return ' class="bg-success-subtle"';
        if (value === thirdMax) return ' class="bg-info-subtle"';
        return '';
    };
    // --- Calculate totals for the footer ---
    const totals = {};
    stationIds.forEach(id => { totals[id] = 0; });
    if (showAvg) {
        totals['Avg_Rain'] = 0;
    }

    sortedTimes.forEach(timeKey => {
        const rowData = timeMap.get(timeKey);
        stationIds.forEach(id => {
            const value = rowData[id];
            if (value !== null && value !== undefined && value > 0) {
                totals[id] += value;
            }
        });
        if (showAvg) {
            const avgValue = rowData['Avg_Rain'];
            if (avgValue !== null && avgValue !== undefined && avgValue > 0) {
                totals['Avg_Rain'] += avgValue;
            }
        }
    });

    // Build table HTML
    let tableHtml = '<table class="table table-striped table-bordered table-hover table-sm"><thead><tr class="table-light"><th>時間</th>';
    stationIds.forEach(id => { tableHtml += `<th>${id}</th>`; });
    if (showAvg) { tableHtml += '<th>平均雨量</th>'; }
    tableHtml += '</tr></thead><tbody>';

    sortedTimes.forEach(timeKey => {
        const date = new Date(timeKey);
        const formattedTime = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        tableHtml += `<tr><td>${formattedTime}</td>`;
        const rowData = timeMap.get(timeKey);
        stationIds.forEach(id => {
            const value = rowData[id];
            const cellClass = getClassForValue(value);
            tableHtml += `<td${cellClass}>${(value !== null && value !== undefined) ? value.toFixed(1) : '-'}</td>`;
        });
        if (showAvg) {
            const avgValue = rowData['Avg_Rain'];
            const cellClass = getClassForValue(avgValue);
            tableHtml += `<td${cellClass}>${(avgValue !== null && avgValue !== undefined) ? avgValue.toFixed(1) : '-'}</td>`;
        }
        tableHtml += '</tr>';
    });

    // --- Build total row as the last row in tbody ---
    // Using border-top to visually separate it, similar to a tfoot.
    tableHtml += '<tr class="table-info fw-bold border-top">';
    tableHtml += '<td>總雨量 (&gt;0)</td>';
    stationIds.forEach(id => {
        tableHtml += `<td>${totals[id].toFixed(1)}</td>`;
    });
    if (showAvg) {
        tableHtml += `<td>${totals['Avg_Rain'].toFixed(1)}</td>`;
    }
    tableHtml += '</tr>';

    tableHtml += '</tbody></table>';
    tableContainer.innerHTML = tableHtml;
  }

  /**
   * Generates CSV content from the currently displayed data table.
   * @returns {string|null} The CSV content as a string, or null if no data.
   */
  function generateCSVContent() {
    const showAvg = avgToggle.checked;
    const selectedDateStr = datePicker.value;
    const numDays = parseInt(daysSelect.value, 10);

    if (Object.keys(fullYearStationData).length === 0) {
        return null;
    }

    const startDate = new Date(selectedDateStr + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + numDays);

    const stationIds = Object.keys(fullYearStationData).sort();
    const timeMap = new Map();
    const formatTimeKey = (date) => date.toISOString();

    // Populate map with station data
    stationIds.forEach(id => {
        const stationData = fullYearStationData[id] || [];
        stationData.forEach(point => {
            if (point.x >= startDate && point.x < endDate) {
                const timeKey = formatTimeKey(point.x);
                if (!timeMap.has(timeKey)) timeMap.set(timeKey, {});
                timeMap.get(timeKey)[id] = point.y;
            }
        });
    });

    // Populate map with average data
    if (showAvg) {
        fullYearAvgData.forEach(point => {
            if (point.x >= startDate && point.x < endDate) {
                const timeKey = formatTimeKey(point.x);
                if (!timeMap.has(timeKey)) timeMap.set(timeKey, {});
                timeMap.get(timeKey)['Avg_Rain'] = point.y;
            }
        });
    }

    const sortedTimes = Array.from(timeMap.keys()).sort();
    if (sortedTimes.length === 0) {
        return null;
    }

    const csvRows = [];
    
    // Header row
    const header = ['時間', ...stationIds];
    if (showAvg) {
        header.push('平均雨量');
    }
    csvRows.push(header.join(','));

    // Data rows
    sortedTimes.forEach(timeKey => {
        const date = new Date(timeKey);
        const formattedTime = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        const row = [formattedTime];
        const rowData = timeMap.get(timeKey);
        
        stationIds.forEach(id => {
            const value = rowData[id];
            row.push((value !== null && value !== undefined) ? value.toFixed(1) : '');
        });
        
        if (showAvg) {
            const avgValue = rowData['Avg_Rain'];
            row.push((avgValue !== null && avgValue !== undefined) ? avgValue.toFixed(1) : '');
        }
        csvRows.push(row.join(','));
    });

    // Re-calculate totals for the CSV
    const totals = {};
    stationIds.forEach(id => { totals[id] = 0; });
    if (showAvg) { totals['Avg_Rain'] = 0; }
    sortedTimes.forEach(timeKey => {
        const rowData = timeMap.get(timeKey);
        Object.keys(rowData).forEach(key => {
            if (rowData[key] > 0) totals[key] += rowData[key];
        });
    });
    const totalRow = ['總雨量 (>0)', ...stationIds.map(id => totals[id].toFixed(1))];
    if (showAvg) { totalRow.push(totals['Avg_Rain'].toFixed(1)); }
    csvRows.push(totalRow.join(','));

    // Add BOM for Excel compatibility with UTF-8
    return '\uFEFF' + csvRows.join('\n');
  }

  /**
   * Finds and navigates to the Nth largest daily rainfall day.
   * @param {number} rank - The rank of the day to find (1 for max, 2 for 2nd max, etc.).
   * @param {string} source - The data source to use ('avg' or 'station_max').
   */
  function findRankedDailyRainfall(rank, source) {
      if (Object.keys(fullYearStationData).length === 0) {
          infoToastBody.innerHTML = '請先載入資料，才能尋找日雨量。';
          infoToast.show();
          return;
      }
  
      let sortedDays;
      let resultDay, resultRain, resultExtraInfo = '';
  
      if (source === 'avg') {
          // --- Logic for Catchment Average ---
          if (fullYearAvgData.length === 0) {
              infoToastBody.innerHTML = '無集水區平均資料可供計算。';
              infoToast.show();
              return;
          }
          const dailyTotals = new Map();
          fullYearAvgData.forEach(point => {
              if (point.y !== null && point.y > 0) {
                  const dayKey = getDayKey(point.x);
                  const currentTotal = dailyTotals.get(dayKey) || 0;
                  dailyTotals.set(dayKey, currentTotal + point.y);
              }
          });
          sortedDays = Array.from(dailyTotals.entries()).sort((a, b) => b[1] - a[1]);
          
          if (rank > sortedDays.length) {
              infoToastBody.innerHTML = `資料不足，找不到第 ${rank} 大日雨量。<br>此年份只有 ${sortedDays.length} 天有降雨紀錄。`;
              infoToast.show();
              return;
          }
          [resultDay, resultRain] = sortedDays[rank - 1];
  
      } else if (source === 'station_max') {
          // --- Logic for Single Station Maximum ---
          const dailyTotalsByStationAndDay = new Map(); // Key: dayKey, Value: Map(stationId -> totalRain)
  
          for (const stationId in fullYearStationData) {
              fullYearStationData[stationId].forEach(point => {
                  if (point.y !== null && point.y > 0) {
                      const dayKey = getDayKey(point.x);
                      if (!dailyTotalsByStationAndDay.has(dayKey)) {
                          dailyTotalsByStationAndDay.set(dayKey, new Map());
                      }
                      const stationTotalsForDay = dailyTotalsByStationAndDay.get(dayKey);
                      const currentStationTotal = stationTotalsForDay.get(stationId) || 0;
                      stationTotalsForDay.set(stationId, currentStationTotal + point.y);
                  }
              });
          }
          const mappedSortedDays = Array.from(dailyTotalsByStationAndDay.entries()).map(([day, stationTotals]) => {
              const [station, rain] = [...stationTotals.entries()].reduce((max, current) => current[1] > max[1] ? current : max, ['', -1]);
              return { day, rain, station };
          })
              .map(([day, data]) => ({ day, ...data }))
              .sort((a, b) => b.rain - a.rain);
  
          if (rank > mappedSortedDays.length) {
              infoToastBody.innerHTML = `資料不足，找不到第 ${rank} 大日雨量。<br>此年份只有 ${mappedSortedDays.length} 天有降雨紀錄。`;
              infoToast.show();
              return;
          }
  
          const target = mappedSortedDays[rank - 1];
          resultDay = target.day;
          resultRain = target.rain;
          resultExtraInfo = `<br>測站: <strong>${target.station}</strong>`;
      } else {
          return; // Invalid source
      }
  
      // --- Update UI ---
      if (resultDay) {
          infoToastBody.innerHTML = `找到第 ${rank} 大日雨量！<br>
                                     日期: <strong>${resultDay}</strong><br>
                                     總雨量: <strong>${resultRain.toFixed(1)} mm</strong>${resultExtraInfo}<br><br>
                                     正在更新圖表...`;
          infoToast.show();
  
          datePicker.value = resultDay;
          loadData();
      }
  }
  /**
   * Highlights a dataset in the chart corresponding to a station ID.
   * This is triggered by hovering over a map marker.
   * @param {string} stationId - The ID of the station to highlight.
   */
  function highlightChartDataset(stationId) {
    if (!chart || !showAllStationsToggle.checked) {
        return; // Only works when chart is ready and in "show all" mode
    }

    // Store original styles if we haven't already for this hover sequence
    if (originalDatasetStyles.length === 0 && chart.data.datasets.length > 0) {
        originalDatasetStyles = chart.data.datasets.map(ds => ({
            borderWidth: ds.borderWidth,
            backgroundColor: ds.backgroundColor,
        }));
    }

    chart.data.datasets.forEach((dataset, index) => {
        // Skip non-station datasets like 'Average Rainfall'
        if (!dataset.label.startsWith('測站 ')) return;

        const datasetStationId = dataset.label.split(' ')[1];

        if (datasetStationId === stationId) {
            // Highlight: thicker border, more opaque background
            dataset.borderWidth = 3;
            dataset.backgroundColor = dataset.borderColor.replace(', 1)', ', 0.7)');
        } else {
            // De-emphasize: default border, more transparent background
            dataset.borderWidth = 1;
            dataset.backgroundColor = dataset.borderColor.replace(', 1)', ', 0.1)');
        }
    });

    chart.update('none'); // Use 'none' for animation to make it instant
  }

  /**
   * Resets all chart datasets to their original styles after a hover ends.
   */
  function resetChartDatasetStyles() {
    if (!chart || originalDatasetStyles.length === 0) {
        return;
    }

    chart.data.datasets.forEach((dataset, index) => {
        if (originalDatasetStyles[index]) {
            // Restore the saved properties
            dataset.borderWidth = originalDatasetStyles[index].borderWidth;
            dataset.backgroundColor = originalDatasetStyles[index].backgroundColor;
        }
    });

    // Clear the stored styles and update the chart
    originalDatasetStyles = [];
    chart.update('none');
  }

  /**
   * Highlights a specific station marker on the map and resets others.
   * @param {string|null} stationId - The ID of the station to highlight, or null to reset all.
   */
  function highlightStationMarker(stationId) {
      // Do not reset all icons here, as their color is now meaningful.
      // The color is managed by updateStationMarkerColors.
      // We only manage the 'highlighted' state here.
      Object.keys(stationMarkers).forEach(id => {
          if (stationMarkers[id] && stationMarkers[id].options.icon === highlightedIcon) {
              stationMarkers[id].setIcon(defaultIcon);
          }
      });

      // If a specific station is selected and exists, highlight it
      if (stationId && stationMarkers[stationId]) {
          const markerToHighlight = stationMarkers[stationId];
          markerToHighlight.setIcon(highlightedIcon);
          markerToHighlight.openPopup();
          map.panTo(markerToHighlight.getLatLng());
      } else {
          // If no station is selected (or in "show all" mode), close any open popups
          map.closePopup();
      }
  }


  // --- Event Listeners ---
  stationSelect.addEventListener("change", updateChart);
  daysSelect.addEventListener("change", updateChart);
  avgToggle.addEventListener("change", updateChart);

  showAllStationsToggle.addEventListener("change", () => {
    stationSelect.disabled = showAllStationsToggle.checked;
    updateChart();
  });

  // Chain data loading and map loading for reservoir changes
  reservoirSelect.addEventListener("change", async () => {
    // Reset map markers to default immediately for better UX
    Object.values(stationMarkers).forEach(marker => marker.setIcon(defaultIcon));
    await loadMapData(); // Load new markers and boundaries
    await loadData(); // Load new data, which will trigger chart and marker color updates
  });

  datePicker.addEventListener("change", loadData);

  downloadCsvBtn.addEventListener('click', () => {
    const csvContent = generateCSVContent();
    if (csvContent) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        
        const reservoirId = reservoirSelect.value;
        const date = datePicker.value;
        const days = daysSelect.value;
        link.setAttribute("download", `rainfall_data_${reservoirId}_${date}_${days}d.csv`);
        
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } else {
        infoToastBody.innerHTML = '沒有可供下載的資料。';
        infoToast.show();
    }
  });

  findRainDayDropdown.addEventListener('click', (event) => {
    event.preventDefault();
    const target = event.target.closest('a.dropdown-item');
    if (target) {
        const rank = parseInt(target.dataset.rank, 10);
        const source = target.dataset.source;
        if (!isNaN(rank) && source) {
            findRankedDailyRainfall(rank, source);
        }
    }
  });

  toggleLayoutBtn.addEventListener('click', () => {
    // Check current state by looking at the class of the chart column
    const isSideBySide = chartCol.classList.contains('col-md-8');

    if (isSideBySide) {
        // --- Switch to STACKED layout ---
        chartCol.classList.replace('col-md-8', 'col-12');
        
        mapCol.classList.replace('col-md-4', 'col-12');
        mapCol.classList.add('mt-4'); // Add margin top to the map column for spacing

        // The map's parent card is h-100, which is for side-by-side. Remove it.
        mapCol.querySelector('.card').classList.remove('h-100');
        
        // The map itself needs a defined height now that it's not in a h-100 flex container.
        // Match it to the chart's container height for consistency.
        mapContainer.style.height = '450px';

        // toggleLayoutBtn.textContent = '切換為並排版面'; // Text is now static
    } else {
        // --- Switch back to SIDE-BY-SIDE layout ---
        chartCol.classList.replace('col-12', 'col-md-8');

        mapCol.classList.replace('col-12', 'col-md-4');
        mapCol.classList.remove('mt-4');

        // Restore h-100 for the card to make it fill the height of the row
        mapCol.querySelector('.card').classList.add('h-100');

        // Remove the fixed height to let flexbox (h-100 and flex-grow-1) take over again
        mapContainer.style.height = ''; 

        // toggleLayoutBtn.textContent = '切換為堆疊版面'; // Text is now static
    }

    // IMPORTANT: Invalidate map and chart size after a short delay to allow the DOM to update.
    // This ensures they redraw correctly in their new containers.
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
        }
        if (chart) {
            chart.resize();
        }
    }, 250); // A small delay is safer for DOM reflow
  });

  exportBtn.addEventListener("click", () => {
    if (chart) {
      const url = chart.toBase64Image("image/png");
      const link = document.createElement("a");
      link.href = url;
      const reservoirId = reservoirSelect.value;
      const date = datePicker.value;
      link.download = `rainfall_chart_${reservoirId}_${date}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  });

  /**
   * Finds the day with the maximum average rainfall from the loaded yearly data.
   * @returns {string|null} The date string 'YYYY-MM-DD' of the max rainfall day, or null if not found.
   */
  function findMaxAvgRainfallDay() {
      if (fullYearAvgData.length === 0) {
          return null;
      }
      const dailyTotals = new Map();
      fullYearAvgData.forEach(point => {
          if (point.y !== null && point.y > 0) {
              const dayKey = getDayKey(point.x); // 'YYYY-MM-DD'
              const currentTotal = dailyTotals.get(dayKey) || 0;
              dailyTotals.set(dayKey, currentTotal + point.y);
          }
      });

      if (dailyTotals.size === 0) {
          return null; // No rainy days found
      }

      // Find the day with the maximum rainfall by converting map to array and sorting
      const sortedDays = Array.from(dailyTotals.entries()).sort((a, b) => b[1] - a[1]);
      return sortedDays[0][0]; // Return the date string of the top day
  }

  // --- Initial Load ---
  async function initializeApp() {
    await loadData(); // Load data for the default date (and thus the whole year)
    const maxRainDay = findMaxAvgRainfallDay();
    if (maxRainDay) {
        datePicker.value = maxRainDay;
        updateChart(); // Update the chart to show the max rain day
    }
  }

  // --- Map Initialization ---
  // Define base map layers
  const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });

  const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

  const terrainMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
  });

  const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
  });

  const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
  });

  const nlscEMAP = L.tileLayer('https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}', {
      attribution: '© <a href="https://maps.nlsc.gov.tw/">國土測繪中心</a>'
  });

  const baseLayers = {
      "街道圖": streetMap,
      "衛星航照圖": satelliteMap,
      "地形圖": terrainMap,
      "淺色底圖 (CARTO)": cartoLight,
      "深色底圖 (CARTO)": cartoDark,
      "台灣通用電子地圖 (NLSC)": nlscEMAP
  };

  // Initialize map with a default layer
  const map = L.map('map', {
      center: [24.7, 121.4],
      zoom: 10,
      layers: [nlscEMAP], // Set "台灣通用電子地圖" as the default
      zoomControl: false, // 隱藏放大縮小按鈕
  });

  // Add layer control to the map
  L.control.layers(baseLayers).addTo(map);

  // --- Custom Legend Control ---
  const legend = L.control({ position: 'bottomright' });

  legend.onAdd = function (map) {
      const div = L.DomUtil.create('div', 'info legend');
      const items = {
          '高於平均': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
          '低於平均': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
          '無資料': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png'
      };

      let labels = ['<h5>圖例</h5>'];
      for (const label in items) {
          labels.push(
              `<div><img src="${items[label]}" class="legend-icon"> ${label}</div>`
          );
      }

      div.innerHTML = labels.join('');
      return div;
  };

  legend.addTo(map);


  // --- Custom "Home" button to reset view ---
  const HomeControl = L.Control.extend({
      options: {
          position: 'topleft'
      },
      onAdd: function (map) {
          const container = L.DomUtil.create('a', 'leaflet-bar leaflet-control leaflet-control-home');
          container.href = '#';
          container.title = '返回預設視野';
          container.setAttribute('role', 'button');
          container.innerHTML = '&#8962;'; // Unicode house character

          L.DomEvent.on(container, 'click', L.DomEvent.stopPropagation)
                    .on(container, 'click', L.DomEvent.preventDefault)
                    .on(container, 'click', () => {
                        if (initialMapBounds) {
                            map.fitBounds(initialMapBounds);
                        }
                    });
          return container;
      }
  });
  map.addControl(new HomeControl());

  // Add a scale bar to the map (metric units)
  L.control.scale({ imperial: false, metric: true, position: 'topleft' }).addTo(map);

  // --- Custom Control for Mouse Coordinates ---
  const coordinatesControl = L.control({ position: 'bottomright' });

  coordinatesControl.onAdd = function (map) {
      this._div = L.DomUtil.create('div', 'info coordinates'); // 建立一個帶有 class 的 div
      this.update();
      return this._div;
  };

  coordinatesControl.update = function (latlng) {
      const lat = latlng ? latlng.lat.toFixed(5) : 'N/A';
      const lng = latlng ? latlng.lng.toFixed(5) : 'N/A';
      this._div.innerHTML = `緯度: ${lat}<br>經度: ${lng}`;
  };

  coordinatesControl.addTo(map);

  // 監聽地圖上的滑鼠移動事件
  map.on('mousemove', (e) => {
      coordinatesControl.update(e.latlng);
  });
  map.on('mouseout', () => coordinatesControl.update()); // 滑鼠移出地圖時清空座標

  async function loadMapData() {
    const reservoirId = reservoirSelect.value;
    const stationFile = `rain_data/${reservoirId}/rstbase.json`;
    const areaFile = `rain_data/${reservoirId}/Area.json`;

    try {
      const [stationRes, areaRes] = await Promise.all([
        fetch(stationFile),
        fetch(areaFile),
      ]);

      if (!stationRes.ok) throw new Error(`無法載入測站位置資料: ${stationFile}`);
      if (!areaRes.ok) throw new Error(`無法載入集水區邊界資料: ${areaFile}`);

      const stationData = await stationRes.json();
      const areaData = await areaRes.json();

      // Clear existing layers
      map.eachLayer((layer) => {
        if (!!layer.toGeoJSON) {
          map.removeLayer(layer);
        }
      });
      stationMarkers = {}; // Reset our marker references

      // Add station markers
      stationData.Rstbase.forEach(station => {
        const marker = L.marker([station.GpsLat, station.GpsLong], { icon: defaultIcon })
          .addTo(map)
          .bindPopup(`<b>${station.NameC}</b><br>${station.code}`);
        stationMarkers[station.code] = marker;

        // Add mouseover/mouseout event listeners for chart interaction
        marker.on('mouseover', () => {
            highlightChartDataset(station.code);
        });
        marker.on('mouseout', () => {
            resetChartDatasetStyles();
        });

        // Add click event listener to update the dropdown
        marker.on('click', () => {
            // If "Show all stations" is active, deactivate it
            if (showAllStationsToggle.checked) {
                showAllStationsToggle.checked = false;
                stationSelect.disabled = false;
            }
            
            // Set the dropdown value to the clicked station's code
            stationSelect.value = station.code;

            // Manually trigger the update logic that would normally fire on dropdown change
            updateChart();
        });
      });
      
      // Add area polygon
      const latlngs = areaData.Border.map(point => [point.Lat, point.Lng]);
      const areaPolygon = L.polygon(latlngs, { color: 'blue' }).addTo(map);

      // Fit map to bounds
      initialMapBounds = areaPolygon.getBounds(); // Store for home button
      map.fitBounds(initialMapBounds);

    } catch (error) {
      console.error("載入地圖資料失敗:", error);
      alert(`載入地圖資料失敗: ${error.message}`);
    }
  }

  initializeApp();
  loadMapData();
});
