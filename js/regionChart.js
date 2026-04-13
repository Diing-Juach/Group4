/**
 * Region Chart
 * 
 * Displays regional aggregates of total affected population.
 * Vertical bars colored by region for easy pattern recognition.
 * Supports bidirectional linking - clicking a region filters country charts.
 */

import { bindInteractiveSelection, createChartTransition, formatOneDecimal, REGION_COLORS } from "./chartUtils.js";

export default class RegionChart {
  /**
   * Initializes the regional burden chart with SVG structure and scales.
   */
  constructor({ selector, dispatcher }) {
    // Query DOM container and store event dispatcher reference
    this.root = d3.select(selector);
    this.dispatcher = dispatcher;

    // Reserve extra bottom margin for rotated x-axis labels
    this.margin = { top: 16, right: 20, bottom: 76, left: 74 };
    
    // Create SVG container with responsive viewBox
    this.svg = this.root.append("svg").attr("class", "chart-svg").attr("role", "img");
    this.plot = this.svg.append("g");

    // Create grid and axis groups
    this.gridY = this.plot.append("g").attr("class", "grid grid-y");
    this.xAxisG = this.plot.append("g").attr("class", "axis axis-x");
    this.yAxisG = this.plot.append("g").attr("class", "axis axis-y");

    // Create axis labels
    this.xLabel = this.svg.append("text").attr("class", "axis-label").attr("text-anchor", "middle");
    this.yLabel = this.svg.append("text").attr("class", "axis-label").attr("text-anchor", "middle");

    // Create layers for bars and value labels
    this.barLayer = this.plot.append("g");
    this.labelLayer = this.plot.append("g");
    this.emptyLabel = this.plot.append("text").attr("class", "empty-state").attr("opacity", 0);

    // Initialize D3 scales (band scale for categorical regions)
    this.x = d3.scaleBand().padding(0.28);
    this.y = d3.scaleLinear();

    // Track interaction state for highlighting
    this.state = { selectedRegion: null, hoveredRegion: null };

    // Re-render on window resize for responsive behavior
    window.addEventListener("resize", () => {
      if (this.lastData) this.update(this.lastData, this.state);
    });
  }

  /**
   * Full render cycle when data or interaction state changes.
   * Bars sorted by affected population descending for easy comparison.
   */
  update(data, state) {
    // Cache data and state for resize handling
    this.lastData = data;
    this.state = { ...state };
    
    // Interrupt any ongoing transitions to prevent conflicts on rapid updates
    this.svg.interrupt();
    this.barLayer.selectAll("*").interrupt();
    this.labelLayer.selectAll("*").interrupt();
    
    // Create fresh transition for this update cycle
    const transition = createChartTransition();

    const chartData = [...data]
      .filter((d) => d.region && Number.isFinite(d.totalPopulationAffectedMillions))
      .sort((a, b) => d3.descending(a.totalPopulationAffectedMillions, b.totalPopulationAffectedMillions));

    const { width, height, innerWidth, innerHeight } = this.getDimensions();

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);
    this.svg.attr("aria-label", "Vertical bar chart comparing total affected population by region.");
    this.plot.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
    this.xAxisG.attr("transform", `translate(0, ${innerHeight})`);

    this.xLabel
      .attr("x", this.margin.left + innerWidth / 2)
      .attr("y", height - 12)
      .text("Region");

    this.yLabel
      .attr("transform", `translate(20, ${this.margin.top + innerHeight / 2}) rotate(-90)`)
      .text("People affected (millions)");

    if (!chartData.length) {
      this.renderEmpty(innerWidth, innerHeight);
      return;
    }

    this.emptyLabel.attr("opacity", 0);

    this.x.domain(chartData.map((d) => d.region)).range([0, innerWidth]);
    this.y
      .domain([0, d3.max(chartData, (d) => d.totalPopulationAffectedMillions) * 1.08])
      .range([innerHeight, 0])
      .nice();

    const xAxis = d3.axisBottom(this.x);
    const yAxis = d3.axisLeft(this.y).ticks(6).tickFormat(d3.format(",.0f"));

    const yGrid = d3
      .axisLeft(this.y)
      .ticks(6)
      .tickSize(-innerWidth)
      .tickFormat("");

