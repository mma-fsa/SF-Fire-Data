let margin = {
    top: 25,
    bottom: 25,
    right: 25,
    left: 25
}
let width = window.innerWidth - margin.left - margin.right;
let height = window.innerHeight - margin.top - margin.bottom;

let visWidth = d3.select("#visualization").node().clientWidth;
let svgWidth = visWidth - 50;
let svgHeight = window.innerHeight * .75;


if (svgWidth < 800) {
    svgWidth = 800;
}
if (svgHeight < 600) {
    svgHeight = 600;
}

const svg = d3
    .select("#visualization")
    .append("svg")
    .attr("id", "map")
    .attr("height", svgHeight)
    .attr("width", svgWidth)
    .attr("style", "background-color: e5f0f9; margin-left: 25px;")

$("#visualization")
    .attr("style", "width: " + (svgWidth+50) + "px !important;")
    .attr("style", "padding-bottom: 25px;");

// create the map layers
const baseMap = svg.append("g").attr("id", "base_map");
const mapGrid = svg.append("g").attr("id", "map_grid");
const catchmentArea = svg.append("g").attr("id", "catchment_area");
const facilities = svg.append("g").attr("id", "facilities");
const mapLegend = svg.append("g").attr("id", "map_legend");
const simulationFacility = svg.append("g").attr("id", "simulation_facility");

let visType = "sim";
let simType = 'sa';
let lastClickedFacility = null;

Promise.all([
    //d3.dsv(",", "ratings-by-country.csv"),
    d3.json("data/sf_neighborhoods.geojson"),
    d3.json("data/grid_definitions.geojson"),
    d3.json("data/current_fire_stations.geojson"),
    d3.dsv(",", "data/baseline_fca_output.csv"),
    d3.dsv(",", "data/travel_time.csv"),
    d3.dsv(",", "data/simulation_fca_output.csv"),
    d3.dsv(",", "data/baseline_response_time.csv"),
    d3.dsv(",", "data/simulation_response_time.csv"),
    d3.dsv(",", "data/demand.csv"),
    d3.dsv(",", "data/supply_data.csv"),
    d3.json("data/catchment_areas.geojson")
]).then(function (data) {

    const sfMapData = data[0];
    const mapGridData = data[1];
    const sfFacilityData = data[2];
    const baselineFcaOutput = data[3];
    const travelTime = data[4];
    const simulationFcaOutput = preprocessSimulationData(data[5]);
    const baselineResponseTime = data[6];
    const simulationResponseTime = preprocessSimulationData(data[7]);
    const demandData = data[8];
    const supplyData = data[9];
    const catchmentData = data[10]

    // draws the base map
    const mapCtx = setupMap(sfMapData);

    function drawMap() {
        facilities.selectAll("*").remove();
        mapGrid.selectAll("*").remove();
        mapLegend.selectAll("*").remove();
        simulationFacility.selectAll("*").remove();
        catchmentArea.selectAll("*").remove();

        updateLegendLabels();

        refreshData(mapCtx, {
            sfFacilityData: sfFacilityData,
            mapGridData: mapGridData,
            baselineFcaOutput: baselineFcaOutput,
            travelTime: travelTime,
            simulationFcaOutput: simulationFcaOutput,
            baselineResponseTime: baselineResponseTime,
            simulationResponseTime: simulationResponseTime,
            demandData: demandData,
            supplyData: supplyData,
            catchmentData: catchmentData
        });
    }

    $("#reset_fca").click(function (evt) {
        drawMap();
    });

    d3.selectAll("input[name='simulation_type']").on("change", function () {
        simType = this.value;
        drawMap();
    });

    d3.select("#dropdown").on("change", function () {
        visType = this.value;
        drawMap();
    });

    drawMap();
});


function preprocessSimulationData(simulationData) {
    let simulations = {};
    simulationData.forEach(x => {
        const simName = x.scenario_name;
        if (!(simName in simulations)) {
            simulations[simName] = [];
        }
        simulations[simName].push(x);
    });
    return simulations;
}

