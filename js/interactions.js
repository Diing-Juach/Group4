/**
 * Interaction Controller
 * 
 * Centralized event handling and state management for all chart interactions.
 * Implements bidirectional filtering, linked highlighting, tooltip management,
 * and dynamic narrative text generation based on user selections.
 * 
 * Key Features:
 * - Hover and click event coordination across all charts
 * - Country ↔ Region bidirectional filtering
 * - Automatic region highlighting when country is selected
 * - Dynamic KPI updates reflecting current focus
 * - Context-aware tooltip positioning and content
 * - Narrative text that adapts to filter state
 * 
 * State Management:
 * - selectedCountry/Region: Active filters that trigger full data re-render
 * - hoveredCountry/Region: Temporary highlights without data filtering
 * - linkedRegion: Auto-derived region for the focused country
 */

import { describeRankShift, formatInteger, formatOneDecimal, formatBillion } from "./chartUtils.js";

// Initial interaction state before any user input
export const initialState = {
  selectedCountry: null,   // Sticky selection from click
  hoveredCountry: null,    // Temporary highlight from hover
  selectedRegion: null,    // Sticky region filter from click
  hoveredRegion: null,     // Temporary region highlight from hover
  linkedRegion: null,      // Auto-derived region when country is selected
};

/**
 * Filters country data based on current selection state.
 * Applies region filter first, then country filter for drill-down behavior.
 */
export function getFilteredCountryData(allData, state) {
  let filtered = [...allData.countryComparison];

  // Apply region filter if a region is selected
  if (state.selectedRegion) {
    filtered = filtered.filter((row) => row.region === state.selectedRegion);
  }

  // Further filter to single country if selected
  if (state.selectedCountry) {
    filtered = filtered.filter((row) => row.country === state.selectedCountry);
  }

  return filtered;
}

/**
 * Resolves the currently focused country from selection or hover state.
 * Selection takes priority over hover.
 */
function getCurrentFocusCountry(allData, state) {
  const countryName = state.selectedCountry || state.hoveredCountry;
  return countryName ? allData.countryLookup.get(countryName) || null : null;
}

/**
 * Resolves the currently focused region from selection, hover, or linked state.
 * Checks selection first, then hover, then auto-linked region from country.
 */
function getCurrentFocusRegion(allData, state) {
  const regionName = state.selectedRegion || state.hoveredRegion || state.linkedRegion;
  return regionName ? allData.regionLookup.get(regionName) || null : null;
}

/**
 * Formats affected-to-population ratio as a multiplier string (e.g., "2.50x").
 */
function formatRatio(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : "N/A";
}

/**
 * Generates intelligent insights for a selected region.
 * Analyzes regional characteristics and top countries within the region.
 * 
 * @param {Object} region - The selected region data
 * @param {Object} allData - Complete dataset for comparative analysis
 * @returns {string} Human-readable insight text with regional findings
 */
function generateRegionInsight(region, allData) {
  if (!region) return "";

  // Get all countries in this region
  const countriesInRegion = allData.countryComparison.filter(c => c.region === region.region);
  const regionSize = countriesInRegion.length;

  // Calculate regional statistics
  const totalEvents = d3.sum(countriesInRegion, c => c.extremeEvents) || 0;
  const avgRisk = d3.mean(countriesInRegion, c => c.avgClimateRiskScore) || 0;
  const totalPopulation = d3.sum(countriesInRegion, c => c.populationMillions) || 0;

  // Find top country by affected population
  const topCountry = [...countriesInRegion].sort((a, b) => 
    d3.descending(a.affectedMillions || 0, b.affectedMillions || 0)
  )[0];

  // Find most vulnerable (highest affected share)
  const mostVulnerable = [...countriesInRegion].sort((a, b) => 
    d3.descending(a.affectedShare || 0, b.affectedShare || 0)
  )[0];

  // Compare to global averages
  const globalAvgRisk = d3.mean(allData.countryComparison, c => c.avgClimateRiskScore) || 0;
  const riskLevel = avgRisk > globalAvgRisk ? "elevated" : "moderate";
  const riskComparison = avgRisk > globalAvgRisk 
    ? `${((avgRisk / globalAvgRisk - 1) * 100).toFixed(0)}% above global average`
    : `${((1 - avgRisk / globalAvgRisk) * 100).toFixed(0)}% below global average`;

  // Build insight narrative
  const insights = [];
  
  insights.push(`<strong>${region.region}</strong> encompasses ${regionSize} countries with a combined population of ${formatBillion(totalPopulation)}`);
  insights.push(`records ${formatInteger(totalEvents)} extreme events affecting ${formatOneDecimal(region.totalPopulationAffectedMillions)} million people`);
  insights.push(`shows ${riskLevel} regional climate risk (score: ${formatOneDecimal(avgRisk)}, ${riskComparison})`);

  let keyFinding = "";
  if (topCountry) {
    const share = ((topCountry.affectedMillions / region.totalPopulationAffectedMillions) * 100).toFixed(0);
    keyFinding = ` <strong>${topCountry.country}</strong> accounts for ${share}% of the region's affected population (${formatOneDecimal(topCountry.affectedMillions)} million).`;
  }

  if (mostVulnerable && mostVulnerable.country !== topCountry?.country) {
    keyFinding += ` However, <strong>${mostVulnerable.country}</strong> shows the highest vulnerability with ${formatRatio(mostVulnerable.affectedShare)} of its population affected.`;
  }

  return insights.join(", ") + "." + keyFinding;
}

