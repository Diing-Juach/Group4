/**
 * Data Loader
 * 
 * Loads, parses, and transforms CSV datasets for the climate storytelling application.
 * Handles unit conversions, data aggregation, and computation of derived metrics.
 * 
 * Data Sources:
 * - Cleaned climate extreme weather events
 * - World population historical data
 * - Country-level comparison with climate impacts
 * - Country-level climate event aggregates
 * - Global population trend time series
 * - Regional impact summaries
 * 
 * All population values are converted to millions for consistency.
 */

// Historical population year columns mapped to their dataset keys
const POPULATION_TIMELINE = [
  { year: 1970, key: "population1970Raw" },
  { year: 1980, key: "population1980Raw" },
  { year: 1990, key: "population1990Raw" },
  { year: 2000, key: "population2000Raw" },
  { year: 2010, key: "population2010Raw" },
  { year: 2015, key: "population2015Raw" },
  { year: 2020, key: "population2020Raw" },
  { year: 2022, key: "population2022Raw" },
];

/**
 * Safely converts a value to a number, returning null for invalid inputs.
 * Used throughout parsing to handle missing or malformed CSV values.
 */
const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * Performs safe division with null/zero handling to avoid NaN or Infinity.
 * Returns null if either operand is invalid or if divisor is zero.
 */
const safeDivide = (value, divisor) => {
  if (!Number.isFinite(value) || !Number.isFinite(divisor) || divisor === 0) {
    return null;
  }

  return value / divisor;
};

/**
 * Parses a single row from the climate extreme weather CSV.
 * Converts string values to numbers and handles missing data gracefully.
 */
function parseClimateRow(row) {
  return {
    recordId: row.record_id?.trim(),
    country: row.country?.trim(),
    region: row.region?.trim() || "Unknown",
    avgTemperatureC: toNumber(row.avg_temperature_c),
    temperatureChangeC: toNumber(row.temperature_change_c),
    co2EmissionsMt: toNumber(row.co2_emissions_mt),
    seaLevelRiseMm: toNumber(row.sea_level_rise_mm),
    floodRisk: row.flood_risk?.trim() || "Unknown",
    droughtRisk: row.drought_risk?.trim() || "Unknown",
    heatwaveDays: toNumber(row.heatwave_days),
    wildfireIncidents: toNumber(row.wildfire_incidents),
    rainfallChangeMm: toNumber(row.rainfall_change_mm),
    airQualityIndex: toNumber(row.air_quality_index),
    climateRiskScore: toNumber(row.climate_risk_score),
    affectedRaw: toNumber(row.population_affected_m),
    year: toNumber(row.year),
    extremeEvent: toNumber(row.extreme_event) ?? 0,
  };
}

/**
 * Parses a single row from the world population CSV.
 * Extracts historical population values and demographic metrics.
 */
function parsePopulationRow(row) {
  return {
    rank: toNumber(row.rank),
    cca3: row.cca3?.trim(),
    country: row.country?.trim(),
    capital: row.capital?.trim(),
    continent: row.continent?.trim() || "Unknown",
    population2022Raw: toNumber(row.population_2022),
    population2020Raw: toNumber(row.population_2020),
    population2015Raw: toNumber(row.population_2015),
    population2010Raw: toNumber(row.population_2010),
    population2000Raw: toNumber(row.population_2000),
    population1990Raw: toNumber(row.population_1990),
    population1980Raw: toNumber(row.population_1980),
    population1970Raw: toNumber(row.population_1970),
    areaKm2: toNumber(row.area_km2),
    densityPerKm2: toNumber(row.density_per_km2),
    growthRate: toNumber(row.growth_rate),
    worldPopulationPercentage: toNumber(row.world_population_percentage),
    populationChange2010To2022: toNumber(row.population_change_2010_2022),
    populationChangePct2010To2022: toNumber(row.population_change_pct_2010_2022),
  };
}

/**
 * Computes the average of a numeric field across an array of rows.
 * Filters out non-finite values before averaging.
 */
function average(rows, accessor) {
  const values = rows.map(accessor).filter(Number.isFinite);
  return values.length ? d3.mean(values) : null;
}

/**
 * Builds global population trend time series for the line chart.
 * Sums population across all countries for each historical year.
 */
function buildPopulationTrend(populationRows) {
  return POPULATION_TIMELINE.map(({ year, key }) => {
    // Sum all country populations for this year
    const globalPopulationRaw = d3.sum(populationRows, (row) => row[key] || 0);
    return {
      year,
      globalPopulationRaw,
      globalPopulationMillions: safeDivide(globalPopulationRaw, 1_000_000),
    };
  });
}