/*
  Rather than precomputing everything for everywhere the user could click, this function
  uses "partial application" (in the functional programming sense) to compute values "just-in-time".
*/
function createTooltipDataProcessor(baselineFcaOutput, simulationFcaOutput, demandDataRaw, supplyDataRaw) {

    // shallow copy the data, and merge it all together
    const allData = Object.assign({}, simulationFcaOutput);
    allData["baseline"] = baselineFcaOutput;

    // process the demand data into a lookup table w/ numeric values
    const demandData = {};
    demandDataRaw.forEach(demandRow => {
        demandData[demandRow.zone_idx] = Number.parseFloat(demandRow.value);
    });

    const supplyData = {};
    supplyDataRaw.forEach(supplyRow => {
        supplyData[supplyRow.zone_idx] = Number.parseFloat(supplyRow.value);
    });

    // use partial application to create a tooltip processor for the scenario
    // the first selects the scenario, the second displays the data for the point
    return (scenarioName) => {

        if (!(scenarioName in allData)) {
            return (zoneIdx) => "<no data>";
        }

        const selectedScenarioData = allData[scenarioName];
        const currentScenarioTooltip = {};
        selectedScenarioData.forEach((scenarioRow) => {
            currentScenarioTooltip[scenarioRow.zone_idx] = {
                "incidentsPerDay": demandData[scenarioRow.zone_idx] / 365.0,
                "availableUnits": supplyData[scenarioRow.zone_idx],
                "accessibilityScore": Number.parseFloat(scenarioRow.value)
            }
        });

        // return a function which can use the data we just precomputed
        return (zoneIdx) => currentScenarioTooltip[zoneIdx];
    }
}

function refreshData(mapCtx, data) {
    let gridValues = data.baselineFcaOutput;
    if (visType === 'sim' && simType === 'rt') {
        gridValues = data.baselineResponseTime;
    } else if (visType === 'demand') {
        gridValues = data.demandData;
    } else if (visType === 'supply') {
        gridValues = data.supplyData;
    }
    const gridDrawer = setupGridDrawer(mapCtx, data.mapGridData, gridValues);
    const mapGridCells = gridDrawer(gridValues);
    const toolTipDataProcessor = createTooltipDataProcessor(
        data.baselineFcaOutput,
        data.simulationFcaOutput,
        data.demandData,
        data.supplyData);

    setupEventHandlers(mapCtx, data, mapGridCells, gridDrawer, toolTipDataProcessor);
    const facilities = drawFacilities(mapCtx, data.sfFacilityData);

    drawCatchments(mapCtx, facilities, data);

    lastClickedFacility = null;
    facilities.on("click", (x) => {
        
        if (lastClickedFacility != null) {
            d3.select("#" + lastClickedFacility)
                .attr("r", "5")
                .attr("color", "red")
                .attr("stroke", "red")
        }

        d3.select("#catchment_area").selectAll("path").style("display", "none");        

        const catchmentKey = "catchment_" + x.properties.facility_id;
        const facilityKey = "facility_" + x.properties.facility_id;

        if (facilityKey != lastClickedFacility) {
            d3.select("#" + catchmentKey).style("display", "");                
            d3.select("#" + facilityKey)
                .attr("r", "8")
                .attr("fill", "red")
                .attr("stroke", "black");    
            lastClickedFacility = facilityKey;
        }
        else {
            lastClickedFacility = null;   
        }    
    })
}

function drawCatchments(mapCtx, facilities, data) {
    return d3.select("#catchment_area").selectAll("path")
        .data(data.catchmentData.features)
        .enter()
        .append("path")
        .attr("d", (feature) => mapCtx.path(feature))
        .attr("id", (feature) => "catchment_" + feature.properties.facility_id)
        .attr("fill", "lightblue")
        .attr("fill-opacity", "0.75")
        .attr("stroke", "black")
        .style("display", "none");
}

