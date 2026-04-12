import { bindInteractiveSelection, createChartTransition } from "./chartUtils.js";

export default class LineChart {
  constructor({ selector, dispatcher }) {
    this.root = d3.select(selector);
    this.dispatcher = dispatcher;

    this.margin = { top: 20, right: 26, bottom: 52, left: 82 };
    this.transition = createChartTransition();

    this.svg = this.root.append("svg").attr("class", "chart-svg").attr("role", "img");
    this.plot = this.svg.append("g");

    this.gridY = this.plot.append("g").attr("class", "grid grid-y");
    this.xAxisG = this.plot.append("g").attr("class", "axis axis-x");
    this.yAxisG = this.plot.append("g").attr("class", "axis axis-y");

    this.xLabel = this.svg.append("text").attr("class", "axis-label").attr("text-anchor", "middle");
    this.yLabel = this.svg.append("text").attr("class", "axis-label").attr("text-anchor", "middle");

    this.lineLayer = this.plot.append("path").attr("class", "line-path");
    this.pointLayer = this.plot.append("g");
    this.emptyLabel = this.plot.append("text").attr("class", "empty-state").attr("opacity", 0);

    this.x = d3.scaleLinear();
    this.y = d3.scaleLinear();

    this.state = {};

    window.addEventListener("resize", () => {
      if (this.lastData) this.update(this.lastData, this.state);
    });
  }

  update(data, state) {
    this.lastData = data;
    this.state = { ...state };

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

    this.xAxisG.transition(this.transition).call(xAxis);
    this.yAxisG.transition(this.transition).call(yAxis);
    this.gridY.transition(this.transition).call(yGrid);

    const lineGenerator = d3
      .line()
      .curve(d3.curveMonotoneX)
      .x((d) => this.x(d.year))
      .y((d) => this.y(d.globalPopulationMillions));

    this.lineLayer.datum(chartData).transition(this.transition).attr("d", lineGenerator);

    const points = this.pointLayer.selectAll("circle.line-point").data(chartData, (d) => d.year);

    points
      .exit()
      .transition(this.transition)
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
      .transition(this.transition)
      .attr("cx", (d) => this.x(d.year))
      .attr("cy", (d) => this.y(d.globalPopulationMillions))
      .attr("r", 4.3);
  }

  setInteractionState(state) {
    this.state = { ...state };
  }

  onHover(event, d) {
    this.dispatcher.call("trendHover", null, { event, datum: d, chart: "line" });
  }

  onLeave() {
    this.dispatcher.call("trendOut", null, { chart: "line" });
  }

  renderEmpty(innerWidth, innerHeight) {
    this.lineLayer.attr("d", null);
    this.pointLayer.selectAll("circle.line-point").remove();
    this.emptyLabel
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("opacity", 1)
      .text("No trend data available");
  }

  getDimensions() {
    const bounds = this.root.node().getBoundingClientRect();
    const width = Math.max(320, bounds.width || 700);
    const height = Math.max(350, bounds.height || 350);
    const innerWidth = width - this.margin.left - this.margin.right;
    const innerHeight = height - this.margin.top - this.margin.bottom;
    return { width, height, innerWidth, innerHeight };
  }
}