/**
 * Generates intelligent, comparative insights for a selected country.
 * Analyzes the country's metrics against dataset averages to provide contextual analysis.
 * 
 * @param {Object} country - The selected country data
 * @param {Object} allData - Complete dataset for comparative analysis
 * @returns {string} Human-readable insight text with key findings
 */
function generateCountryInsight(country, allData) {
  if (!country) return "";

  // Calculate dataset averages for comparison
  const avgEvents = d3.mean(allData.countryComparison, d => d.extremeEvents) || 0;
  const avgAffected = d3.mean(allData.countryComparison, d => d.affectedMillions) || 0;
  const avgRisk = d3.mean(allData.countryComparison, d => d.avgClimateRiskScore) || 0;
  const avgPopulation = d3.mean(allData.countryComparison, d => d.populationMillions) || 0;

  // Determine country's characteristics relative to averages
  const hasHighEvents = country.extremeEvents > avgEvents;
  const hasHighImpact = country.affectedMillions > avgAffected;
  const hasHighRisk = country.avgClimateRiskScore > avgRisk;
  const hasHighPopulation = country.populationMillions > avgPopulation;
  const hasPositiveRankShift = (country.rankChange || 0) > 0;

  // Build insight components
  const insights = [];

  // Population context
  const populationContext = hasHighPopulation 
    ? `<strong>${country.country}</strong> has a large population of ${formatBillion(country.populationMillions)}`
    : `<strong>${country.country}</strong> has a moderate population of ${formatBillion(country.populationMillions)}`;
  
  insights.push(populationContext);

  // Event frequency analysis
  const eventComparison = hasHighEvents
    ? `experiences ${formatInteger(country.extremeEvents)} extreme events (above the ${formatInteger(avgEvents)} average)`
    : `records ${formatInteger(country.extremeEvents)} extreme events (below the ${formatInteger(avgEvents)} average)`;
  
  insights.push(eventComparison);

  // Impact analysis
  if (hasHighImpact) {
    const impactRatio = (country.affectedMillions / avgAffected).toFixed(1);
    insights.push(`faces high human impact with ${formatOneDecimal(country.affectedMillions)} million people affected (${impactRatio}x the average)`);
  } else {
    insights.push(`has ${formatOneDecimal(country.affectedMillions)} million people affected`);
  }

  // Climate risk assessment
  const riskLevel = hasHighRisk ? "elevated" : "moderate";
  insights.push(`shows ${riskLevel} climate risk (score: ${formatOneDecimal(country.avgClimateRiskScore)})`);

  // Vulnerability driver analysis
  let driverAnalysis = "";
  if (hasHighImpact && !hasHighEvents) {
    driverAnalysis = " Vulnerability appears driven more by <strong>population density and exposure</strong> than event frequency.";
  } else if (hasHighEvents && hasHighImpact) {
    driverAnalysis = " The combination of <strong>frequent events and high population exposure</strong> creates compounding vulnerability.";
  } else if (hasPositiveRankShift) {
    driverAnalysis = ` Despite ${hasHighPopulation ? 'its large population' : 'moderate population size'}, it climbs <strong>${Math.abs(country.rankChange)} places</strong> in climate impact ranking, revealing disproportionate burden.`;
  } else if (country.rankChange < 0) {
    driverAnalysis = ` Its climate burden is <strong>proportional to population size</strong>, moving ${Math.abs(country.rankChange)} places down in relative impact rank.`;
  }

  // Combine all insights into a coherent narrative
  return insights.join(", ") + "." + driverAnalysis;
}