function setupMap(geoObj) {

    const projection = d3.geoEquirectangular();
    const extent = [
        [0, 10],
        [svgWidth, svgHeight - 10],
    ];
    projection.fitExtent(extent, geoObj);
    const path = d3.geoPath().projection(projection);

    const scaleBar = d3.geoScaleBar()
        .projection(projection)
        .extent(extent)
        .units(d3.geoScaleMiles)
        .left(.05)
        .top(.05)
        .distance(1)
        .tickFormat((d) => d)
    baseMap.append("g").call(scaleBar);

    baseMap.selectAll("path")
        .data(geoObj.features)
        .enter()
        .append("path")
        .attr("d", (feature) => path(feature))
        .attr("fill", "white")
        .attr("stroke", "gray");

    return {
        projection: projection,
        path: path
    }
}

function drawFacilities(mapCtx, facilityData) {
    let circles = facilities.selectAll("circle")
        .data(facilityData.features)
        .enter()
        .append("circle")
        .attr("r", "5")
        .attr("transform", (feature) => {
            return "translate(" + mapCtx.projection([
                feature.geometry.coordinates[0],
                feature.geometry.coordinates[1],
            ]) + ")"
        })
        .attr("id", (feature) => "facility_" + feature.properties.facility_id)
        .attr("fill", "red")
        .attr("stroke", "red");

    circles.style("cursor", "pointer");
    
    circles.on("mouseover", (x) => {
        let currFacility = "facility_" + x.properties.facility_id;
        if (currFacility != lastClickedFacility) {
            d3.select("#" + currFacility)
                .attr("stroke", "black")
                .attr("r", "8");
        }        
    });

    circles.on("mouseout", (x) => {
        let currFacility = "facility_" + x.properties.facility_id;
        if (currFacility != lastClickedFacility) {
            d3.select("#" + currFacility)
                .attr("stroke", "red")
                .attr("r", "5")
                .style("cursor", "pointer");    
        }
    });

    return circles;
}

function drawZoneIncrease(currVal, initialVal, zoneSquare) {
    if (currVal != initialVal & initialVal > 0) {

        let zonePath = zoneSquare.attr("d").replace(/^M/, "").split(",")
        let zoneCoords = {
            "x": Number.parseFloat(zonePath[0]),
            "y": Number.parseFloat(zonePath[1].replace(/[A-Za-z].*$/, ""))
        }

        let pctLabel = "+" + ((100.0 * (currVal / initialVal)).toFixed(0) - 100.0) + "%";
        if (currVal / initialVal > 3) {
            pctLabel = "> +300%";
        }

        mapGrid.append("text")
            .attr("x", zoneCoords.x + 5)
            .attr("y", zoneCoords.y + 20)
            .attr("class", "zone_increase_label")
            .style("font-size", "10pt")
            .text(pctLabel)
    }
}

function setupGridDrawer(mapCtx, gridDefinition, initialGridValues) {

    const valMin = d3.min(initialGridValues, x => Number.parseFloat(x.value));
    const valMax = d3.max(initialGridValues, x => Number.parseFloat(x.value));
    const valMid = d3.mean(initialGridValues, x => Number.parseFloat(x.value));

    // reverse color scale for demand
    let range = ["red", "yellow", "green"]
    if (visType === 'demand') {
        range = ["green", "yellow", "red"]
    }

    const colorScale = d3.scaleLinear()
        .domain([valMin, valMid, valMax])
        .range(range);

    // closure scoped
    var isFirstDraw = true;
    var mapGridCells = null;

    const initialValLookup = {};
    initialGridValues.forEach(x => {
        initialValLookup[x.zone_idx] = x.value;
    });

    function gridDrawer(redrawGridValues) {

        let valLookup = null;
        if (!redrawGridValues) {
            valLookup = initialValLookup;
        } else {
            valLookup = {};
            redrawGridValues.forEach(x => {
                valLookup[x.zone_idx] = x.value;
            })
        }

        if (isFirstDraw) {
            mapGridCells = mapGrid.selectAll("path")
                .data(gridDefinition.features)
                .enter()
                .append("path")
                .attr("d", (feature) => mapCtx.path(feature))
                .attr("fill-opacity", "0.25")
                .attr("id", (feature) => {
                    return "zone_idx_" + feature.properties.zone_idx;
                })
                .attr("fill", (feature) => {
                    const zoneIdx = feature.properties.zone_idx + "";
                    const zoneVal = valLookup[zoneIdx];
                    if (!zoneVal) {
                        return "white";
                    } else {
                        return colorScale(zoneVal);
                    }
                });
            isFirstDraw = false;
        } else {
            d3.selectAll(".zone_increase_label").remove();
            for (let zoneIdx in valLookup) {
                let currVal = valLookup[zoneIdx];
                let initialVal = initialValLookup[zoneIdx];
                let change = currVal / initialVal;

                currVal = (currVal > valMax) ? valMax : currVal;
                currVal = (currVal < valMin) ? valMin : currVal;

                let zoneSquare = d3.select("#zone_idx_" + zoneIdx);
                zoneSquare.attr("fill", colorScale(currVal));

                drawZoneIncrease(currVal, initialVal, zoneSquare);

            }
        }

        return mapGridCells;
    }

    return gridDrawer;
}