    this.xAxisG.transition(transition).call(xAxis);
    this.yAxisG.transition(transition).call(yAxis);
    this.gridY.transition(transition).call(yGrid);

    this.xAxisG
      .selectAll("text")
      .attr("transform", "rotate(-20)")
      .style("text-anchor", "end")
      .attr("dx", "-0.45em")
      .attr("dy", "0.6em");

    const bars = this.barLayer.selectAll("rect.region-bar").data(chartData, (d) => d.region);

    // Remove exiting bars immediately to prevent conflicts
    bars.exit().remove();

    const barsEnter = bars
      .enter()
      .append("rect")
      .attr("class", "region-bar")
      .attr("x", (d) => this.x(d.region))
      .attr("y", innerHeight)
      .attr("width", this.x.bandwidth())
      .attr("height", 0)
      .attr("fill", (d) => REGION_COLORS[d.region] || "var(--region-bar)");

    const mergedBars = barsEnter
      .merge(bars)
      .attr("aria-label", (d) => `${d.region}, ${formatOneDecimal(d.totalPopulationAffectedMillions)} million people affected`);

    bindInteractiveSelection(mergedBars, {
      hover: (event, datum) => this.onHover(event, datum),
      leave: () => this.onLeave(),
      activate: (event, datum) => this.onClick(event, datum),
    });

    mergedBars
      .transition(transition)
      .attr("x", (d) => this.x(d.region))
      .attr("width", this.x.bandwidth())
      .attr("y", (d) => this.y(d.totalPopulationAffectedMillions))
      .attr("height", (d) => innerHeight - this.y(d.totalPopulationAffectedMillions));

    const labels = this.labelLayer.selectAll("text.region-value-label").data(chartData, (d) => d.region);

    labels.exit().remove();

    labels
      .enter()
      .append("text")
      .attr("class", "region-value-label")
      .merge(labels)
      .transition(transition)
      .attr("x", (d) => (this.x(d.region) || 0) + this.x.bandwidth() / 2)
      .attr("y", (d) => this.y(d.totalPopulationAffectedMillions) - 8)
      .text((d) => formatOneDecimal(d.totalPopulationAffectedMillions));

    this.updateHighlighting();
  }

  setInteractionState(state) {
    this.state = { ...state };
    this.updateHighlighting();
  }

  updateHighlighting() {
    const focus = this.state.hoveredRegion || this.state.selectedRegion || this.state.linkedRegion;

    this.barLayer
      .selectAll("rect.region-bar")
      .classed("highlight", (d) => !!focus && d.region === focus)
      .classed("dimmed", (d) => !!focus && d.region !== focus);
  }

  /**
   * Dispatches hover event when user mouses over a regional bar.
   * Shows tooltip and enables bidirectional filtering to country charts.
   */
  onHover(event, d) {
    this.dispatcher.call("regionHover", null, { event, datum: d, region: d.region, chart: "region" });
  }

  /**
   * Dispatches leave event when mouse exits regional bars.
   * Removes tooltip and clears temporary highlights.
   */
  onLeave() {
    this.dispatcher.call("regionOut", null, { chart: "region" });
  }

  /**
   * Dispatches click event to select/deselect a region.
   * Filters all country charts to show only countries in this region.
   */
  onClick(event, d) {
    this.dispatcher.call("regionClick", null, { event, datum: d, region: d.region, chart: "region" });
  }

  /**
   * Shows empty state message when no regional data available.
   * Clears bars and labels, displays centered text.
   */
  renderEmpty(innerWidth, innerHeight) {
    this.barLayer.selectAll("rect.region-bar").remove();
    this.labelLayer.selectAll("text.region-value-label").remove();
    this.emptyLabel
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("opacity", 1)
      .text("No regional summary data available");
  }

  /**
   * Computes responsive dimensions from container bounding box.
   * Returns width, height, and inner dimensions after subtracting margins.
   * Uses fixed height to prevent vertical expansion on interactions.
   */
  getDimensions() {
    const bounds = this.root.node().getBoundingClientRect();
    const width = Math.max(320, bounds.width || 760);
    const height = 420; // Fixed height prevents chart expansion on click
    const innerWidth = width - this.margin.left - this.margin.right;
    const innerHeight = height - this.margin.top - this.margin.bottom;
    return { width, height, innerWidth, innerHeight };
  }
}
