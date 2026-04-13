/**
 * Rank Shift Chart (Slope Chart)
 * 
 * Compares each country's rank by population vs. rank by affected population.
 * Lines slope up/down to show disproportionate climate burden relative to country size.
 * This reveals which countries face outsized impacts despite smaller populations.
 * 
 * Visual encoding:
 * - Left axis: Population rank (1 = highest population)
 * - Right axis: Impact rank (1 = most affected)
 * - Line slope: Shows if burden is proportional, higher, or lower than expected
 * - Delta labels: Numeric change in rank position
 */

import {
  bindInteractiveSelection,
  CONTINENT_COLORS,
  createChartTransition,
  describeRankShift,
  formatInteger,
} from "./chartUtils.js";

export default class RankShiftChart {
  /**
   * Initializes the rank shift slope chart with two-column layout.
   */
  constructor({ selector, dispatcher }) {
    // Query DOM container and store event dispatcher reference
    this.root = d3.select(selector);
    this.dispatcher = dispatcher;

    // Wide side margins to accommodate rank numbers and country labels
    this.margin = { top: 72, right: 168, bottom: 36, left: 168 };
    
    // Create SVG container
    this.svg = this.root.append("svg").attr("class", "chart-svg");
    this.plot = this.svg.append("g");

    // Create header and link layers
    this.headerLayer = this.svg.append("g").attr("class", "rank-header-layer");
    this.linkLayer = this.plot.append("g").attr("class", "rank-link-layer");
    this.emptyLabel = this.plot.append("text").attr("class", "empty-state").attr("opacity", 0);

    // Create column headers for left and right axes
    this.leftHeader = this.headerLayer
      .append("text")
      .attr("class", "rank-axis-heading")
      .attr("text-anchor", "start")
      .text("Population rank");

    this.rightHeader = this.headerLayer
      .append("text")
      .attr("class", "rank-axis-heading")
      .attr("text-anchor", "end")
      .text("Climate impact rank");

    this.centerCaption = this.headerLayer
      .append("text")
      .attr("class", "rank-axis-caption")
      .attr("text-anchor", "middle")
      .text("Positive shifts mean a country climbs the impact ranking beyond what population size alone suggests.");

    this.state = {};

    window.addEventListener("resize", () => {
      if (this.lastData) {
        this.update(this.lastData, this.state);
      }
    });
  }

  update(data, state) {
    this.lastData = data;
    this.state = { ...state };
    const transition = createChartTransition();

    const chartData = [...data]
      .filter((row) => Number.isFinite(row.populationRank) && Number.isFinite(row.affectedRank))
      .sort((a, b) => d3.ascending(a.populationRank, b.populationRank));

    const { width, height, innerWidth, innerHeight } = this.getDimensions();
    const leftX = 0;
    const rightX = innerWidth;

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);
    this.svg.attr(
      "aria-label",
      "Slope chart comparing each country's population rank with its climate impact rank."
    );
    this.plot.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

    this.leftHeader.attr("x", this.margin.left).attr("y", 32);
    this.rightHeader.attr("x", width - this.margin.right).attr("y", 32);
    this.centerCaption.attr("x", width / 2).attr("y", 54);

    if (!chartData.length) {
      this.renderEmpty(innerWidth, innerHeight);
      return;
    }

    this.emptyLabel.attr("opacity", 0);

    // The two sides intentionally use different vertical orderings so the slope itself encodes the rank shift.
    const leftPositions = new Map(
      [...chartData]
        .sort((a, b) => d3.ascending(a.populationRank, b.populationRank))
        .map((row, index) => [row.country, this.getRowY(index, chartData.length, innerHeight)])
    );

    const rightPositions = new Map(
      [...chartData]
        .sort((a, b) => d3.ascending(a.affectedRank, b.affectedRank))
        .map((row, index) => [row.country, this.getRowY(index, chartData.length, innerHeight)])
    );

    const rows = this.linkLayer.selectAll("g.rank-row").data(chartData, (row) => row.country);

    rows.exit().remove();

    const rowsEnter = rows.enter().append("g").attr("class", "rank-row");
    rowsEnter.append("line").attr("class", "rank-hit-area");
    rowsEnter.append("line").attr("class", "rank-link");
    rowsEnter.append("circle").attr("class", "rank-node rank-node-left");
    rowsEnter.append("circle").attr("class", "rank-node rank-node-right");
    rowsEnter.append("text").attr("class", "rank-country rank-country-left").attr("text-anchor", "end");
    rowsEnter.append("text").attr("class", "rank-country rank-country-right").attr("text-anchor", "start");
    rowsEnter.append("text").attr("class", "rank-rank rank-rank-left").attr("text-anchor", "middle");
    rowsEnter.append("text").attr("class", "rank-rank rank-rank-right").attr("text-anchor", "middle");
    rowsEnter.append("text").attr("class", "rank-delta").attr("text-anchor", "middle");

    const mergedRows = rowsEnter.merge(rows);

    bindInteractiveSelection(mergedRows, {
      hover: (event, datum) => this.onHover(event, datum),
      leave: () => this.onLeave(),
      activate: (event, datum) => this.onClick(event, datum),
    });

