const DataSource = require("../data-source");
const { allDistancesToTileType } = require("../lib/distance");
const { getTileTypeId } = require("../lib/config-helpers");
const Array2D = require("../lib/array-2d");
//const { regionAreas } = require("../lib/regions");

class NuclearPowerData extends DataSource {
  constructor(city, config) {
    super();
    this.city = city;
    this.config = config;

    // (This arrays will contain a 16 x 16 raster of the distance values from any raster cell to
    // and other data types (water, road, residential area, wind turbines small and big).)
    // I don't think the lines above are correct, cause the array just saves positive distance values,
    // like just the distances from all residential tiles to one Wind Turbine
    this.proximitiesWater = [];
    this.proximitiesResidential = [];
    //this.proximitiesWindTurbines = [];

    // This creates a 16x16 matrix, in which the locations of the windturbines,
    // which do not fullfill the set goals. e.g. if one wind turbine tile is too close
    // to a residential tile, the coordinates of the windturbine will be saved.
    this.locationsGoalsError = Array2D.create(16, 16, 0);

    // The following variable will contain the distances that have to be kept and are written down in config/goals.yml
    this.residentialsDist =
      this.config.goals["distances"][
        "nuclearPowerPlant-distance-residentials"
      ] || 10;

    this.waterDist =
      this.config.goals["distances"]["nuclearPowerPlant-distance-water"] || 1;

    // The following values are counters, that are initially set to 0
    this.numResidentialsTooClose = 0;
    this.numResidentialsTooCloseWithGoodwill = 0;
    this.numWaterClose = 0;

    this.amountOfNuclearPowerPlants = 0;

    // This index will be used e.g. for choosing the correct smiley and citizen requests
    // for distance constraints. 5 is the default value, it says "happy"
    this.distancesIndex = 5;
  }

  /**
   * Getter for the distance index.
   * return: Distance index variable
   */
  getVariables() {
    return {
      "distances-index": () => this.distancesIndex,
    };
  }

  /**
   * This function checks the distance values of a distances 2D array in a given window.
   * distancesArray: array with shape a x b, containing distances from object to others
   * x: integer value representing the x position
   * y: integer value representing the y position
   * buffer: integer value representing a symmetrical buffer around (x,y)
   * xyWindow: [[integer]] 2D array, representing the values, the window should have, with size [2*buffer+1][2*buffer+2]
   * return: Boolean (true := no distortion in buffer, false := there is a distortion)
   */
  calculateBuffer(distancesArray, x, y, buffer, xyWindow) {
    if ((xyWindow.length + 1) / 2 - 1 == buffer) {
      // checks if buffer size and window size are matching
      for (let i = 0; i < xyWindow.length; i++) {
        for (let j = 0; j < xyWindow[0].length; j++) {
          const newX = x - buffer + i;
          const newY = y - buffer + j;
          if (
            newX >= 0 &&
            newX < distancesArray.length &&
            newY >= 0 &&
            newY < distancesArray.length
          ) {
            if (distancesArray[newY][newX] >= xyWindow[i][j]) {
              continue;
            } else {
              return false;
            }
          } else {
            continue;
          }
        }
      }
      return true;
    } else {
      return false;
    }
  }

  /**
   * This function gets used to fill the proximity arrays.
   */
  calculateProximities() {
    const residentialId = getTileTypeId(this.config, "residential");
    const waterTileId = getTileTypeId(this.config, "water");
    const roadTileId = getTileTypeId(this.config, "road");
    const nuclearPowerPlantId = getTileTypeId(this.config, "nuclearPowerPlant");

    // The following lines will build the distances arrays:
    const distancesWater = allDistancesToTileType(this.city.map, [waterTileId]);

    const distancesResidential = allDistancesToTileType(this.city.map, [
      residentialId,
    ]);

    const distancesNuclearPowerPlants = allDistancesToTileType(this.city.map, [
      nuclearPowerPlantId,
    ]);

    // Distance between small wind turbines and residentials
    this.proximitiesResidential = [];
    this.city.map.allCells().forEach(([x, y, tile]) => {
      if (tile === nuclearPowerPlantId) {
        // this.proximitiesResidential will look like this [distance, [x, y]]
        this.proximitiesResidential.push([
          distancesResidential[y][x], // saves the distances from all residential tiles to one nuclear power plant
          [x, y], // saves the locations of the residential tiles
        ]);
      }
    });

    // Distance between nucelar power and water
    this.proximitiesWater = [];
    this.city.map.allCells().forEach(([x, y, tile]) => {
      if (tile === nuclearPowerPlantId) {
        // this.proximitiesResidential will look like this [distance, [x, y]]
        this.proximitiesWater.push([
          distancesWater[y][x], // saves the distances from all residential tiles to one nuclear power plant
          [x, y], // saves the locations of the residential tiles
        ]);
      }
    });
  }

