/**
 * World Map Choropleth Chart
 * 
 * Displays a world map where each country is colored by its average climate risk score.
 * Provides a geographic overview of climate vulnerability patterns globally.
 * Integrates with the linked interaction system for coordinated highlighting and filtering.
 * 
 * Visual encoding:
 * - Choropleth fill: Average climate risk score (darker = higher risk)
 * - Tooltip: Country name, climate risk, affected population, extreme events
 * - Graticule: Light grid lines showing lat/long
 * - Projection: Natural Earth for balanced world view
 */

import {
  bindInteractiveSelection,
  createChartTransition,
  formatInteger,
  formatOneDecimal,
} from "./chartUtils.js";

/**
 * Normalizes country names to improve matching between TopoJSON and climate dataset.
 * Handles common naming variations and abbreviations.
 */
function normalizeCountryName(name) {
  if (!name) return "";
  
  const normalized = name.trim();
  
  // Map common TopoJSON names to climate dataset names
  const nameMap = {
    "United States of America": "United States",
    "United Kingdom": "United Kingdom",
    "Russian Federation": "Russia",
    "Korea, Republic of": "South Korea",
    "Korea, Dem. People's Rep.": "North Korea",
    "Dem. Rep. Congo": "Democratic Republic of the Congo",
    "Congo": "Republic of the Congo",
    "Côte d'Ivoire": "Ivory Coast",
    "Lao PDR": "Laos",
    "Syrian Arab Republic": "Syria",
    "Iran, Islamic Rep.": "Iran",
    "Egypt, Arab Rep.": "Egypt",
    "Venezuela, RB": "Venezuela",
    "Czechia": "Czech Republic",
    "Czech Rep.": "Czech Republic",
    "Slovak Republic": "Slovakia",
    "Macedonia": "North Macedonia",
    "Bosnia and Herz.": "Bosnia and Herzegovina",
    "Dominican Rep.": "Dominican Republic",
    "Central African Rep.": "Central African Republic",
    "Eq. Guinea": "Equatorial Guinea",
    "S. Sudan": "South Sudan",
    "Timor-Leste": "East Timor",
    "eSwatini": "Eswatini",
    "Cabo Verde": "Cape Verde",
    "W. Sahara": "Western Sahara",
    "Falkland Is.": "Falkland Islands",
    "Fr. S. Antarctic Lands": "French Southern Territories",
    "Palestine": "Palestinian Territories",
    "N. Cyprus": "Northern Cyprus",
    "Somaliland": "Somalia",
  };
  
  return nameMap[normalized] || normalized;
}

