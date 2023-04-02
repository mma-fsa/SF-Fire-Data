# San Francisco Fire Data
**where should we build a new fire station?**

## Purpose

This tool uses geospatial statistics to estimate the current coverage areas of fire stations in San Francisco.  You can simulate building a new first station, and see the impact on the response times.  The response time impact is generated from real traffic data (although it is cached and not queried in real-time).

## Running

In this directory, start the HTTP server:

```python -m http.server 8080```

navigate to http://localhost:8080

## To Do
* Visualization Types
  * Simulation
    * Options for SA score and predicted response time given an incident occurs in that square.
    * Show SA score or response time for each grid square as user hovers over.
  * Supply
    * Displaying the catchment areas of existing fire stations.
  * Demand
    * Stats and color scale for fire incidents per year, month, day