import { describeRankShift, formatInteger, formatOneDecimal } from "./chartUtils.js";

export const initialState = {
  selectedCountry: null,
  hoveredCountry: null,
  selectedRegion: null,
  hoveredRegion: null,
  linkedRegion: null,
};

export function getFilteredCountryData(allData, state) {
  let filtered = [...allData.countryComparison];

  if (state.selectedRegion) {
    filtered = filtered.filter((row) => row.region === state.selectedRegion);
  }

  if (state.selectedCountry) {
    filtered = filtered.filter((row) => row.country === state.selectedCountry);
  }

  return filtered;
}

function getCurrentFocusCountry(allData, state) {
  const countryName = state.selectedCountry || state.hoveredCountry;
  return countryName ? allData.countryLookup.get(countryName) || null : null;
}

function getCurrentFocusRegion(allData, state) {
  const regionName = state.selectedRegion || state.hoveredRegion || state.linkedRegion;
  return regionName ? allData.regionLookup.get(regionName) || null : null;
}

function formatRatio(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : "N/A";
}

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
      return;
    }

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
         <div>Population: ${formatOneDecimal(datum.populationMillions)} million</div>
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
        `<div class="name">Year ${formatInteger(datum.year)}</div>
         <div>Global population: ${formatOneDecimal(datum.globalPopulationMillions)} million</div>`
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
