# Climate Change and Population Risk

Interactive single-page data story built with `HTML`, `CSS`, `JavaScript`, and `D3.js v7`.

The application combines climate extreme weather event data with global population statistics to reveal geographic patterns of vulnerability and disproportionate climate burden across countries and regions.

## Story Structure

The page is organised as a guided narrative with 8 chapters:

1. **Geographic Overview**: World map showing climate risk distribution by country
2. **Global Baseline**: Long-run population growth trend setting exposure context
3. **Core Relationship**: Population vs affected population scatter plot with risk encoding
4. **Country Comparison**: Linked rankings by population and extreme events
5. **Climate Fingerprint**: Normalized heatmap comparing six burden metrics
6. **Rank Shift Analysis**: Slope chart revealing disproportionate climate impacts
7. **Regional Aggregation**: Continental summaries with bidirectional filtering
8. **Reflection**: Dynamic insights and key takeaways

## How To Run

**Extract the zip**
1. **Extract the entire zip file** to a folder (e.g., Desktop or Documents)
2. **Navigate INTO the extracted folder** (you should see `index.html`, `run_app.bat`, `css/`, `js/`, `data/` folders)
3. **Double-click `run_app.bat`** in the project folder.
The browser should open automatically to `http://127.0.0.1:8000/`
If it doesn't open automatically, manually navigate to: `http://127.0.0.1:8000/`

**Why a local server is required:**
- The app loads CSV files dynamically with `d3.csv()`
- The map loads GeoJSON data from a CDN using `d3.json()`
- Modern browsers block file system access from `file://` for security
- A local server (HTTP) allows proper data loading

**Dependencies:**
- D3.js v7 (loaded from CDN: https://d3js.org/d3.v7.min.js)
- TopoJSON library (loaded from CDN: https://cdn.jsdelivr.net/npm/topojson@3)
- World Atlas GeoJSON (loaded from: https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json)

## Data Processing Pipeline

**Data sources actively loaded by the application:**
- `data/cleaned/climate_extreme_weather_cleaned.csv` - Country-level climate events
- `data/cleaned/world_population_cleaned.csv` - Historical population data
- World Atlas TopoJSON (fetched from CDN) - Geographic boundaries for map visualization


### Climate dataset processing

`js/dataLoader.js` parses each climate row into typed values:
- country and region
- temperature and air-quality metrics
- rainfall, wildfire, sea-level, and heatwave indicators
- affected population
- extreme event flag

It then groups rows by country and derives:
- total affected population
- total extreme events
- average climate risk score
- average temperature change
- average heatwave and wildfire levels
- rainfall volatility
- flood and drought high-risk shares

### Population dataset processing

The population dataset provides:
- 2022 population for country-level comparisons
- continent metadata for color encoding
- density and growth rate for extra context
- historical population columns used to build the global trend chart

## Visualisations

The page contains **8 interactive D3 visualizations**:

1. **Choropleth World Map** (`js/mapChart.js`): Geographic overview showing average climate risk score by country.
2. **Line Chart** (`js/lineChart.js`): Global population trend from 1970-2022
3. **Bubble Scatter Plot** (`js/scatterPlot.js`): Population vs affected population, bubble size = climate risk score, color = continent
4. **Horizontal Bar Chart** (`js/barChart.js`): Top countries by 2022 population
5. **Horizontal Bar Chart** (`js/eventsChart.js`): Top countries by extreme events count
6. **Heatmap Matrix** (`js/heatmapChart.js`): Normalized 6-metric climate fingerprint per country
7. **Slope Chart** (`js/rankShiftChart.js`): Population rank vs climate-impact rank comparison
8. **Vertical Bar Chart** (`js/regionChart.js`): Regional aggregates of affected population

### Distinctive charts

**World Map Choropleth**: Provides immediate geographic context by showing climate risk distribution globally. Uses Natural Earth projection for balanced world view, includes graticule for spatial reference, and integrates seamlessly with the linked interaction system.

**Heatmap Matrix**: The strongest multivariate view, comparing six burden indicators (affected ratio, events, risk score, CO2, flood risk, drought risk) in a single normalized matrix. Enables rapid cross-country comparison without chart switching.

**Slope Chart**: Reveals disproportionate climate burden by visualizing rank shifts between population size and climate impact. Countries moving up in rank face outsized climate burden relative to their population.

## Interaction Model

The application uses a shared D3 dispatcher and a central interaction controller enabling coordinated interactions across all visualizations.

**Supported interactions:**
- **Hover** on countries (map, scatter, bars, heatmap, slope chart) → tooltips + linked highlighting
- **Click** on countries → filters all country-level views to selected country + shows floating insight panel with detailed analysis
- **Hover** on regions (region chart) → preview regional context
- **Click** on regions → filters country charts to show only countries in that region + shows regional insight panel
- **Hover** on line chart → inspect population baseline for specific years
- **Reset button** → clears all active filters and returns to global view

**Dynamic Insight Panel:**
- **Floating overlay** appears when selecting countries or regions
- **Country analysis**: Shows affected population, extreme events, exposure ratio, risk score, and comparative context
- **Regional analysis**: Displays aggregate statistics, top countries, vulnerability patterns, and comparison to global averages
- **Responsive positioning**: Panel appears in top-right corner with smooth animations
- **Close button**: Dismiss panel or select different entity to update

**Bidirectional linking** between country-level charts:
- **World map** ↔ scatter plot ↔ bar charts ↔ heatmap ↔ slope chart
- Selecting a country in ANY chart highlights it in ALL charts
- Map provides geographic context that updates dynamically with selections

**Region-to-country filtering:**
- Clicking a region in the region chart filters all country charts
- Country selection also highlights the corresponding region
- Two-way navigation between continental and national scales

## Architecture

### Top-level files

- `index.html`: single-page structure for the story, chart containers, KPI cards, and narrative panels
- `css/styles.css`: design system with comprehensive section comments, responsive layout, accessible focus states, chart styling, and CSS variables for theming
- `run_app.bat`: local server helper

### JavaScript modules

- `js/main.js`
  - bootstraps the app
  - instantiates charts
  - wires chapter navigation
  - connects the reset control

- `js/dataLoader.js`
  - loads both cleaned CSV files
  - fetches world geography TopoJSON from CDN and converts to GeoJSON
  - parses numeric fields safely
  - derives country, region, and trend datasets in memory
  - prepares lookup maps and story summaries

- `js/interactions.js`
  - stores shared interaction state
  - applies cross-filtering logic
  - generates and displays dynamic insight panels for countries and regions
  - updates narrative text, KPI cards, and tooltip content
  - synchronises highlight states across charts

- `js/chartUtils.js`
  - shared chart helpers
  - number formatting
  - reduced-motion-aware transitions
  - keyboard-accessible interaction binding
  - shared colour definitions

- `js/mapChart.js`
  - renders the choropleth world map
  - uses Natural Earth projection and TopoJSON conversion
  - colors countries by average climate risk score
  - includes graticule grid and color legend

- `js/lineChart.js`
  - renders the global population baseline trend

- `js/scatterPlot.js`
  - renders the main relationship view (population vs affected)
  - uses continent color and climate-risk bubble size

- `js/barChart.js`
  - renders the population ranking view

- `js/eventsChart.js`
  - renders the extreme-event ranking view

- `js/heatmapChart.js`
  - renders the normalized country fingerprint matrix
  - compares multiple burden indicators in one linked view

- `js/rankShiftChart.js`
  - renders the slope chart for rank changes

- `js/regionChart.js`
  - renders the region aggregation view

