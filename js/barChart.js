import { bindInteractiveSelection, createChartTransition, formatOneDecimal } from "./chartUtils.js";

export default class PopulationBarChart {
  constructor({ selector, dispatcher }) {
    // Linked horizontal bar chart for top countries by population.
    this.root = d3.select(selector);
    this.dispatcher = dispatcher;

    this.margin = { top: 22, right: 20, bottom: 52, left: 120 };
    this.transition = createChartTransition();

    this.svg = this.root.append("svg").attr("class", "chart-svg").attr("role", "img");
    this.plot = this.svg.append("g");

    this.gridX = this.plot.append("g").attr("class", "grid grid-x");
    this.xAxisG = this.plot.append("g").attr("class", "axis axis-x");
    this.yAxisG = this.plot.append("g").attr("class", "axis axis-y");

    this.xLabel = this.svg.append("text").attr("class", "axis-label").attr("text-anchor", "middle");

    this.barLayer = this.plot.append("g");
    this.labelLayer = this.plot.append("g");
    this.emptyLabel = this.plot.append("text").attr("class", "empty-state").attr("opacity", 0);

    this.x = d3.scaleLinear();
    this.y = d3.scaleBand().padding(0.24);

    this.state = { selectedCountry: null, hoveredCountry: null };

    window.addEventListener("resize", () => {
      if (this.lastData) this.update(this.lastData, this.state);
    });
  }

  update(data, state) {
    // Render/update top-10 bars with transitions whenever global filter changes.
    this.lastData = data;
    this.state = { ...state };

    const chartData = [...data]
      .sort((a, b) => d3.descending(a.populationMillions, b.populationMillions))
      .slice(0, 10)
      .sort((a, b) => d3.ascending(a.populationMillions, b.populationMillions));

    const { width, height, innerWidth, innerHeight } = this.getDimensions();

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);
    this.svg.attr("aria-label", "Horizontal bar chart ranking the most populated countries in the current filter.");
    this.plot.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
    this.xAxisG.attr("transform", `translate(0, ${innerHeight})`);

    this.xLabel
      .attr("x", this.margin.left + innerWidth / 2)
      .attr("y", height - 10)
      .text("Population (millions)");

    if (!chartData.length) {
      this.renderEmpty(innerWidth, innerHeight);
      return;
    }

    this.emptyLabel.attr("opacity", 0);

    this.x
      .domain([0, d3.max(chartData, (d) => d.populationMillions) * 1.05])
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

    this.gridX.attr("transform", `translate(0, ${innerHeight})`).transition(this.transition).call(xGrid);
    this.xAxisG.transition(this.transition).call(xAxis);
    this.yAxisG.transition(this.transition).call(yAxis);

    const bars = this.barLayer.selectAll("rect.bar-rect").data(chartData, (d) => d.country);

    bars
      .exit()
      .transition(this.transition)
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
      .attr("fill", "var(--bar-population)");

    const mergedBars = barsEnter.merge(bars).attr("aria-label", (d) => `${d.country}, ${formatOneDecimal(d.populationMillions)} million people`);

    bindInteractiveSelection(mergedBars, {
      hover: (event, datum) => this.onHover(event, datum),
      leave: () => this.onLeave(),
      activate: (event, datum) => this.onClick(event, datum),
    });

    mergedBars
      .transition(this.transition)
      .attr("y", (d) => this.y(d.country))
      .attr("height", this.y.bandwidth())
      .attr("width", (d) => this.x(d.populationMillions));

    const labels = this.labelLayer.selectAll("text.bar-value-label").data(chartData, (d) => d.country);

    labels.exit().remove();

    labels
      .enter()
      .append("text")
      .attr("class", "bar-value-label")
      .merge(labels)
      .transition(this.transition)
      .attr("x", (d) => this.x(d.populationMillions) + 8)
      .attr("y", (d) => (this.y(d.country) || 0) + this.y.bandwidth() / 2 + 4)
      .text((d) => formatOneDecimal(d.populationMillions));

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

  onHover(event, d) {
    this.dispatcher.call("countryHover", null, { event, datum: d, country: d.country, chart: "populationBar" });
  }

  onLeave() {
    this.dispatcher.call("countryOut", null, { chart: "populationBar" });
  }

  onClick(event, d) {
    this.dispatcher.call("countryClick", null, { event, datum: d, country: d.country, chart: "populationBar" });
  }

  renderEmpty(innerWidth, innerHeight) {
    this.barLayer.selectAll("rect.bar-rect").remove();
    this.labelLayer.selectAll("text.bar-value-label").remove();
    this.emptyLabel
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("opacity", 1)
      .text("No countries available for this filter");
  }

  getDimensions() {
    const bounds = this.root.node().getBoundingClientRect();
    const width = Math.max(320, bounds.width || 430);
    const height = Math.max(360, bounds.height || 360);
    const innerWidth = width - this.margin.left - this.margin.right;
    const innerHeight = height - this.margin.top - this.margin.bottom;
    return { width, height, innerWidth, innerHeight };
  }
}