export default class MapChart {
  /**
   * Initializes the world map with projection and geographic path generator.
   */
  constructor({ selector, dispatcher, geoData }) {
    // Query DOM container and store references
    this.root = d3.select(selector);
    this.dispatcher = dispatcher;
    this.geoData = geoData; // TopoJSON or GeoJSON features

    // Moderate margins for title and legend
    this.margin = { top: 60, right: 20, bottom: 20, left: 20 };

    // Create SVG container
    this.svg = this.root.append("svg").attr("class", "chart-svg map-svg").attr("role", "img");
    this.plot = this.svg.append("g");

    // Create layered structure for map components
    this.graticuleLayer = this.plot.append("g").attr("class", "graticule-layer");
    this.countryLayer = this.plot.append("g").attr("class", "country-layer");
    
    // Add title and legend groups
    this.titleText = this.svg
      .append("text")
      .attr("class", "map-title")
      .attr("text-anchor", "middle")
      .text("Climate Risk Score by Country");

    this.legendLayer = this.svg.append("g").attr("class", "map-legend");
    this.emptyLabel = this.plot.append("text").attr("class", "empty-state").attr("opacity", 0);

    // Create D3 projection (Natural Earth for balanced world view)
    this.projection = d3.geoNaturalEarth1();
    this.pathGenerator = d3.geoPath().projection(this.projection);

    // Create graticule for grid lines
    this.graticule = d3.geoGraticule();

    // Color scale for choropleth (will be updated with data)
    this.colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 100]);

    // Track interaction state for highlighting
    this.state = { selectedCountry: null, hoveredCountry: null };

    // Re-render on window resize for responsive behavior
    window.addEventListener("resize", () => {
      if (this.lastData) this.update(this.lastData, this.state);
    });
  }

  /**
   * Full render cycle when data or interaction state changes.
   * Joins country data with geographic features and colors by climate risk.
   */
  update(data, state) {
    // Cache data and state for resize handling
    this.lastData = data;
    this.state = { ...state };

    // Create fresh transition for this update cycle
    const transition = createChartTransition();

    // Get responsive dimensions
    const { width, height, innerWidth, innerHeight } = this.getDimensions();

    // Set SVG viewBox for responsive scaling
    this.svg.attr("viewBox", `0 0 ${width} ${height}`);
    this.svg.attr("aria-label", "World map showing average climate risk score by country");

    // Position plot group
    this.plot.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

    // Update projection to fit current dimensions
    this.projection.fitSize([innerWidth, innerHeight], { type: "Sphere" });

    // Position title
    this.titleText
      .attr("x", width / 2)
      .attr("y", 30)
      .attr("font-size", "1.1rem")
      .attr("font-weight", "600");

    // If no data, show empty state
    if (!data || data.length === 0) {
      this.renderEmpty(innerWidth, innerHeight);
      return;
    }

    // Clear empty state
    this.emptyLabel.attr("opacity", 0);

    // Create country lookup for fast data joining
    const countryDataMap = new Map(data.map((d) => [d.country, d]));

    // Update color scale domain based on actual data range
    const riskValues = data
      .map((d) => d.avgClimateRiskScore)
      .filter((v) => Number.isFinite(v));
    
    if (riskValues.length > 0) {
      const minRisk = d3.min(riskValues);
      const maxRisk = d3.max(riskValues);
      this.colorScale.domain([minRisk, maxRisk]);
    }

    // Draw graticule (grid lines)
    this.graticuleLayer
      .selectAll("path")
      .data([this.graticule()])
      .join("path")
      .attr("d", this.pathGenerator)
      .attr("fill", "none")
      .attr("stroke", "var(--gray-300, #d0d5dd)")
      .attr("stroke-width", 0.5)
      .attr("opacity", 0.3);

    // Bind country geometries to data
    const countries = this.countryLayer
      .selectAll("path.country")
      .data(this.geoData.features, (d) => d.properties.name || d.id);

    // Exit old countries
    countries.exit().transition(transition).attr("opacity", 0).remove();

    // Enter new countries
    const countriesEnter = countries
      .enter()
      .append("path")
      .attr("class", "country")
      .attr("d", this.pathGenerator)
      .attr("opacity", 0);

    // Merge enter + update selections
    const countriesMerged = countriesEnter.merge(countries);

    // Track unmatched countries for debugging
    const unmatchedGeoCountries = [];
    
    // Join with data and set fill color
    // Use normalized country names for better matching
    countriesMerged.each(function (geoFeature) {
      const geoCountryName = geoFeature.properties.name;
      const normalizedName = normalizeCountryName(geoCountryName);
      
      // Try normalized name first, fall back to original name
      let countryData = countryDataMap.get(normalizedName);
      if (!countryData) {
        countryData = countryDataMap.get(geoCountryName);
      }
      
      // Track unmatched for debugging
      if (!countryData && geoCountryName) {
        unmatchedGeoCountries.push(geoCountryName);
      }
      
      // Attach data to DOM element for interaction handlers
      d3.select(this).datum({ ...geoFeature, countryData });
    });
    
    // Log unmatched countries for debugging (first render only)
    if (unmatchedGeoCountries.length > 0 && !this.hasLoggedMatches) {
      console.log(`🗺️ Map: ${unmatchedGeoCountries.length} countries from TopoJSON not matched to climate data:`);
      console.log(unmatchedGeoCountries.sort().join(", "));
      console.log(`📊 Climate dataset has ${data.length} countries`);
      this.hasLoggedMatches = true;
    }

    // Set fill color based on climate risk score
    countriesMerged
      .transition(transition)
      .attr("opacity", 1)
      .attr("fill", (d) => {
        const risk = d.countryData?.avgClimateRiskScore;
        if (Number.isFinite(risk)) {
          return this.colorScale(risk);
        }
        return "var(--gray-100, #f2f4f7)"; // Default fill for no data
      })
      .attr("stroke", "var(--gray-400, #98a2b3)")
      .attr("stroke-width", 0.5);

    // Add accessible labels
    countriesMerged.attr("aria-label", (d) => {
      const name = d.properties.name;
      const risk = d.countryData?.avgClimateRiskScore;
      if (Number.isFinite(risk)) {
        return `${name}, climate risk score ${formatOneDecimal(risk)}`;
      }
      return `${name}, no climate data`;
    });

    // Bind interactive behavior
    bindInteractiveSelection(countriesMerged, {
      hover: (event, datum) => this.onHover(event, datum),
      leave: () => this.onLeave(),
      activate: (event, datum) => this.onClick(event, datum),
    });

    // Update highlighting based on interaction state
    this.updateHighlighting();

    // Render legend
    this.renderLegend(width, height);
  }

  /**
   * Updates visual highlighting based on current interaction state.
   * Highlights the selected or hovered country, dims others.
   */
  updateHighlighting() {
    const focusCountry = this.state.hoveredCountry || this.state.selectedCountry;

    this.countryLayer
      .selectAll("path.country")
      .classed("highlight", (d) => {
        const countryName = d.countryData?.country;
        return !!focusCountry && countryName === focusCountry;
      })
      .classed("dimmed", (d) => {
        const countryName = d.countryData?.country;
        return !!focusCountry && countryName !== focusCountry;
      });
  }

  /**
   * Updates interaction state from external triggers.
   * Called when other charts select/hover countries.
   */
  setInteractionState(state) {
    this.state = { ...state };
    this.updateHighlighting();
  }

  /**
   * Renders a color legend showing the climate risk score scale.
   */
  renderLegend(width, height) {
    const legendWidth = 240;
    const legendHeight = 12;
    const legendX = width - legendWidth - this.margin.right - 10;
    const legendY = height - this.margin.bottom - 40;

    // Create gradient definition for legend
    const gradient = this.legendLayer
      .selectAll("linearGradient")
      .data(["legend-gradient"])
      .join("linearGradient")
      .attr("id", "legend-gradient")
      .attr("x1", "0%")
      .attr("x2", "100%");

    // Add color stops
    const stops = [0, 0.25, 0.5, 0.75, 1];
    gradient
      .selectAll("stop")
      .data(stops)
      .join("stop")
      .attr("offset", (d) => `${d * 100}%`)
      .attr("stop-color", (d) => {
        const [min, max] = this.colorScale.domain();
        const value = min + (max - min) * d;
        return this.colorScale(value);
      });

    // Draw legend rectangle
    this.legendLayer
      .selectAll("rect.legend-bar")
      .data([null])
      .join("rect")
      .attr("class", "legend-bar")
      .attr("x", legendX)
      .attr("y", legendY)
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("fill", "url(#legend-gradient)")
      .attr("stroke", "var(--gray-400)")
      .attr("stroke-width", 0.5);

    // Add legend labels
    const [minVal, maxVal] = this.colorScale.domain();
    
    this.legendLayer
      .selectAll("text.legend-label-min")
      .data([minVal])
      .join("text")
      .attr("class", "legend-label-min")
      .attr("x", legendX)
      .attr("y", legendY - 5)
      .attr("font-size", "0.75rem")
      .attr("text-anchor", "start")
      .text((d) => formatOneDecimal(d));

    this.legendLayer
      .selectAll("text.legend-label-max")
      .data([maxVal])
      .join("text")
      .attr("class", "legend-label-max")
      .attr("x", legendX + legendWidth)
      .attr("y", legendY - 5)
      .attr("font-size", "0.75rem")
      .attr("text-anchor", "end")
      .text((d) => formatOneDecimal(d));

    this.legendLayer
      .selectAll("text.legend-title")
      .data(["Climate Risk Score"])
      .join("text")
      .attr("class", "legend-title")
      .attr("x", legendX + legendWidth / 2)
      .attr("y", legendY + legendHeight + 18)
      .attr("font-size", "0.8rem")
      .attr("text-anchor", "middle")
      .attr("fill", "var(--ink)")
      .text((d) => d);
  }

  /**
   * Dispatches hover event when user mouses over a country.
   * Shows tooltip and highlights the country across all charts.
   */
  onHover(event, datum) {
    const countryName = datum.countryData?.country;
    if (!countryName) return; // No data for this country

    this.dispatcher.call("countryHover", null, {
      event,
      datum: datum.countryData,
      country: countryName,
      chart: "map",
    });
  }

  /**
   * Dispatches leave event when mouse exits map countries.
   * Removes tooltip and clears temporary highlights.
   */
  onLeave() {
    this.dispatcher.call("countryOut", null, { chart: "map" });
  }

  /**
   * Dispatches click event to select/deselect a country.
   * Toggles sticky selection and filters all country charts.
   */
  onClick(event, datum) {
    const countryName = datum.countryData?.country;
    if (!countryName) return; // No data for this country

    this.dispatcher.call("countryClick", null, {
      event,
      datum: datum.countryData,
      country: countryName,
      chart: "map",
    });
  }

  /**
   * Shows empty state message when no data available.
   * Clears map and displays centered text.
   */
  renderEmpty(innerWidth, innerHeight) {
    this.countryLayer.selectAll("path.country").remove();
    this.graticuleLayer.selectAll("*").remove();
    this.legendLayer.selectAll("*").remove();
    this.emptyLabel
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("opacity", 1)
      .text("No geographic data available");
  }

  /**
   * Computes responsive dimensions from container bounding box.
   * Returns width, height, and inner dimensions after subtracting margins.
   */
  getDimensions() {
    const bounds = this.root.node().getBoundingClientRect();
    const width = Math.max(760, bounds.width || 1000);
    const height = 540; // Fixed height for consistent map aspect ratio
    const innerWidth = width - this.margin.left - this.margin.right;
    const innerHeight = height - this.margin.top - this.margin.bottom;

    return { width, height, innerWidth, innerHeight };
  }
}
