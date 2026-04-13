/**
 * Main Application Entry Point
 * 
 * Orchestrates the Climate Change and Population Risk storytelling application.
 * Initializes all chart components, loads datasets, wires interaction logic,
 * and sets up the navigation system for the multi-chapter narrative.
 * 
 * Key responsibilities:
 * - Load and validate CSV datasets
 * - Initialize 7 interactive D3 chart components
 * - Set up bidirectional filtering and linked highlighting
 * - Manage story navigation with IntersectionObserver
 * - Handle reset button and error states
 */

import { loadDatasets } from "./dataLoader.js";
import PopulationBarChart from "./barChart.js";
import EventsBarChart from "./eventsChart.js";
import HeatmapChart from "./heatmapChart.js";
import { initialState, wireInteractions } from "./interactions.js";
import LineChart from "./lineChart.js";
import RankShiftChart from "./rankShiftChart.js";
import RegionChart from "./regionChart.js";
import ScatterPlot from "./scatterPlot.js";

/**
 * Sets up automatic story navigation highlighting based on scroll position.
 * Uses IntersectionObserver to track which chapter is currently in view.
 */
function setupStoryNavigation() {
  // Query all story sections and navigation links
  const sections = Array.from(document.querySelectorAll("[data-chapter]"));
  const links = Array.from(document.querySelectorAll("[data-chapter-link]"));

  // Bail out if navigation elements missing or browser doesn't support IntersectionObserver
  if (!sections.length || !links.length || !("IntersectionObserver" in window)) {
    return;
  }

  // Helper to highlight the active navigation link matching the visible section
  const setActiveLink = (sectionId) => {
    links.forEach((link) => {
      link.classList.toggle("is-active", link.dataset.chapterLink === sectionId);
    });
  };

  // Create observer to detect which section is most visible in viewport
  const observer = new IntersectionObserver(
    (entries) => {
      // Find the entry with highest intersection ratio (most visible)
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      // Update active link when a new section becomes most visible
      if (visibleEntry) {
        setActiveLink(visibleEntry.target.id);
      }
    },
    {
      // Custom viewport margins to trigger earlier/later than exact viewport edges
      rootMargin: "-30% 0px -48% 0px",
      threshold: [0.2, 0.35, 0.5, 0.7],
    }
  );

  // Start observing all story sections
  sections.forEach((section) => observer.observe(section));
}

/**
 * Main application initialization function.
 * Loads data, creates charts, wires interactions, and handles errors.
 */
const app = async () => {
  // Query all DOM elements needed for interaction and display
  const statusNode = document.getElementById("selection-status");
  const insightNode = document.getElementById("dynamic-insight");
  const storyCalloutNode = document.getElementById("story-callout");
  const alertNode = document.getElementById("app-alert");
  const resetButton = document.getElementById("reset-selection");
  const tooltip = d3.select("#tooltip");

  // Enable reset button once JavaScript loads
  if (resetButton) {
    resetButton.disabled = false;
  }

  // Collect all KPI card elements for dynamic updates
  const kpiNodes = {
    focus: document.getElementById("kpi-focus"),
    events: document.getElementById("kpi-events"),
    region: document.getElementById("kpi-region"),
    shift: document.getElementById("kpi-shift"),
    exposed: document.getElementById("kpi-exposed"),
    totalAffected: document.getElementById("kpi-total-affected"),
    avgRisk: document.getElementById("kpi-avg-risk"),
  };

  // Initialize scroll-based story navigation
  setupStoryNavigation();

  try {
    // Load all CSV datasets asynchronously
    const allData = await loadDatasets();

    // Create D3 event dispatcher to coordinate interactions across all charts
    // Each event type corresponds to a user action (hover, click, etc.)
    const dispatcher = d3.dispatch(
      "countryHover",     // Mouse enters a country element
      "countryOut",       // Mouse leaves a country element
      "countryClick",     // User clicks to select/deselect a country
      "regionHover",      // Mouse enters a region element
      "regionOut",        // Mouse leaves a region element
      "regionClick",      // User clicks to select/deselect a region
      "trendHover",       // Mouse hovers over line chart point
      "trendOut",         // Mouse leaves line chart point
      "resetSelection"    // User clicks reset button
    );

    // Initialize interaction state (no selections yet)
    const state = { ...initialState };

    // Instantiate all 7 chart components with their DOM selectors and dispatcher
    // Chart 1: Global population trend over time (line chart)
    const lineChart = new LineChart({
      selector: "#line-chart",
      dispatcher,
    });

    // Chart 2: Population vs affected by continent (scatter plot with tooltips)
    const scatterPlot = new ScatterPlot({
      selector: "#scatter-chart",
      dispatcher,
      tooltipSelector: "#tooltip",
    });

    // Chart 3: Top 10 countries by population (horizontal bar chart)
    const populationBarChart = new PopulationBarChart({
      selector: "#population-bar-chart",
      dispatcher,
    });

    // Chart 4: Top 10 countries by extreme events (horizontal bar chart)
    const eventsBarChart = new EventsBarChart({
      selector: "#events-bar-chart",
      dispatcher,
    });

    // Chart 5: Climate fingerprint heatmap showing 6 burden metrics
    const heatmapChart = new HeatmapChart({
      selector: "#heatmap-chart",
      dispatcher,
      referenceData: allData.countryComparison,
    });

    // Chart 6: Rank shift slope chart comparing population vs impact ranks
    const rankShiftChart = new RankShiftChart({
      selector: "#rank-shift-chart",
      dispatcher,
    });

    // Chart 7: Regional impact summary (vertical bar chart)
    const regionChart = new RegionChart({
      selector: "#region-chart",
      dispatcher,
    });

    // Group charts by type for interaction controller
    // countryCharts respond to country/region filters, others show all data
    const charts = {
      lineChart,
      regionChart,
      countryCharts: [scatterPlot, populationBarChart, eventsBarChart, heatmapChart, rankShiftChart],
    };

    // Wire up all interaction logic (hover, click, filtering, tooltips, narratives)
    // Returns functions to render charts and reset selections
    const { applyFilterAndRender, resetSelection } = wireInteractions({
      dispatcher,
      charts,
      allData,
      state,
      statusNode,
      insightNode,
      tooltip,
      storyCalloutNode,
      kpiNodes,
    });

    // Attach reset button handler to clear all selections
    if (resetButton) {
      resetButton.addEventListener("click", resetSelection);
    }

    // Perform initial render with no filters applied
    console.log("Calling applyFilterAndRender for initial render");
    applyFilterAndRender();
    console.log("Initial render complete");
  } catch (error) {
    // Handle data loading or initialization errors gracefully
    // Display user-friendly error messages in all relevant UI elements
    statusNode.textContent = "Data loading error";
    statusNode.setAttribute("role", "alert");
    insightNode.textContent =
      "Unable to load one or more CSV files. Start the project with a local server such as run_app.bat so the browser can fetch the datasets correctly.";
    
    // Update callout panel with error message
    if (storyCalloutNode) {
      storyCalloutNode.textContent = "The application could not build the story because one or more datasets failed to load.";
    }
    
    // Show screen-reader-only alert
    if (alertNode) {
      alertNode.textContent =
        "The application failed to load its datasets. Run the page through a local server and confirm the CSV files are present.";
    }
    
    // Log detailed error info to console for debugging
    console.error("Application initialization failed:", error);
    console.error("Error stack:", error.stack);
  }
};

// Execute the application when script loads
app();