  // Just a call for the calculation done by other functions.
  calculate() {
    this.calculateProximities();
    this.calculateIndex();
  }

  //
  calculateIndex() {
    this.numResidentialsTooCloseWithGoodwill = 0;
    this.numResidentialsTooClose = 0;
    // No nuclear power plant is placed
    if (this.proximitiesWater.length == 0) {
      this.numWaterClose = 1;
    } else {
      this.numWaterClose = 0;
    }

    Array2D.setAll(this.locationsGoalsError, 0);

    this.proximitiesResidential.forEach((distanceAndLocation) => {
      let distance = distanceAndLocation[0];
      let x = distanceAndLocation[1][0];
      let y = distanceAndLocation[1][1];
      // In case the amount of nuclear power plants that are closer or equal to a fixed value (10)
      // is bigger than that, it will be differentiated, if it is equal or higher than the same
      // fixed value (10).
      // If it is equal, it will counted as only one violation which will be counted as "acceptable with goodwill".
      if (distance <= this.residentialsDist) {
        // distance <= 10
        if (this.residentialsDist > 1) {
          if (distance == this.residentialsDist) {
            // distance == 10
            this.numResidentialsTooCloseWithGoodwill += 1;
          } else {
            // distance < 10
            this.numResidentialsTooClose += 1;
            this.locationsGoalsError[y][x] = 1;
          }
        } else {
          this.numResidentialsTooClose += 1;
          this.locationsGoalsError[y][x] = 1;
        }
      }
    });

    this.proximitiesWater.forEach((distanceAndLocation) => {
      let distance = distanceAndLocation[0]; //saves the surrent distance
      let x = distanceAndLocation[1][0];
      let y = distanceAndLocation[1][1];

      if (distance == this.waterDist) {
        // distance == 1
        this.numWaterClose = 1;
      }
    });

    // 5 := best; 3 := neutral; 1 := worst; 0 := neutral
    this.distancesIndex =
      5 -
      this.numResidentialsTooCloseWithGoodwill -
      (this.numResidentialsTooClose > 0 ? 4 : 0);
    // In case the index value falls below 1, it has to be corrected to 1 because 0 is neutral, 1 ist worst
    this.distancesIndex = this.distancesIndex <= 0 ? 1 : this.distancesIndex;
  }

  /**
   * This function contains the different goals and its conditions that will be checked and use the previous calculations as a basis.
   * @returns goals thats condition is false
   */
  getGoals() {
    return [
      /*
      {
        id: "wind-turbine-distance-road-water-low",
        category: "distance",
        priority: 1,
        condition: this.numWaterRoadsTooClose == 0,
        progress: this.goalProgress(this.numWaterRoadsTooClose, 0),
      },
      {
        id: "wind-turbine-distance-residential-low",
        category: "distance",
        priority: 1,
        condition: this.numResidentialsTooClose == 0,
        progress: this.goalProgress(this.numResidentialsTooClose, 0),
      },
      {
        id: "wind-turbine-distance-wind-turbines-low",
        category: "distance",
        priority: 1,
        condition: this.numWindTurbinesTooClose == false,
        progress: this.goalProgress(this.numWindTurbinesTooClose, false),
      },*/
      {
        id: "nuclear-power-plant-no-water",
        category: "distance",
        priority: 1,
        condition: this.numWaterClose >= 1,
        progress: this.goalProgress(this.numWaterClose, 1),
      },
    ];
  }
}

module.exports = NuclearPowerData;