function updateSimTooltips(tooltipData, simulationTooltipData) {
    if (tooltipData) {
        $("#daily_fire_incidents").text(Math.ceil(tooltipData.incidentsPerDay))
        $("#num_fire_stations").text(tooltipData.availableUnits)
        $("#num_fire_stations_vs_incidents").text((tooltipData.incidentsPerDay / tooltipData.availableUnits).toFixed(2))
        $("#accessibility_score").text(tooltipData.accessibilityScore.toFixed(6))
        if (simulationTooltipData) {
            $("#accessibility_score_sim").text(simulationTooltipData.accessibilityScore.toFixed(6))
            $("#accessibility_score_increase").text(
                "+" + (100.0 * simulationTooltipData.accessibilityScore / tooltipData.accessibilityScore - 100).toFixed(1) + "%");
        }
    } else {
        $("#daily_fire_incidents").text("-")
        $("#num_fire_stations").text("-")
        $("#num_fire_stations_vs_incidents").text("-")
        $("#accessibility_score").text("-")
        $("#accessibility_score_sim").text("-")
        $("#accessibility_score_increase").text("-")
    }
}

function setupEventHandlers(mapCtx, data, mapGridCells, gridDrawer, toolTipDataProcessor) {

    const travelTimeLookup = {};
    const originalColors = {};
    const travelTime = data.travelTime;
    let simulationData = data.simulationFcaOutput;
    if (simType === 'rt') {
        simulationData = data.simulationResponseTime;
    }

    const currentTooltipProcessor = toolTipDataProcessor("baseline");
    let simulationTooltipProcessor = null;

    // build a lookup structure for each grid cell indicating which other cells can
    // be traveled to within 5 minutes
    travelTime.forEach((r) => {
        if (!(r.selected_zone in travelTimeLookup)) {
            travelTimeLookup[r.selected_zone + ""] = [];
        }
        travelTimeLookup[r.selected_zone + ""].push(r.covered_zone);
    });

    function resetColors() {
        let processedKeys = [];
        for (k in originalColors) {
            d3.select(k).attr("fill", originalColors[k])
            processedKeys.push(k);
        }
        processedKeys.forEach(k => delete originalColors[k])
    }

    $("#reset_fca").click(function (evt) {
        simulationTooltipProcessor = null;
        $("#accessibility_score_sim").text("-")
        $("#accessibility_score_increase").text("-")
    });


    if (visType === 'sim') {
        mapGridCells.on("click", (x) => {
            const zoneIdx = x.properties.zone_idx + "";
            const simulationKey = "new_station_" + zoneIdx;

            resetColors();
            if (simulationKey in simulationData) {
                gridDrawer(simulationData[simulationKey]);
            }

            const clickCoords = {
                x: d3.event.layerX,
                y: d3.event.layerY
            }

            simulationFacility.selectAll("*").remove();

            simulationFacility
                .append("circle")
                .attr("cx", clickCoords.x)
                .attr("cy", clickCoords.y)
                .attr("fill", "blue")
                .attr("fill-opacity", "0.8")
                .attr("r", "6")

            // create a new tooltip processor for our scenario
            simulationTooltipProcessor = toolTipDataProcessor(simulationKey);
            // populate the tooltip
            const tooltipData = currentTooltipProcessor(zoneIdx) || false;
            const simulationTooltipData = (simulationTooltipProcessor != null) ?
                (simulationTooltipProcessor(zoneIdx) || false)
                : false;

            updateSimTooltips(tooltipData, simulationTooltipData);

        });
    }

    mapGridCells.on("mouseover", (x) => {

        resetColors();

        const zoneIdx = x.properties.zone_idx + "";
        d3.select("#zone_idx_" + zoneIdx).attr("stroke", "black");

        if (visType === 'sim') {
            // color the 5 minute travel time cells
            if (zoneIdx in travelTimeLookup) {
                const elementsToColor = travelTimeLookup[zoneIdx].map(x => "#zone_idx_" + x);
                // store the original colors
                elementsToColor.forEach(x => {
                    originalColors[x] = d3.select(x).attr("fill");
                })
                // update to be colored for the response area
                d3.selectAll(elementsToColor.join(","))
                    .attr("fill", "purple");
            }
        }

        // populate the tooltip
        const tooltipData = currentTooltipProcessor(zoneIdx) || false;
        const simulationTooltipData = (simulationTooltipProcessor != null) ?
            (simulationTooltipProcessor(zoneIdx) || false)
            : false;
        updateSimTooltips(tooltipData, simulationTooltipData);

    }).on("mouseout", (x) => {
        let zoneIdx = x.properties.zone_idx + "";
        d3.select("#zone_idx_" + zoneIdx).attr("stroke", "none");
        resetColors();
    });
}