/**
 * Generates dynamic narrative text based on current selection or defaults to global summary.
 * Used to update the story callout panel with context-aware insights.
 */
function buildCallout(allData, state) {
  const focusCountry = getCurrentFocusCountry(allData, state);
  const focusRegion = getCurrentFocusRegion(allData, state);

  if (focusCountry) {
    return `${focusCountry.country} ${describeRankShift(
      focusCountry.rankChange
    )}, with ${formatOneDecimal(focusCountry.affectedMillions)} million people affected across ${formatInteger(
      focusCountry.extremeEvents
    )} events.`;
  }

  if (focusRegion) {
    return `${focusRegion.region} currently acts as the regional lens. It combines ${formatOneDecimal(
      focusRegion.totalPopulationAffectedMillions
    )} million affected people and uses ${focusRegion.topCountry} as its strongest country-level example.`;
  }

  const { biggestRankSurge, highestBurdenRegion } = allData.storySummary;
  return `${highestBurdenRegion?.region || "The leading region"} carries the largest total burden, while ${
    biggestRankSurge?.country || "the strongest outlier"
  } climbs furthest when the story shifts from population size to climate impact.`;
}

export function computeNarrative(currentData, state, allData) {
  if (!currentData.length) {
    return "No country currently matches the active filter. Reset the selection to return to the full comparison and continue the narrative.";
  }

  const focusCountry = getCurrentFocusCountry(allData, state);
  if (focusCountry && state.selectedCountry) {
    return `${focusCountry.country} records ${formatOneDecimal(
      focusCountry.affectedMillions
    )} million affected people across ${formatInteger(
      focusCountry.extremeEvents
    )} extreme events. Its exposure ratio is ${formatRatio(
      focusCountry.affectedShare
    )} of its 2022 population, and it moves from population rank ${formatInteger(
      focusCountry.populationRank
    )} to climate-impact rank ${formatInteger(focusCountry.affectedRank)}.`;
  }

  if (state.selectedRegion) {
    const region = allData.regionLookup.get(state.selectedRegion);
    const avgAffected = d3.mean(currentData, (row) => row.affectedMillions) ?? 0;
    return `${state.selectedRegion} is selected, reducing the story to ${formatInteger(
      currentData.length
    )} climate-linked countries. Together they account for ${formatOneDecimal(
      region?.totalPopulationAffectedMillions || 0
    )} million affected people, while ${region?.topCountry || "the leading country"} emerges as the strongest country-level example. The average country in this regional slice records ${formatOneDecimal(
      avgAffected
    )} million affected people.`;
  }

  const correlation = pearson(currentData, "populationMillions", "affectedMillions");
  const relationship =
    correlation > 0.4 ? "strongly positive" : correlation > 0.2 ? "moderately positive" : correlation < -0.2 ? "negative" : "weak";
  const { highestBurdenRegion, biggestRankSurge, mostExposedCountry } = allData.storySummary;

  return `Across ${formatInteger(allData.storySummary.totalCountries)} countries and ${formatInteger(
    allData.storySummary.totalExtremeEvents
  )} recorded extreme events, ${highestBurdenRegion?.region || "the leading region"} carries the largest total affected population at ${formatOneDecimal(
    highestBurdenRegion?.totalPopulationAffectedMillions || 0
  )} million. The relationship between population size and total impact is ${relationship} (r = ${correlation.toFixed(
    2
  )}), yet ${biggestRankSurge?.country || "the strongest outlier"} still climbs the rank-shift chart while ${
    mostExposedCountry?.country || "the most exposed country"
  } shows the highest affected-to-population ratio.`;
}

