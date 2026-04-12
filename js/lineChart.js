/**
 * Line Chart
 * 
 * Displays global population growth trend over time from 1970-2022.
 * Shows historical baseline that contextualizes climate burden increases.
 * Interactive points display year and population on hover.
 */

import { bindInteractiveSelection, createChartTransition } from "./chartUtils.js";

export default class LineChart {
  /**
   * Initializes the population trend line chart with SVG structure and scales.
   */
  constructor({ selector, dispatcher }) {
    // Query DOM container and store event dispatcher reference
    this.root = d3.select(selector);
    this.dispatcher = dispatcher;

    // Reserve space for axes and labels
    this.margin = { top: 20, right: 26, bottom: 52, left: 82 };
    
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

    // Create line path and interactive point layer
    this.lineLayer = this.plot.append("path").attr("class", "line-path");
    this.pointLayer = this.plot.append("g");
    this.emptyLabel = this.plot.append("text").attr("class", "empty-state").attr("opacity", 0);

    // Initialize D3 scales (domains set during update)
    this.x = d3.scaleLinear();
    this.y = d3.scaleLinear();

    // Track state (line chart doesn't use selection state)
    this.state = {};

    // Re-render on window resize for responsive behavior
    window.addEventListener("resize", () => {
      if (this.lastData) this.update(this.lastData, this.state);
    });
  }

  /**
   * Full render cycle when data changes.
   * Draws smooth line with monotone X curve for natural progression.
   */
  update(data, state) {
    // Cache data and state for resize handling
    this.lastData = data;
    this.state = { ...state };
    
    // Create fresh transition for this update cycle
    const transition = createChartTransition();

    const chartData = [...data]
      .filter((d) => Number.isFinite(d.year) && Number.isFinite(d.globalPopulationMillions))
      .sort((a, b) => d3.ascending(a.year, b.year));

    const { width, height, innerWidth, innerHeight } = this.getDimensions();

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);
    this.svg.attr("aria-label", "Line chart showing global population growth over time.");
    this.plot.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
    this.xAxisG.attr("transform", `translate(0, ${innerHeight})`);

    this.xLabel
      .attr("x", this.margin.left + innerWidth / 2)
      .attr("y", height - 10)
      .text("Year");

    this.yLabel
      .attr("transform", `translate(20, ${this.margin.top + innerHeight / 2}) rotate(-90)`)
      .text("Global population (millions)");

    if (!chartData.length) {
      this.renderEmpty(innerWidth, innerHeight);
      return;
    }

    this.emptyLabel.attr("opacity", 0);

    this.x.domain(d3.extent(chartData, (d) => d.year)).range([0, innerWidth]);
    this.y
      .domain([d3.min(chartData, (d) => d.globalPopulationMillions) * 0.96, d3.max(chartData, (d) => d.globalPopulationMillions) * 1.03])
      .range([innerHeight, 0])
      .nice();

    const tickCount = innerWidth < 420 ? 4 : Math.min(chartData.length, 8);
    const xAxis = d3.axisBottom(this.x).ticks(tickCount).tickFormat(d3.format(".0f"));
    const yAxis = d3.axisLeft(this.y).ticks(6).tickFormat(d3.format(",.0f"));

    const yGrid = d3
      .axisLeft(this.y)
      .ticks(6)
      .tickSize(-innerWidth)
      .tickFormat("");

    this.xAxisG.transition(transition).call(xAxis);
    this.yAxisG.transition(transition).call(yAxis);
    this.gridY.transition(transition).call(yGrid);

    const lineGenerator = d3
      .line()
      .curve(d3.curveMonotoneX)
      .x((d) => this.x(d.year))
      .y((d) => this.y(d.globalPopulationMillions));

    this.lineLayer.datum(chartData).transition(transition).attr("d", lineGenerator);

    const points = this.pointLayer.selectAll("circle.line-point").data(chartData, (d) => d.year);

    points
      .exit()
      .transition(transition)
      .attr("r", 0)
      .remove();

    const pointsEnter = points.enter().append("circle").attr("class", "line-point").attr("r", 0);

    const mergedPoints = pointsEnter
      .merge(points)
      .attr("aria-label", (d) => `Year ${d.year}, global population ${Math.round(d.globalPopulationMillions)} million`);

    bindInteractiveSelection(mergedPoints, {
      hover: (event, datum) => this.onHover(event, datum),
      leave: () => this.onLeave(),
      activate: (event, datum) => this.onHover(event, datum),
    });

    mergedPoints
      .transition(transition)
      .attr("cx", (d) => this.x(d.year))
      .attr("cy", (d) => this.y(d.globalPopulationMillions))
      .attr("r", 4.3);
  }

  setInteractionState(state) {
    // Update state with new interaction state
    this.state = { ...state };
  }

  /**
   * Dispatches hover event when user mouses over a trend point.
   * Shows tooltip with year and global population.
   */
  onHover(event, d) {
    // Dispatch hover event to parent component
    this.dispatcher.call("trendHover", null, { event, datum: d, chart: "line" });
  }

  /**
   * Dispatches leave event when mouse exits trend points.
   * Removes tooltip.
   */
  onLeave() {
    // Dispatch leave event to parent component
    this.dispatcher.call("trendOut", null, { chart: "line" });
  }

  /**
   * Shows empty state message when no data available.
   * Clears line and points, displays centered text.
   */
  renderEmpty(innerWidth, innerHeight) {
    // Clear line and points
    this.lineLayer.attr("d", null);
    this.pointLayer.selectAll("*").remove();
    
    // Display empty state message
    this.emptyLabel
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("opacity", 1)
      .text("No trend data available");
  }

  /**
   * Computes responsive dimensions using fixed height to prevent expansion.
   * Using fixed height instead of bounds.height prevents chart from growing on interactions.
   */
  getDimensions() {
    // Get bounding box of container for width only
    const bounds = this.root.node().getBoundingClientRect();
    
    // Use responsive width but fixed height to prevent vertical expansion
    const width = Math.max(520, bounds.width || 840);
    const height = 450; // Fixed height prevents expansion bug
    const innerWidth = width - this.margin.left - this.margin.right;
    const innerHeight = height - this.margin.top - this.margin.bottom;

    return { width, height, innerWidth, innerHeight };
  }
}
