/**
 * Events Bar Chart
 * 
 * Displays top 10 countries ranked by number of extreme weather events.
 * Horizontal bars with inline count labels for easy comparison.
 * Supports hover and click interactions for country selection.
 */

import { bindInteractiveSelection, createChartTransition, formatInteger } from "./chartUtils.js";

export default class EventsBarChart {
  /**
   * Initializes the extreme events ranking chart with SVG structure and scales.
   */
  constructor({ selector, dispatcher }) {
    // Query DOM container and store event dispatcher reference
    this.root = d3.select(selector);
    this.dispatcher = dispatcher;

    // Reserve space for axis labels and ticks (wider left margin for long country names)
    this.margin = { top: 22, right: 20, bottom: 52, left: 125 };

    // Create SVG container with responsive viewBox
    this.svg = this.root.append("svg").attr("class", "chart-svg").attr("role", "img");
    this.plot = this.svg.append("g");

    // Create grid and axis groups
    this.gridX = this.plot.append("g").attr("class", "grid grid-x");
    this.xAxisG = this.plot.append("g").attr("class", "axis axis-x");
    this.yAxisG = this.plot.append("g").attr("class", "axis axis-y");

    // Create axis label for x-axis
    this.xLabel = this.svg.append("text").attr("class", "axis-label").attr("text-anchor", "middle");

    // Create layers for bars and inline count labels
    this.barLayer = this.plot.append("g");
    this.labelLayer = this.plot.append("g");
    this.emptyLabel = this.plot.append("text").attr("class", "empty-state").attr("opacity", 0);

    // Initialize D3 scales (domains set during update)
    this.x = d3.scaleLinear();
    this.y = d3.scaleBand().padding(0.24);

    // Track interaction state for highlighting
    this.state = { selectedCountry: null, hoveredCountry: null };

    // Re-render on window resize for responsive behavior
    window.addEventListener("resize", () => {
      if (this.lastData) this.update(this.lastData, this.state);
    });
  }

  /**
   * Full render cycle when data or interaction state changes.
   * Shows top 10 countries sorted by extreme events descending.
   */
  update(data, state) {
    // Cache data and state for resize handling
    this.lastData = data;
    this.state = { ...state };
    
    // Create fresh transition for this update cycle
    const transition = createChartTransition();

    const chartData = [...data]
      .sort((a, b) => d3.descending(a.extremeEvents, b.extremeEvents))
      .slice(0, 10)
      .sort((a, b) => d3.ascending(a.extremeEvents, b.extremeEvents));

    const { width, height, innerWidth, innerHeight } = this.getDimensions();

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);
    this.svg.attr("aria-label", "Horizontal bar chart ranking countries by extreme weather events.");
    this.plot.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
    this.xAxisG.attr("transform", `translate(0, ${innerHeight})`);

    this.xLabel
      .attr("x", this.margin.left + innerWidth / 2)
      .attr("y", height - 10)
      .text("Number of extreme events");

    if (!chartData.length) {
      this.renderEmpty(innerWidth, innerHeight);
      return;
    }

    this.emptyLabel.attr("opacity", 0);

    this.x
      .domain([0, d3.max(chartData, (d) => d.extremeEvents) * 1.05])
      .range([0, innerWidth])
      .nice();

    this.y.domain(chartData.map((d) => d.country)).range([innerHeight, 0]);

    const xAxis = d3.axisBottom(this.x).ticks(5).tickFormat(d3.format(",.0f"));
    const yAxis = d3.axisLeft(this.y).tickSize(0);

    const xGrid = d3
      .axisBottom(this.x)
      .ticks(5)
      .tickSize(-innerHeight)
      .tickFormat("");

    this.gridX.attr("transform", `translate(0, ${innerHeight})`).transition(transition).call(xGrid);
    this.xAxisG.transition(transition).call(xAxis);
    this.yAxisG.transition(transition).call(yAxis);

    const bars = this.barLayer.selectAll("rect.bar-rect").data(chartData, (d) => d.country);

    bars
      .exit()
      .transition(transition)
      .attr("width", 0)
      .style("opacity", 0)
      .remove();