    mergedRows.each((row, index, nodes) => {
      const group = d3.select(nodes[index]);
      const leftY = leftPositions.get(row.country) ?? 0;
      const rightY = rightPositions.get(row.country) ?? 0;
      const color = CONTINENT_COLORS[row.continent] || CONTINENT_COLORS.Unknown;

      group
        .select("line.rank-hit-area")
        .attr("x1", leftX)
        .attr("y1", leftY)
        .attr("x2", rightX)
        .attr("y2", rightY);

      group
        .select("line.rank-link")
        .attr("stroke", color)
        .transition(transition)
        .attr("x1", leftX)
        .attr("y1", leftY)
        .attr("x2", rightX)
        .attr("y2", rightY);

      group
        .select("circle.rank-node-left")
        .attr("fill", color)
        .transition(transition)
        .attr("cx", leftX)
        .attr("cy", leftY)
        .attr("r", 8);

      group
        .select("circle.rank-node-right")
        .attr("fill", color)
        .transition(transition)
        .attr("cx", rightX)
        .attr("cy", rightY)
        .attr("r", 8);

      group
        .select("text.rank-country-left")
        .transition(transition)
        .attr("x", leftX - 18)
        .attr("y", leftY + 4)
        .text(row.country);

      group
        .select("text.rank-country-right")
        .transition(transition)
        .attr("x", rightX + 18)
        .attr("y", rightY + 4)
        .text(row.country);

      group
        .select("text.rank-rank-left")
        .transition(transition)
        .attr("x", leftX)
        .attr("y", leftY + 4)
        .text(formatInteger(row.populationRank));

      group
        .select("text.rank-rank-right")
        .transition(transition)
        .attr("x", rightX)
        .attr("y", rightY + 4)
        .text(formatInteger(row.affectedRank));

      group
        .select("text.rank-delta")
        .classed("positive", (row.rankChange ?? 0) > 0)
        .classed("negative", (row.rankChange ?? 0) < 0)
        .transition(transition)
        .attr("x", innerWidth / 2)
        .attr("y", (leftY + rightY) / 2 - 8)
        .text(this.getDeltaLabel(row.rankChange));
    });

    this.updateHighlighting();
  }

  setInteractionState(state) {
    this.state = { ...state };
    this.updateHighlighting();
  }

  updateHighlighting() {
    const focusCountry = this.state.hoveredCountry || this.state.selectedCountry;
    const focusRegion = this.state.hoveredRegion || this.state.selectedRegion;

    this.linkLayer
      .selectAll("g.rank-row")
      .classed("highlight", (row) => !!focusCountry && row.country === focusCountry)
      .classed(
        "dimmed",
        (row) =>
          (Boolean(focusCountry) && row.country !== focusCountry) ||
          (!focusCountry && Boolean(focusRegion) && row.region !== focusRegion)
      );
  }

  /**
   * Dispatches hover event when user mouses over a slope line.
   * Shows tooltip with rank change narrative explaining disproportionate burden.
   */
  onHover(event, datum) {
    this.dispatcher.call("countryHover", null, {
      event,
      datum,
      country: datum.country,
      chart: "rankShift",
      narrative: describeRankShift(datum.rankChange),
    });
  }

  /**
   * Dispatches leave event when mouse exits slope lines.
   * Removes tooltip and clears temporary highlights.
   */
  onLeave() {
    this.dispatcher.call("countryOut", null, { chart: "rankShift" });
  }

  /**
   * Dispatches click event to select/deselect a country.
   * Toggles sticky selection and filters all country charts.
   */
  onClick(event, datum) {
    this.dispatcher.call("countryClick", null, { event, datum, country: datum.country, chart: "rankShift" });
  }

  /**
   * Shows empty state message when no rank shift data available.
   * Clears all slope lines and displays centered text.
   */
  renderEmpty(innerWidth, innerHeight) {
    this.linkLayer.selectAll("g.rank-row").remove();
    this.emptyLabel
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("opacity", 1)
      .text("No rank-shift comparison available");
  }

  /**
   * Formats rank change as a delta label with + or - prefix.
   * Used to display numeric change in the center of each slope line.
   */
  getDeltaLabel(rankChange) {
    if (!Number.isFinite(rankChange) || rankChange === 0) {
      return "0";
    }

    return rankChange > 0 ? `+${formatInteger(rankChange)}` : `${formatInteger(rankChange)}`;
  }

  getRowY(index, count, innerHeight) {
    const step = count <= 1 ? innerHeight / 2 : innerHeight / (count - 1);
    return count <= 1 ? innerHeight / 2 : index * step;
  }

  getDimensions() {
    const bounds = this.root.node().getBoundingClientRect();
    const width = Math.max(860, bounds.width || 860);
    const height = 550; // Fixed height prevents chart expansion on interactions
    const innerWidth = width - this.margin.left - this.margin.right;
    const innerHeight = height - this.margin.top - this.margin.bottom;

    return { width, height, innerWidth, innerHeight };
  }
}