function updateKpis({ allData, currentData, state, kpiNodes }) {
  if (!kpiNodes) {
    return;
  }

  const focusCountry = getCurrentFocusCountry(allData, state);
  const focusRegion = getCurrentFocusRegion(allData, state);

  if (kpiNodes.focus) {
    kpiNodes.focus.textContent = focusCountry
      ? focusCountry.country
      : focusRegion
        ? focusRegion.region
        : `All ${formatInteger(allData.storySummary.totalCountries)} countries`;
  }

  if (kpiNodes.events) {
    kpiNodes.events.textContent = focusCountry
      ? `${formatInteger(focusCountry.extremeEvents)} events`
      : focusRegion
        ? `${formatInteger(focusRegion.extremeEvents)} events`
        : `${formatInteger(allData.storySummary.totalExtremeEvents)} events`;
  }

  if (kpiNodes.region) {
    kpiNodes.region.textContent = focusRegion
      ? `${focusRegion.region} - ${formatOneDecimal(focusRegion.totalPopulationAffectedMillions)}M`
      : `${allData.storySummary.highestBurdenRegion?.region || "N/A"} - ${formatOneDecimal(
          allData.storySummary.highestBurdenRegion?.totalPopulationAffectedMillions || 0
        )}M`;
  }

  if (kpiNodes.shift) {
    if (focusCountry) {
      kpiNodes.shift.textContent = describeRankShift(focusCountry.rankChange);
    } else {
      const scopedCountryData = focusRegion
        ? allData.countryComparison.filter((row) => row.region === focusRegion.region)
        : currentData;

      const rankLeader = focusRegion
        ? [...scopedCountryData].sort((a, b) => d3.descending(a.rankChange ?? -Infinity, b.rankChange ?? -Infinity))[0]
        : allData.storySummary.biggestRankSurge;

      if (rankLeader) {
        kpiNodes.shift.textContent = `${rankLeader.country} - ${describeRankShift(rankLeader.rankChange)}`;
      } else {
        kpiNodes.shift.textContent = "No shift data";
      }
    }
  }

  if (kpiNodes.exposed) {
    // Always show most exposed country (global or within region), not the selected country
    const scopedCountryData = focusRegion
      ? allData.countryComparison.filter((row) => row.region === focusRegion.region)
      : allData.countryComparison;

    const mostExposed = focusRegion
      ? [...scopedCountryData].sort((a, b) => d3.descending(a.affectedShare ?? -Infinity, b.affectedShare ?? -Infinity))[0]
      : allData.storySummary.mostExposedCountry;

    if (mostExposed) {
      kpiNodes.exposed.textContent = `${mostExposed.country} - ${formatRatio(mostExposed.affectedShare ?? 0)}`;
    } else {
      kpiNodes.exposed.textContent = "No exposure data";
    }
  }

  if (kpiNodes.totalAffected) {
    const totalAffected = d3.sum(currentData, (d) => d.affectedMillions ?? 0);
    kpiNodes.totalAffected.textContent = `${formatOneDecimal(totalAffected)} million`;
  }

  if (kpiNodes.avgRisk) {
    const avgRisk = d3.mean(currentData, (d) => d.avgClimateRiskScore) ?? 0;
    kpiNodes.avgRisk.textContent = formatOneDecimal(avgRisk);
  }
}