    const barsEnter = bars
      .enter()
      .append("rect")
      .attr("class", "bar-rect")
      .attr("x", 0)
      .attr("y", (d) => this.y(d.country))
      .attr("height", this.y.bandwidth())
      .attr("width", 0)
      .attr("fill", "var(--bar-events)");

    const mergedBars = barsEnter.merge(bars).attr("aria-label", (d) => `${d.country}, ${formatInteger(d.extremeEvents)} extreme events`);

    bindInteractiveSelection(mergedBars, {
      hover: (event, datum) => this.onHover(event, datum),
      leave: () => this.onLeave(),
      activate: (event, datum) => this.onClick(event, datum),
    });

    mergedBars
      .transition(transition)
      .attr("y", (d) => this.y(d.country))
      .attr("height", this.y.bandwidth())
      .attr("width", (d) => this.x(d.extremeEvents));

    const labels = this.labelLayer.selectAll("text.bar-value-label").data(chartData, (d) => d.country);

    labels.exit().remove();

    labels
      .enter()
      .append("text")
      .attr("class", "bar-value-label")
      .merge(labels)
      .transition(transition)
      .attr("x", (d) => this.x(d.extremeEvents) + 8)
      .attr("y", (d) => (this.y(d.country) || 0) + this.y.bandwidth() / 2 + 4)
      .text((d) => formatInteger(d.extremeEvents));

    this.updateHighlighting();
  }

  setInteractionState(state) {
    // Style-only sync for hover/selection states.
    this.state = { ...state };
    this.updateHighlighting();
  }

  updateHighlighting() {
    const focusCountry = this.state.hoveredCountry || this.state.selectedCountry;
    const focusRegion = this.state.hoveredRegion || this.state.selectedRegion;
    this.barLayer
      .selectAll("rect.bar-rect")
      .classed("highlight", (d) => !!focusCountry && d.country === focusCountry)
      .classed(
        "dimmed",
        (d) =>
          (Boolean(focusCountry) && d.country !== focusCountry) ||
          (!focusCountry && Boolean(focusRegion) && d.region !== focusRegion)
      );
  }

  /**
   * Dispatches hover event when user mouses over a bar.
   * Shows tooltip and highlights the country across all charts.
   */
  onHover(event, d) {
    // Dispatch hover event to show tooltip and highlight country
    this.dispatcher.call("countryHover", null, { event, datum: d, country: d.country, chart: "eventsBar" });
  }

  /**
   * Dispatches leave event when mouse exits bar elements.
   * Removes tooltip and clears temporary highlights.
   */
  onLeave() {
    // Dispatch leave event to remove tooltip and clear highlights
    this.dispatcher.call("countryOut", null, { chart: "eventsBar" });
  }

  /**
   * Dispatches click event to select/deselect a country.
   * Toggles sticky selection and filters all country charts.
   */
  onClick(event, d) {
    // Dispatch click event to select/deselect country and filter charts
    this.dispatcher.call("countryClick", null, { event, datum: d, country: d.country, chart: "eventsBar" });
  }

  /**
   * Shows empty state message when no data matches current filter.
   * Clears bars and labels, displays centered text.
   */
  renderEmpty(innerWidth, innerHeight) {
    // Clear bars and labels
    this.barLayer.selectAll("*").remove();
    this.labelLayer.selectAll("*").remove();
    
    // Display empty state message
    this.emptyLabel
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("opacity", 1)
      .text("No countries available for this filter");
  }

  /**
   * Computes responsive dimensions from container bounding box.
   * Returns width, height, and inner dimensions after subtracting margins.
   */
  getDimensions() {
    // Get container bounding box
    const bounds = this.root.node().getBoundingClientRect();
    
    // Compute responsive dimensions
    const width = Math.max(320, bounds.width || 430);
    const height = Math.max(360, bounds.height || 360);
    const innerWidth = width - this.margin.left - this.margin.right;
    const innerHeight = height - this.margin.top - this.margin.bottom;

    return { width, height, innerWidth, innerHeight };
  }
}