function updateLegendLabels() {

    let colorLegendLabel = simType === 'rt' ? "Response Time:" : "Spatial Accessibility (2SFCA):";
    colorLegendLabel = visType === 'demand' ? "Fire Incidents Per Day" : colorLegendLabel;
    colorLegendLabel = visType === 'supply' ? "Supply" : colorLegendLabel;

    let colorLegendHighLabel = simType === 'rt' ? "Fast expected response to a new incident" : "High # of available fire units per incident";
    colorLegendHighLabel = visType === 'demand' ? "Low # of daily fire incidents (about 1 per day)" : colorLegendHighLabel;
    colorLegendHighLabel = visType === 'supply' ? "High # of stations within 5 min" : colorLegendHighLabel;

    let colorLegendMedLabel = simType === 'rt' ? "Moderate expected response to a new incident" : "Avg # of available fire units per incident";
    colorLegendMedLabel = visType === 'demand' ? "Moderate # of daily fire incidents (about 3-5 per day)" : colorLegendMedLabel;
    colorLegendMedLabel = visType === 'supply' ? "Moderate # of stations within 5 min" : colorLegendMedLabel;

    let colorLegendLowLabel = simType === 'rt' ? "Slower expected response to a new incident" : "Low # of available fire units per incident";
    colorLegendLowLabel = visType === 'demand' ? "High # daily of fire incidents (10+ per day)" : colorLegendLowLabel;
    colorLegendLowLabel = visType === 'supply' ? "Low # of stations within 5 min" : colorLegendLowLabel;

    d3.select("#color_scale_type_label").text(colorLegendLabel)
    d3.select("#color_legend_high_label").text(colorLegendHighLabel)
    d3.select("#color_legend_med_label").text(colorLegendMedLabel)
    d3.select("#color_legend_low_label").text(colorLegendLowLabel)

    if (visType === "sim") {
        $(".sim-legend-item").removeClass("item-not-visible")
    } else {
        $(".sim-legend-item").addClass("item-not-visible")        
    }

    if (visType === "demand") {
        $(".demand-legend-item").removeClass("item-not-visible")
    } else {
        $(".demand-legend-item").addClass("item-not-visible")        
    }
}