import { bindInteractiveSelection, CONTINENT_COLORS, createChartTransition, formatOneDecimal } from "./chartUtils.js";

const HEATMAP_METRICS = [
  {
    key: "affectedShare",
    label: "Burden Ratio",
    note: "affected/pop",
    shortFormat: (value) => `${value.toFixed(2)}x`,
    longFormat: (value) => `${value.toFixed(2)}x of population`,
  },
  {
    key: "avgClimateRiskScore",
    label: "Risk Score",
    note: "avg score",
    shortFormat: (value) => `${Math.round(value)}`,
    longFormat: (value) => `${formatOneDecimal(value)} average score`,
  },
  {
    key: "avgTemperatureChangeC",
    label: "Temp Change",
    note: "deg C",
    shortFormat: (value) => `${value.toFixed(1)}`,
    longFormat: (value) => `${formatOneDecimal(value)} C average change`,
  },
  {
    key: "avgHeatwaveDays",
    label: "Heatwaves",
    note: "days",
    shortFormat: (value) => `${Math.round(value)}d`,
    longFormat: (value) => `${formatOneDecimal(value)} average heatwave days`,
  },
  {
    key: "avgWildfireIncidents",
    label: "Wildfires",
    note: "incidents",
    shortFormat: (value) => `${Math.round(value)}`,
    longFormat: (value) => `${formatOneDecimal(value)} average incidents`,
  },
  {
    key: "avgAirQualityIndex",
    label: "Air Quality",
    note: "AQI",
    shortFormat: (value) => `${Math.round(value)}`,
    longFormat: (value) => `${formatOneDecimal(value)} average AQI`,
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default class HeatmapChart {
  constructor({ selector, dispatcher, referenceData }) {
    this.root = d3.select(selector);
    this.dispatcher = dispatcher;
    this.referenceData = referenceData;

    this.margin = { top: 120, right: 24, bottom: 92, left: 210 };
    this.transition = createChartTransition();
    this.metrics = HEATMAP_METRICS;

    this.svg = this.root.append("svg").attr("class", "chart-svg").attr("role", "img");
    this.defs = this.svg.append("defs");
    this.plot = this.svg.append("g");

    this.columnLayer = this.plot.append("g").attr("class", "heatmap-column-layer");
    this.gridLayer = this.plot.append("g").attr("class", "heatmap-grid-layer");
    this.countryLabelLayer = this.plot.append("g").attr("class", "heatmap-country-layer");
    this.cellLayer = this.plot.append("g").attr("class", "heatmap-cell-layer");
    this.valueLayer = this.plot.append("g").attr("class", "heatmap-value-layer");
    this.legendLayer = this.svg.append("g").attr("class", "heatmap-legend-layer");
    this.emptyLabel = this.plot.append("text").attr("class", "empty-state").attr("opacity", 0);

    this.x = d3.scaleBand().paddingInner(0.08).paddingOuter(0.02);
    this.y = d3.scaleBand().paddingInner(0.12).paddingOuter(0.02);
    this.color = d3
      .scaleLinear()
      .domain([0, 0.5, 1])
      .range(["#edf4ee", "#89a78e", "#5f7d66"])
      .interpolate(d3.interpolateRgb);

    this.metricDomains = this.createMetricDomains(referenceData);
    this.state = {};
    this.gradientId = `heatmap-gradient-${Math.random().toString(36).slice(2, 8)}`;
    this.createLegendGradient();

    window.addEventListener("resize", () => {
      if (this.lastData) {
        this.update(this.lastData, this.state);
      }
    });
  }

  update(data, state) {
    this.lastData = data;
    this.state = { ...state };

    const chartData = [...data].sort((a, b) => d3.descending(a.affectedShare ?? -Infinity, b.affectedShare ?? -Infinity));
    const { width, height, innerWidth, innerHeight } = this.getDimensions(chartData.length);

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);
    this.svg.attr(
      "aria-label",
      "Heatmap showing a normalized climate fingerprint for each country across six burden metrics."
    );
    this.plot.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

    this.x.domain(this.metrics.map((metric) => metric.key)).range([0, innerWidth]);
    this.y.domain(chartData.map((row) => row.country)).range([0, innerHeight]);

    if (!chartData.length) {
      this.renderEmpty(innerWidth, innerHeight);
      return;
    }

    this.emptyLabel.attr("opacity", 0);

    this.renderColumnHeaders();
    this.renderRowGuides(chartData, innerWidth);
    this.renderCountryLabels(chartData);
    this.renderCells(chartData);
    this.renderLegend(width, height);
    this.updateHighlighting();
  }

  setInteractionState(state) {
    this.state = { ...state };
    this.updateHighlighting();
  }

  createMetricDomains(data) {
    return new Map(
      this.metrics.map((metric) => {
        const values = data.map((row) => row[metric.key]).filter(Number.isFinite);
        return [metric.key, d3.extent(values)];
      })
    );
  }

  createLegendGradient() {
    const gradient = this.defs
      .append("linearGradient")
      .attr("id", this.gradientId)
      .attr("x1", "0%")
      .attr("x2", "100%")
      .attr("y1", "0%")
      .attr("y2", "0%");

    gradient.append("stop").attr("offset", "0%").attr("stop-color", this.color(0));
    gradient.append("stop").attr("offset", "50%").attr("stop-color", this.color(0.5));
    gradient.append("stop").attr("offset", "100%").attr("stop-color", this.color(1));
  }

  renderColumnHeaders() {
    const headers = this.columnLayer.selectAll("g.heatmap-column").data(this.metrics, (metric) => metric.key);

    headers.exit().remove();

    const headersEnter = headers.enter().append("g").attr("class", "heatmap-column");
    headersEnter.append("text").attr("class", "heatmap-metric-label").attr("text-anchor", "middle");
    headersEnter.append("text").attr("class", "heatmap-metric-note").attr("text-anchor", "middle");

    headersEnter
      .merge(headers)
      .attr("transform", (metric) => `translate(${(this.x(metric.key) || 0) + this.x.bandwidth() / 2}, -30)`);

    this.columnLayer
      .selectAll("text.heatmap-metric-label")
      .text((metric) => metric.label);

    this.columnLayer
      .selectAll("text.heatmap-metric-note")
      .attr("y", 16)
      .text((metric) => metric.note);
  }

  renderRowGuides(chartData, innerWidth) {
    const guides = this.gridLayer.selectAll("line.heatmap-row-divider").data(chartData, (row) => row.country);

    guides.exit().remove();

    guides
      .enter()
      .append("line")
      .attr("class", "heatmap-row-divider")
      .merge(guides)
      .transition(this.transition)
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (row) => (this.y(row.country) || 0) + this.y.bandwidth() + 6)
      .attr("y2", (row) => (this.y(row.country) || 0) + this.y.bandwidth() + 6);
  }

  renderCountryLabels(chartData) {
    const labels = this.countryLabelLayer
      .selectAll("g.heatmap-country-label-group")
      .data(chartData, (row) => row.country);

    labels.exit().remove();

    const labelsEnter = labels.enter().append("g").attr("class", "heatmap-country-label-group");
    labelsEnter.append("circle").attr("class", "heatmap-country-dot").attr("r", 6);
    labelsEnter
      .append("text")
      .attr("class", "heatmap-country-label")
      .attr("text-anchor", "start");
    labelsEnter
      .append("text")
      .attr("class", "heatmap-country-rank")
      .attr("text-anchor", "start");

    const mergedLabels = labelsEnter.merge(labels);

    bindInteractiveSelection(mergedLabels, {
      hover: (event, datum) => this.onRowHover(event, datum),
      leave: () => this.onLeave(),
      activate: (event, datum) => this.onClick(event, datum),
    });

    mergedLabels
      .transition(this.transition)
      .attr("transform", (row) => `translate(0, ${this.y(row.country) || 0})`);

    mergedLabels
      .select("circle.heatmap-country-dot")
      .attr("cx", -176)
      .attr("cy", this.y.bandwidth() / 2)
      .attr("fill", (row) => CONTINENT_COLORS[row.continent] || CONTINENT_COLORS.Unknown);

    mergedLabels
      .select("text.heatmap-country-label")
      .attr("x", -156)
      .attr("y", this.y.bandwidth() / 2 - 4)
      .text((row) => row.country);

    mergedLabels
      .select("text.heatmap-country-rank")
      .attr("x", -156)
      .attr("y", this.y.bandwidth() / 2 + 11)
      .text((row) => `impact rank #${row.affectedRank ?? "-"}`);
  }

  renderCells(chartData) {
    const cellsData = chartData.flatMap((row) =>
      this.metrics.map((metric) => ({
        row,
        metric,
        value: row[metric.key],
        normalizedValue: this.normalizeValue(metric.key, row[metric.key]),
      }))
    );

    const cells = this.cellLayer
      .selectAll("rect.heatmap-cell")
      .data(cellsData, (datum) => `${datum.row.country}-${datum.metric.key}`);

    cells.exit().remove();

    const cellsEnter = cells
      .enter()
      .append("rect")
      .attr("class", "heatmap-cell")
      .attr("rx", 12)
      .attr("ry", 12);

    const mergedCells = cellsEnter
      .merge(cells)
      .attr(
        "aria-label",
        (datum) => `${datum.row.country}, ${datum.metric.label}: ${datum.metric.longFormat(datum.value)}`
      );

    bindInteractiveSelection(mergedCells, {
      hover: (event, datum) => this.onCellHover(event, datum),
      leave: () => this.onLeave(),
      activate: (event, datum) => this.onClick(event, datum.row),
    });

    mergedCells
      .transition(this.transition)
      .attr("x", (datum) => this.x(datum.metric.key))
      .attr("y", (datum) => this.y(datum.row.country))
      .attr("width", this.x.bandwidth())
      .attr("height", this.y.bandwidth())
      .attr("fill", (datum) => this.color(datum.normalizedValue));

    const values = this.valueLayer
      .selectAll("text.heatmap-value")
      .data(cellsData, (datum) => `${datum.row.country}-${datum.metric.key}`);

    values.exit().remove();

    values
      .enter()
      .append("text")
      .attr("class", "heatmap-value")
      .attr("text-anchor", "middle")
      .merge(values)
      .transition(this.transition)
      .attr("x", (datum) => (this.x(datum.metric.key) || 0) + this.x.bandwidth() / 2)
      .attr("y", (datum) => (this.y(datum.row.country) || 0) + this.y.bandwidth() / 2 + 4)
      .attr("fill", (datum) => (datum.normalizedValue >= 0.58 ? "#fbfdfe" : "#1f3042"))
      .text((datum) => datum.metric.shortFormat(datum.value));
  }

  renderLegend(width, height) {
    const legendWidth = Math.min(220, width * 0.24);
    const legendHeight = 12;
    const legendX = width - this.margin.right - legendWidth - 8;
    const legendY = height - 82;

    const legend = this.legendLayer.selectAll("g.heatmap-legend").data([null]);
    const legendEnter = legend.enter().append("g").attr("class", "heatmap-legend");
    legendEnter.append("text").attr("class", "heatmap-legend-label");
    legendEnter.append("rect").attr("class", "heatmap-legend-bar").attr("rx", 999);
    legendEnter.append("text").attr("class", "heatmap-legend-tick heatmap-legend-tick-start");
    legendEnter.append("text").attr("class", "heatmap-legend-tick heatmap-legend-tick-mid");
    legendEnter.append("text").attr("class", "heatmap-legend-tick heatmap-legend-tick-end");
    legendEnter.append("text").attr("class", "heatmap-legend-note");

    const mergedLegend = legendEnter.merge(legend).attr("transform", `translate(${legendX}, ${legendY})`);

    mergedLegend.select(".heatmap-legend-label").text("Normalized intensity").attr("y", 0);
    mergedLegend
      .select(".heatmap-legend-bar")
      .attr("y", 10)
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("fill", `url(#${this.gradientId})`);
    mergedLegend.select(".heatmap-legend-tick-start").text("Lower").attr("x", 0).attr("y", 40);
    mergedLegend
      .select(".heatmap-legend-tick-mid")
      .text("Relative")
      .attr("x", legendWidth / 2)
      .attr("y", 40)
      .attr("text-anchor", "middle");
    mergedLegend.select(".heatmap-legend-tick-end").text("Higher").attr("x", legendWidth).attr("y", 40).attr("text-anchor", "end");
    mergedLegend
      .select(".heatmap-legend-note")
      .text("Each column is scaled across all countries.")
      .attr("y", 58);
  }

  normalizeValue(metricKey, value) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    const [min, max] = this.metricDomains.get(metricKey) || [value, value];
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      return 0.5;
    }

    return clamp((value - min) / (max - min), 0, 1);
  }

  updateHighlighting() {
    const focusCountry = this.state.hoveredCountry || this.state.selectedCountry;
    const focusRegion = this.state.hoveredRegion || this.state.selectedRegion;

    this.cellLayer
      .selectAll("rect.heatmap-cell")
      .classed("highlight", (datum) => !!focusCountry && datum.row.country === focusCountry)
      .classed(
        "dimmed",
        (datum) =>
          (Boolean(focusCountry) && datum.row.country !== focusCountry) ||
          (!focusCountry && Boolean(focusRegion) && datum.row.region !== focusRegion)
      );

    this.valueLayer
      .selectAll("text.heatmap-value")
      .classed(
        "dimmed",
        (datum) =>
          (Boolean(focusCountry) && datum.row.country !== focusCountry) ||
          (!focusCountry && Boolean(focusRegion) && datum.row.region !== focusRegion)
      );

    this.countryLabelLayer
      .selectAll("g.heatmap-country-label-group")
      .classed("highlight", (row) => !!focusCountry && row.country === focusCountry)
      .classed(
        "dimmed",
        (row) =>
          (Boolean(focusCountry) && row.country !== focusCountry) ||
          (!focusCountry && Boolean(focusRegion) && row.region !== focusRegion)
      );
  }

  onCellHover(event, datum) {
    this.dispatcher.call("countryHover", null, {
      event,
      datum: datum.row,
      country: datum.row.country,
      chart: "heatmap",
      metricLabel: datum.metric.label,
      metricValueLabel: datum.metric.longFormat(datum.value),
      narrative: `${datum.metric.label.toLowerCase()} intensity is highlighted in the fingerprint matrix`,
    });
  }

  onRowHover(event, datum) {
    this.dispatcher.call("countryHover", null, {
      event,
      datum,
      country: datum.country,
      chart: "heatmap",
      narrative: "this row compares the country across six normalized burden metrics",
    });
  }

  onLeave() {
    this.dispatcher.call("countryOut", null, { chart: "heatmap" });
  }

  onClick(event, datum) {
    this.dispatcher.call("countryClick", null, { event, datum, country: datum.country, chart: "heatmap" });
  }

  renderEmpty(innerWidth, innerHeight) {
    this.countryLabelLayer.selectAll("*").remove();
    this.cellLayer.selectAll("*").remove();
    this.valueLayer.selectAll("*").remove();
    this.gridLayer.selectAll("*").remove();
    this.columnLayer.selectAll("*").remove();
    this.legendLayer.selectAll("*").remove();
    this.emptyLabel
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("opacity", 1)
      .text("No fingerprint metrics available for this filter");
  }

  getDimensions(rowCount) {
    const bounds = this.root.node().getBoundingClientRect();
    const width = Math.max(640, bounds.width || 920);
    const computedHeight = this.margin.top + this.margin.bottom + rowCount * 44;
    const height = Math.max(420, Math.max(bounds.height || 0, computedHeight));
    const innerWidth = width - this.margin.left - this.margin.right;
    const innerHeight = height - this.margin.top - this.margin.bottom;

    return { width, height, innerWidth, innerHeight };
  }
}