/**
 * Aggregates climate events by country and merges with population data.
 * Computes derived metrics like affected-to-population ratio and average climate indicators.
 */
function buildCountryMetrics(climateRows, populationRows) {
  // Create lookup map for fast population data access by country name
  const populationByCountry = new Map(populationRows.map((row) => [row.country, row]));
  
  // Group climate events by country for aggregation
  const groupedClimate = d3.group(climateRows, (row) => row.country);

  // Merge event-level climate records into chart-ready country summaries
  const countryMetrics = Array.from(groupedClimate, ([country, rows]) => {
    const population = populationByCountry.get(country);
    const affectedRaw = d3.sum(rows, (row) => row.affectedRaw || 0);
    const populationRaw = population?.population2022Raw ?? null;
    const populationMillions = safeDivide(populationRaw, 1_000_000);
    const affectedMillions = safeDivide(affectedRaw, 1_000);
    const affectedShare = safeDivide(affectedMillions, populationMillions);

    return {
      country,
      region: rows[0]?.region || population?.continent || "Unknown",
      continent: population?.continent || rows[0]?.region || "Unknown",
      capital: population?.capital || "",
      populationRaw,
      populationMillions,
      affectedRaw,
      affectedMillions,
      affectedShare,
      extremeEvents: d3.sum(rows, (row) => row.extremeEvent || 0),
      recordCount: rows.length,
      avgTemperatureC: average(rows, (row) => row.avgTemperatureC),
      avgTemperatureChangeC: average(rows, (row) => row.temperatureChangeC),
      avgCo2EmissionsMt: average(rows, (row) => row.co2EmissionsMt),
      avgSeaLevelRiseMm: average(rows, (row) => row.seaLevelRiseMm),
      avgHeatwaveDays: average(rows, (row) => row.heatwaveDays),
      avgWildfireIncidents: average(rows, (row) => row.wildfireIncidents),
      rainfallVolatilityMm: average(rows, (row) =>
        Number.isFinite(row.rainfallChangeMm) ? Math.abs(row.rainfallChangeMm) : null
      ),
      avgAirQualityIndex: average(rows, (row) => row.airQualityIndex),
      avgClimateRiskScore: average(rows, (row) => row.climateRiskScore),
      floodHighShare: average(rows, (row) => (row.floodRisk === "High" ? 1 : 0)) ?? 0,
      droughtHighShare: average(rows, (row) => (row.droughtRisk === "High" ? 1 : 0)) ?? 0,
      densityPerKm2: population?.densityPerKm2 ?? null,
      growthRate: population?.growthRate ?? null,
      worldPopulationPercentage: population?.worldPopulationPercentage ?? null,
      populationChange2010To2022: population?.populationChange2010To2022 ?? null,
      populationChangePct2010To2022: population?.populationChangePct2010To2022 ?? null,
    };
  })
    // Filter out rows with missing essential data
    .filter(
      (row) =>
        row.country &&
        Number.isFinite(row.populationMillions) &&
        Number.isFinite(row.affectedMillions) &&
        Number.isFinite(row.extremeEvents)
    )
    // Sort by affected population for default display order
    .sort((a, b) => d3.descending(a.affectedMillions, b.affectedMillions));

  // Compute rank by population (1 = highest population)
  const populationRanks = new Map(
    [...countryMetrics]
      .sort((a, b) => d3.descending(a.populationMillions, b.populationMillions))
      .map((row, index) => [row.country, index + 1])
  );

  // Compute rank by affected population (1 = most affected)
  const affectedRanks = new Map(
    [...countryMetrics]
      .sort((a, b) => d3.descending(a.affectedMillions, b.affectedMillions))
      .map((row, index) => [row.country, index + 1])
  );

  // Compute rank by affected-to-population ratio (1 = highest exposure relative to size)
  const exposureRanks = new Map(
    [...countryMetrics]
      .sort((a, b) => d3.descending(a.affectedShare ?? -Infinity, b.affectedShare ?? -Infinity))
      .map((row, index) => [row.country, index + 1])
  );

  // Attach ranks and compute rank shift for slope chart visualization
  return countryMetrics.map((row) => {
    const populationRank = populationRanks.get(row.country) || null;
    const affectedRank = affectedRanks.get(row.country) || null;
    const exposureRank = exposureRanks.get(row.country) || null;

    return {
      ...row,
      populationRank,
      affectedRank,
      exposureRank,
      // Positive rankChange means country moves UP in impact rank (more disproportionate burden)
      rankChange:
        Number.isFinite(populationRank) && Number.isFinite(affectedRank) ? populationRank - affectedRank : null,
    };
  });
}

/**
 * Aggregates country-level data into regional summaries.
 * Used by region chart and narrative panels to show continental patterns.
 */