export function wireInteractions({
  dispatcher,
  charts,
  allData,
  state,
  statusNode,
  insightNode,
  tooltip,
  storyCalloutNode,
  kpiNodes,
}) {
  // Query insight panel DOM elements
  const insightPanel = document.getElementById("insight-panel");
  const insightContent = document.getElementById("insight-content");
  const closeInsightBtn = document.getElementById("close-insight");

  /**
   * Shows the dynamic insight panel with country-specific analysis.
   * Panel appears as floating overlay in top-right corner without scrolling.
   */
  const showInsightPanel = (country) => {
    if (!insightPanel || !insightContent || !country) return;
    
    const insight = generateCountryInsight(country, allData);
    const insightTitle = document.querySelector(".insight-title");
    if (insightTitle) {
      insightTitle.textContent = "📊 Country Analysis";
    }
    insightContent.innerHTML = insight;
    insightPanel.classList.remove("hidden");
  };

  /**
   * Shows the dynamic insight panel with region-specific analysis.
   */
  const showRegionInsightPanel = (region) => {
    if (!insightPanel || !insightContent || !region) return;
    
    const insight = generateRegionInsight(region, allData);
    const insightTitle = document.querySelector(".insight-title");
    if (insightTitle) {
      insightTitle.textContent = "🌍 Regional Analysis";
    }
    insightContent.innerHTML = insight;
    insightPanel.classList.remove("hidden");
  };

  /**
   * Hides the dynamic insight panel.
   */
  const hideInsightPanel = () => {
    if (!insightPanel) return;
    insightPanel.classList.add("hidden");
  };

  // Wire up close button
  if (closeInsightBtn) {
    closeInsightBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideInsightPanel();
    });
  }

  const renderHighlightsOnly = () => {
    // Hover states should feel instant, so we avoid full data rerenders unless a filter actually changes.
    charts.countryCharts.forEach((chart) => chart.setInteractionState(state));
    charts.regionChart.setInteractionState(state);
    charts.lineChart.setInteractionState(state);
  };

  const getRegionByCountry = (country) => allData.countryLookup.get(country)?.region || null;

  const syncLinkedRegionFromCountryState = () => {
    const countryFocus = state.hoveredCountry || state.selectedCountry;
    state.linkedRegion = getRegionByCountry(countryFocus);
  };

  const positionTooltip = (event) => {
    const hasPointer = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY);
    if (hasPointer) {
      tooltip.style("left", `${event.clientX + 16}px`).style("top", `${event.clientY - 14}px`);
      return;
    }

    const bounds = event?.currentTarget?.getBoundingClientRect?.();
    if (bounds) {
      tooltip.style("left", `${bounds.left + bounds.width / 2}px`).style("top", `${bounds.top - 8}px`);
    }
  };

  const showCountryTooltip = ({ event, datum, narrative, metricLabel, metricValueLabel }) => {
    if (!datum) {
      return;
    }

    const metricLine = metricLabel && metricValueLabel ? `<div>${metricLabel}: ${metricValueLabel}</div>` : "";

    tooltip
      .html(
        `<div class="name">${datum.country}</div>
         <div>Region: ${datum.region}</div>
         <div>Population: ${formatBillion(datum.populationMillions)}</div>
         <div>People affected: ${formatOneDecimal(datum.affectedMillions)} million</div>
         <div>Extreme events: ${formatInteger(datum.extremeEvents)}</div>
         <div>Climate risk: ${formatOneDecimal(datum.avgClimateRiskScore ?? 0)}</div>
         ${metricLine}
         <div>Rank shift: ${narrative || describeRankShift(datum.rankChange)}</div>`
      )
      .classed("visible", true);

    positionTooltip(event);
  };

  const showRegionTooltip = ({ event, datum }) => {
    if (!datum) {
      return;
    }

    tooltip
      .html(
        `<div class="name">${datum.region}</div>
         <div>People affected: ${formatOneDecimal(datum.totalPopulationAffectedMillions)} million</div>
         <div>Extreme events: ${formatInteger(datum.extremeEvents)}</div>
         <div>Countries in sample: ${formatInteger(datum.countryCount)}</div>
         <div>Top country: ${datum.topCountry}</div>`
      )
      .classed("visible", true);

    positionTooltip(event);
  };

  const showTrendTooltip = ({ event, datum }) => {
    if (!datum) {
      return;
    }

    tooltip
      .html(
        `<div class="name">Year ${Math.round(datum.year)}</div>
         <div>Global population: ${formatBillion(datum.globalPopulationMillions)}</div>`
      )
      .classed("visible", true);

    positionTooltip(event);
  };

  const hideTooltip = () => tooltip.classed("visible", false);

  const updateStatus = () => {
    const activeSelection = state.selectedCountry || state.selectedRegion || "None";
    const detailSummary = state.selectedCountry
      ? `Country: ${state.selectedCountry}`
      : state.selectedRegion
        ? `Region: ${state.selectedRegion}`
        : "No active filter";

    statusNode.textContent = `Selected Filter: ${activeSelection}`;
    statusNode.setAttribute("aria-label", `Selected filter. ${detailSummary}.`);
    statusNode.setAttribute("title", detailSummary);
  };

  const applyFilterAndRender = () => {
    // Clicks and reset actions take the full rerender path so every chart, KPI, and text panel stays in sync.
    syncLinkedRegionFromCountryState();
    const filteredCountries = getFilteredCountryData(allData, state);

    charts.countryCharts.forEach((chart) => chart.update(filteredCountries, state));
    charts.regionChart.update(allData.regionalImpact, state);
    charts.lineChart.update(allData.populationTrend, state);

    insightNode.textContent = computeNarrative(filteredCountries, state, allData);
    if (storyCalloutNode) {
      storyCalloutNode.textContent = buildCallout(allData, state);
    }
    updateKpis({ allData, currentData: filteredCountries, state, kpiNodes });
    updateStatus();
  };

  dispatcher.on("countryHover.interactions", (payload) => {
    state.hoveredCountry = payload.country;
    syncLinkedRegionFromCountryState();
    renderHighlightsOnly();
    showCountryTooltip(payload);
    updateKpis({ allData, currentData: getFilteredCountryData(allData, state), state, kpiNodes });
    if (storyCalloutNode) {
      storyCalloutNode.textContent = buildCallout(allData, state);
    }
  });

  dispatcher.on("countryOut.interactions", () => {
    state.hoveredCountry = null;
    syncLinkedRegionFromCountryState();
    renderHighlightsOnly();
    hideTooltip();
    updateKpis({ allData, currentData: getFilteredCountryData(allData, state), state, kpiNodes });
    if (storyCalloutNode) {
      storyCalloutNode.textContent = buildCallout(allData, state);
    }
  });

  dispatcher.on("countryClick.interactions", (payload) => {
    const nextCountry = state.selectedCountry === payload.country ? null : payload.country;
    state.selectedCountry = nextCountry;
    state.selectedRegion = null;
    state.hoveredCountry = null;
    state.hoveredRegion = null;
    syncLinkedRegionFromCountryState();
    hideTooltip();
    applyFilterAndRender();
    
    // Show/hide insight panel based on selection
    if (nextCountry) {
      const countryData = allData.countryLookup.get(nextCountry);
      showInsightPanel(countryData);
    } else {
      hideInsightPanel();
    }
  });

  dispatcher.on("regionHover.interactions", (payload) => {
    state.hoveredRegion = payload.region;
    renderHighlightsOnly();
    showRegionTooltip(payload);
    updateKpis({ allData, currentData: getFilteredCountryData(allData, state), state, kpiNodes });
    if (storyCalloutNode) {
      storyCalloutNode.textContent = buildCallout(allData, state);
    }
  });

  dispatcher.on("regionOut.interactions", () => {
    state.hoveredRegion = null;
    renderHighlightsOnly();
    hideTooltip();
    updateKpis({ allData, currentData: getFilteredCountryData(allData, state), state, kpiNodes });
    if (storyCalloutNode) {
      storyCalloutNode.textContent = buildCallout(allData, state);
    }
  });

  dispatcher.on("regionClick.interactions", (payload) => {
    const nextRegion = state.selectedRegion === payload.region ? null : payload.region;
    state.selectedRegion = nextRegion;
    state.selectedCountry = null;
    state.hoveredRegion = null;
    state.hoveredCountry = null;
    syncLinkedRegionFromCountryState();
    hideTooltip();
    applyFilterAndRender();
    
    // Show/hide region insight panel based on selection
    if (nextRegion) {
      const regionData = allData.regionLookup.get(nextRegion);
      showRegionInsightPanel(regionData);
    } else {
      hideInsightPanel();
    }
  });

  dispatcher.on("trendHover.interactions", (payload) => {
    showTrendTooltip(payload);
  });

  dispatcher.on("trendOut.interactions", () => {
    hideTooltip();
  });

  const resetSelection = () => {
    state.selectedCountry = null;
    state.hoveredCountry = null;
    state.selectedRegion = null;
    state.hoveredRegion = null;
    state.linkedRegion = null;
    hideTooltip();
    hideInsightPanel();
    applyFilterAndRender();
  };

  dispatcher.on("resetSelection.interactions", resetSelection);

  return {
    applyFilterAndRender,
    resetSelection,
  };
}

function pearson(data, xKey, yKey) {
  const values = data
    .map((row) => ({ x: row[xKey], y: row[yKey] }))
    .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y));

  const sampleSize = values.length;
  if (sampleSize < 2) {
    return 0;
  }

  const meanX = d3.mean(values, (row) => row.x) ?? 0;
  const meanY = d3.mean(values, (row) => row.y) ?? 0;

  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;

  values.forEach(({ x, y }) => {
    const deltaX = x - meanX;
    const deltaY = y - meanY;
    numerator += deltaX * deltaY;
    denominatorX += deltaX * deltaX;
    denominatorY += deltaY * deltaY;
  });

  const denominator = Math.sqrt(denominatorX * denominatorY);
  return denominator === 0 ? 0 : numerator / denominator;
}
