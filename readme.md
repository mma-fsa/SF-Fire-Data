# San Francisco Fire Data
**where should we build a new fire station?**

## Purpose

This web-based tool uses geospatial statistics to estimate the current coverage areas of fire stations in San Francisco.  You can simulate building a new fire station, and see the impact on the response times.  The response time impact is generated from real traffic data (although it is cached and not queried in real-time).

* Click [here](https://mma-fsa.github.io/SF-Fire-Data/) to visit the page and run the simulation in your browser.

## Running Locally

In this directory, start the HTTP server:

```python -m http.server 8080```

navigate to http://localhost:8080

## Python Files

The web interface is using a pre-computed analysis built by the files the python/ directory, using the data in the python/data directory.

## Data Source

The data is sourced from San Francisco's city data portal, but a cleaned-up SQL database is provided with the Python files. It also uses data from Bing Maps to estimate the impact of adding a new fire station, but that data is too large to be checked into the GitHub repository.
