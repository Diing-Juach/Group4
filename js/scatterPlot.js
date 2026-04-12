/**
 * Scatter Plot Chart
 * 
 * Visualizes the relationship between country population and affected population by climate events.
 * Encodes continent using color and climate risk using bubble size.
 * Supports hover interactions with tooltips and click to select countries.
 * Legend positioned in top-right to avoid data occlusion.
 */

import { bindInteractiveSelection, CONTINENT_COLORS, createChartTransition } from "./chartUtils.js";

export default class ScatterPlot {
  /**
   * Initializes the scatter plot with SVG structure, scales, and event listeners.
   */
  constructor({ selector, dispatcher, tooltipSelector }) {
    // Query DOM elements and store references for chart updates
    this.root = d3.select(selector);
    this.dispatcher = dispatcher;
    this.tooltip = d3.select(tooltipSelector);

    // Margins reserve space for axes, labels, and legend
    this.margin = { top: 135, right: 40, bottom: 58, left: 78 };

    // Create SVG container with responsive viewBox
    this.svg = this.root.append("svg").attr("class", "chart-svg").attr("role", "img");
    this.plot = this.svg.append("g");

    // Create grid layers for visual reference lines
    this.gridX = this.plot.append("g").attr("class", "grid grid-x");
    this.gridY = this.plot.append("g").attr("class", "grid grid-y");

    // Create axis groups that will render scales
    this.xAxisG = this.plot.append("g").attr("class", "axis axis-x");
    this.yAxisG = this.plot.append("g").attr("class", "axis axis-y");

    // Create axis labels for data context
    this.xLabel = this.svg.append("text").attr("class", "axis-label").attr("text-anchor", "middle");
    this.yLabel = this.svg.append("text").attr("class", "axis-label").attr("text-anchor", "middle");

    // Create layers for data points and legend
    this.dotLayer = this.plot.append("g");
    this.legendLayer = this.svg.append("g").attr("class", "legend");

    // Empty state message when no data matches filter
    this.emptyLabel = this.plot.append("text").attr("class", "empty-state").attr("opacity", 0);

    // Initialize D3 scales (domains set during update)
    this.x = d3.scaleLinear();
    this.y = d3.scaleLinear();
    this.radius = d3.scaleSqrt();

    // Track interaction state for highlighting
    this.state = { selectedCountry: null, hoveredCountry: null };

    // Re-render on window resize to maintain responsive layout
    window.addEventListener("resize", () => {
      if (this.lastData) this.update(this.lastData, this.state);
    });
  }

  /**
   * Full render cycle when data or interaction state changes.
   * Applies enter-update-exit pattern for smooth animated transitions.
   */
  update(data, state) {
    // Cache data and state for resize handling
    this.lastData = data;
    this.state = { ...state };
    
    // Create fresh transition for this update cycle
    const transition = createChartTransition();

    const { width, height, innerWidth, innerHeight } = this.getDimensions();

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);
    this.svg.attr(
      "aria-label",
      "Bubble scatter plot comparing population, affected population, and climate risk for each country."
    );
    this.plot.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

    this.xAxisG.attr("transform", `translate(0, ${innerHeight})`);

    this.xLabel
      .attr("x", this.margin.left + innerWidth / 2)
      .attr("y", height - 14)
      .text("Population (millions)");

    this.yLabel
      .attr("transform", `translate(18, ${this.margin.top + innerHeight / 2}) rotate(-90)`)
      .text("People affected (millions)");

    if (!data.length) {
      this.renderEmpty(innerWidth, innerHeight);
      return;
    }

    this.emptyLabel.attr("opacity", 0);

    this.x.domain([0, d3.max(data, (d) => d.populationMillions) * 1.08]).range([0, innerWidth]).nice();

    this.y.domain([0, d3.max(data, (d) => d.affectedMillions) * 1.1]).range([innerHeight, 0]).nice();
    this.radius
      .domain(d3.extent(data, (d) => d.avgClimateRiskScore))
      .range(innerWidth < 520 ? [6, 13] : [7, 18]);

    const tickCount = innerWidth < 430 ? 4 : 6;
    const xAxis = d3.axisBottom(this.x).ticks(tickCount).tickFormat(d3.format(",.0f"));
    const yAxis = d3.axisLeft(this.y).ticks(tickCount).tickFormat(d3.format(",.0f"));

    const xGrid = d3
      .axisBottom(this.x)
      .ticks(tickCount)
      .tickSize(-innerHeight)
      .tickFormat("");

    const yGrid = d3
      .axisLeft(this.y)
      .ticks(tickCount)
      .tickSize(-innerWidth)
      .tickFormat("");

    this.xAxisG.transition(transition).call(xAxis);
    this.yAxisG.transition(transition).call(yAxis);
    this.gridX.attr("transform", `translate(0, ${innerHeight})`).transition(transition).call(xGrid);
    this.gridY.transition(transition).call(yGrid);

    const dots = this.dotLayer.selectAll("circle.dot").data(data, (d) => d.country);

    dots
      .exit()
      .transition(transition)
      .attr("r", 0)
      .style("opacity", 0)
      .remove();

    const dotsEnter = dots.enter().append("circle").attr("class", "dot").attr("r", 0);

    const mergedDots = dotsEnter
      .merge(dots)
      .style("fill", (d) => CONTINENT_COLORS[d.continent] || CONTINENT_COLORS.Unknown)
      .attr("aria-label", (d) => `${d.country}, climate risk score ${d.avgClimateRiskScore?.toFixed(1) ?? "unknown"}`);