function buildRegionalMetrics(countryMetrics) {
  // Use D3 rollup to group countries by region and compute aggregates
  return Array.from(
    d3.rollup(
      countryMetrics,
      (rows) => ({
        region: rows[0]?.region || "Unknown",
        countryCount: rows.length,
        extremeEvents: d3.sum(rows, (row) => row.extremeEvents || 0),
        totalPopulationAffectedRaw: d3.sum(rows, (row) => row.affectedRaw || 0),
        totalPopulationAffectedMillions: d3.sum(rows, (row) => row.affectedMillions || 0),
        averageClimateRiskScore: average(rows, (row) => row.avgClimateRiskScore),
        averageAffectedShare: average(rows, (row) => row.affectedShare),
        // Identify the most affected country within this region
        topCountry: [...rows].sort((a, b) => d3.descending(a.affectedMillions, b.affectedMillions))[0]?.country || "",
      }),
      (row) => row.region
    ).values()
  ).sort((a, b) => d3.descending(a.totalPopulationAffectedMillions, b.totalPopulationAffectedMillions));
}

/**
 * Computes global summary statistics and extremes for narrative text and KPI cards.
 * These facts drive the storytelling elements throughout the application.
 */
function buildStorySummary(countryMetrics, regionalImpact) {
  // Find countries with notable patterns for narrative highlights
  const mostAffectedCountry = [...countryMetrics].sort((a, b) => d3.descending(a.affectedMillions, b.affectedMillions))[0] || null;
  const mostExposedCountry = [...countryMetrics].sort((a, b) => d3.descending(a.affectedShare ?? -Infinity, b.affectedShare ?? -Infinity))[0] || null;
  const biggestRankSurge = [...countryMetrics].sort((a, b) => d3.descending(a.rankChange ?? -Infinity, b.rankChange ?? -Infinity))[0] || null;
  const biggestRankDrop = [...countryMetrics].sort((a, b) => d3.ascending(a.rankChange ?? Infinity, b.rankChange ?? Infinity))[0] || null;
  const highestBurdenRegion = regionalImpact[0] || null;

  return {
    totalCountries: countryMetrics.length,
    totalExtremeEvents: d3.sum(countryMetrics, (row) => row.extremeEvents || 0),
    totalAffectedMillions: d3.sum(countryMetrics, (row) => row.affectedMillions || 0),
    averageClimateRiskScore: average(countryMetrics, (row) => row.avgClimateRiskScore),
    mostAffectedCountry,
    mostExposedCountry,
    biggestRankSurge,
    biggestRankDrop,
    highestBurdenRegion,
  };
}

/**
 * Loads world geography TopoJSON for the map visualization.
 * Uses the world-atlas package from unpkg CDN (https://unpkg.com/world-atlas).
 * Returns GeoJSON features after converting from TopoJSON.
 */
async function loadWorldGeography() {
  try {
    // Load TopoJSON from CDN
    const topology = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
    
    // Convert TopoJSON to GeoJSON features
    const countries = topojson.feature(topology, topology.objects.countries);
    
    return countries;
  } catch (error) {
    console.error("Failed to load world geography:", error);
    // Return empty feature collection if loading fails
    return { type: "FeatureCollection", features: [] };
  }
}

/**
 * Main entry point for data loading and transformation.
 * Loads CSVs and world geography in parallel, derives all views, and returns structured data object.
 * This single function provides all data dependencies needed by charts and interactions.
 */
export async function loadDatasets() {
  // Load CSVs and world geography concurrently using Promise.all for faster init
  const [climateCleaned, populationCleaned, worldGeo] = await Promise.all([
    d3.csv("./data/cleaned/climate_extreme_weather_cleaned.csv", parseClimateRow),
    d3.csv("./data/cleaned/world_population_cleaned.csv", parsePopulationRow),
    loadWorldGeography(),
  ]);

  // Build all derived views from raw data
  const countryComparison = buildCountryMetrics(climateCleaned, populationCleaned);
  const regionalImpact = buildRegionalMetrics(countryComparison);
  const populationTrend = buildPopulationTrend(populationCleaned);
  const storySummary = buildStorySummary(countryComparison, regionalImpact);

  return {
    climateCleaned,
    populationCleaned,
    countryComparison,
    rankShift: [...countryComparison].sort((a, b) => d3.ascending(a.populationRank, b.populationRank)),
    regionalImpact,
    populationTrend,
    storySummary,
    worldGeo, // Geographic features for map chart
    countryLookup: new Map(countryComparison.map((row) => [row.country, row])),
    regionLookup: new Map(regionalImpact.map((row) => [row.region, row])),
  };
}