    bindInteractiveSelection(mergedDots, {
      hover: (event, datum) => this.onHover(event, datum),
      leave: () => this.onLeave(),
      activate: (event, datum) => this.onClick(event, datum),
    });

    mergedDots
      .transition(transition)
      .attr("cx", (d) => this.x(d.populationMillions))
      .attr("cy", (d) => this.y(d.affectedMillions))
      .attr("r", (d) => this.radius(d.avgClimateRiskScore))
      .style("opacity", (d) => this.getOpacity(d));

    this.updateHighlighting();
    this.renderLegend(data, width);
  }

  setInteractionState(state) {
    // Lightweight style-only update for hover/selection syncing across charts.
    this.state = { ...state };
    this.updateHighlighting();
  }

  getOpacity(d) {
    const focusCountry = this.state.hoveredCountry || this.state.selectedCountry;
    const focusRegion = this.state.hoveredRegion || this.state.selectedRegion;
    
    if (focusCountry && d.country === focusCountry) return 1;
    if (focusCountry && d.country !== focusCountry) return 0.2;
    if (!focusCountry && focusRegion && d.region !== focusRegion) return 0.2;
    return 0.85;
  }

  updateHighlighting() {
    const focusCountry = this.state.hoveredCountry || this.state.selectedCountry;
    const focusRegion = this.state.hoveredRegion || this.state.selectedRegion;
    const dots = this.dotLayer.selectAll("circle.dot");

    dots
      .classed("highlight", (d) => !!focusCountry && d.country === focusCountry)
      .classed(
        "dimmed",
        (d) =>
          (Boolean(focusCountry) && d.country !== focusCountry) ||
          (!focusCountry && Boolean(focusRegion) && d.region !== focusRegion)
      );
  }

  renderLegend(data, width) {
    // Static legend for continent color encoding.
    const continents = Object.keys(CONTINENT_COLORS).filter((c) => c !== "Unknown");
    const itemHeight = 18;
    const legendWidth = 160;
    const legendHeight = continents.length * itemHeight + 14;

    const chosen = { x: width - this.margin.right - legendWidth - 8, y: 8 };

    const bg = this.legendLayer.selectAll("rect.legend-bg").data([chosen]);
    bg
      .enter()
      .append("rect")
      .attr("class", "legend-bg")
      .attr("rx", 8)
      .merge(bg)
      .attr("x", chosen.x)
      .attr("y", chosen.y)
      .attr("width", legendWidth)
      .attr("height", legendHeight);

    const legendItems = this.legendLayer.selectAll("g.legend-item").data(continents, (d) => d);

    legendItems.exit().remove();

    const enter = legendItems.enter().append("g").attr("class", "legend-item");
    enter.append("circle").attr("r", 5);
    enter.append("text").attr("x", 10).attr("y", 4);

    const merged = enter.merge(legendItems);

    merged.attr("transform", (_, i) => `translate(${chosen.x + 12}, ${chosen.y + 16 + i * itemHeight})`);

    merged.select("circle").attr("fill", (d) => CONTINENT_COLORS[d]);
    merged.select("text").text((d) => d);
  }

  /**
   * Dispatches hover event when user mouses over a bubble.
   * Shows tooltip with country details and highlights across all charts.
   */
  onHover(event, d) {
    // Forward events to central interaction controller.
    this.dispatcher.call("countryHover", null, { event, datum: d, country: d.country, chart: "scatter" });
  }

  /**
   * Dispatches leave event when mouse exits bubbles.
   * Removes tooltip and clears temporary highlights.
   */
  onLeave() {
    this.dispatcher.call("countryOut", null, { chart: "scatter" });
  }

  /**
   * Dispatches click event to select/deselect a country.
   * Toggles sticky selection and filters all country charts.
   */
  onClick(event, d) {
    this.dispatcher.call("countryClick", null, { event, datum: d, country: d.country, chart: "scatter" });
  }

  /**
   * Shows empty state message when no data matches current filter.
   * Clears bubbles and legend, displays centered text.
   */
  renderEmpty(innerWidth, innerHeight) {
    this.dotLayer.selectAll("*").remove();
    this.legendLayer.selectAll("*").remove();
    this.emptyLabel
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("opacity", 1)
      .text("No data available for this selection");
  }

  /**
   * Computes responsive dimensions using fixed height to prevent expansion bug.
   * Using fixed height instead of bounds.height prevents chart from growing on interactions.
   */
  getDimensions() {
    const bounds = this.root.node().getBoundingClientRect();
    const width = Math.max(540, bounds.width || 920);
    const height = Math.max(420, 520);
    const innerWidth = width - this.margin.left - this.margin.right;
    const innerHeight = height - this.margin.top - this.margin.bottom;

    return { width, height, innerWidth, innerHeight };
  }

  /**
   * Computes bubble opacity based on current interaction state.
   * Highlights focused country/region by dimming others.
   */
  getOpacity(d) {
    const focusCountry = this.state.hoveredCountry || this.state.selectedCountry;
    const focusRegion = this.state.hoveredRegion || this.state.selectedRegion;
    
    // Fully opaque if this is the focused country
    if (focusCountry && d.country === focusCountry) return 1;
    // Dimmed if a different country is focused
    if (focusCountry && d.country !== focusCountry) return 0.2;
    // Dimmed if not in focused region
    if (!focusCountry && focusRegion && d.region !== focusRegion) return 0.2;
    // Default slightly transparent for depth
    return 0.85;
  }
}
