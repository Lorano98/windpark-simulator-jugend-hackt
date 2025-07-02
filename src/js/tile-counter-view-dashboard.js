const {
  small_turbine_function,
  big_turbine_function,
} = require("./lib/energy-calculation");
const { getTileTypeId } = require("./lib/config-helpers");

class TileCounterViewDashboard {
  constructor(config) {
    this.counters = {};
    this.config = config;
    this.energyLosses = [];
    this.powerPlantCount = 0;
    this.speed_km_h = 0;
    this.speed_m_s = 0;
    this.$element = $("<div></div>").addClass("tile-counter");

    this.computedFieldDefs = [
      {
        id: "energy-gain",
        label: "Power",
        labelDE: "Leistung",
        subtitle: "gained based on the current wind speed",
        subtitleDE: "produziert bei der aktuellen Windgeschwindigkeit",
        calculate: (wind) => {
          const windTurbineSmallId = getTileTypeId(
            this.config,
            "windTurbineSmall"
          );
          const windTurbineBigId = getTileTypeId(this.config, "windTurbineBig");
          //const turbinesSmall = this.counters[windTurbineSmallId].count;
          //const turbinesBig = this.counters[windTurbineBigId].count;
          this.speed_km_h = wind.windspeed ?? 0;
          this.speed_m_s = this.speed_km_h / 3.6;

          // Calculate the energy gain based on the wind speed and the number of turbines.
          // The energy loss of the wind is also considered. The windspeed decreases when multiple turbines stand in a row.
          let energy = 0;
          this.energyLosses.forEach((item) => {
            if (item[1] == windTurbineSmallId) {
              energy += small_turbine_function(
                this.speed_m_s * (item[0] == 1 ? 1 : 1 - item[0])
              );
            } else if (item[1] == windTurbineBigId) {
              energy += big_turbine_function(
                this.speed_m_s * (item[0] == 1 ? 1 : 1 - item[0])
              );
            }
          });
          energy += this.powerPlantCount * 1400000;
          return Math.round(energy) + " kW";
        },
      },
      {
        id: "winddirection",
        label: this.config.wind.winddirection.name_en,
        labelDE: this.config.wind.winddirection.name_de,
        calculate: (wind) => {
          return wind.winddirection;
        },
      },
      {
        id: "windspeed",
        label: this.config.wind.windspeed.name_en,
        labelDE: this.config.wind.windspeed.name_de,
        calculate: (wind) => {
          return wind.windspeed.toFixed(2) + " km/h";
        },
      },
    ];

    this.fields = Object.assign(
      Object.fromEntries(
        Object.keys(config.tileTypes).map((id) => [
          id,
          $("<span></span>").addClass("field"),
        ])
      ),

      Object.fromEntries(
        this.computedFieldDefs.map((field) => [
          field.id,
          $("<span></span>").addClass("field"),
        ])
      )
    );

    //Here gets the Counters View created
    this.$element.append(
      $("<div></div>")
        .addClass("tile-counter-counts")
        /*.append(
          Object.keys(config.tileTypes)
            .filter((id) => id < 6)
            .map((id) =>
              $("<li></li>")
                .append(
                  $("<span></span>")
                    .addClass("label")
                    .html(
                      `${config.tileTypes[id].nameDE} 
                      (${
                        config.tileTypes[id].name ||
                        config.tileTypes[id].type ||
                        id
                      }): `
                    )
                )
                .append(this.fields[id])
            )
        )*/
        .append(
          this.computedFieldDefs.map((field) =>
            $("<div></div>")
              .addClass(
                "d-flex justify-content-between align-items-center pr-4"
              )
              .append(
                $("<div></div>")
                  .append(
                    $("<span></span>").addClass("name").html(`${field.labelDE}`)
                  )
                  .append(
                    field.subtitleDE
                      ? $("<br><div></div>").html(field.subtitleDE)
                      : "<br>"
                  )
                  .append(
                    $("<span></span>")
                      .addClass("name-tr")
                      .html(`${field.label}`)
                  )
                  .append(
                    field.subtitle
                      ? $("<br><div></div>").html(field.subtitle)
                      : ""
                  )
              )
              .append(
                $("<div style='font-size: 30px'></div>").append(
                  this.fields[field.id]
                )
              )
          )
        )
        .append(
          config.wind.windspeed.starting_speed
            ? $("<span></span>")
                .attr("id", `${config.wind.windspeed.id}_startingSpeed`)
                .addClass("beschr-en")
                .html(
                  `Starting speed: ${config.wind.windspeed.starting_speed} km/h`
                )
                .css("color", "red")
                .css({
                  fontSize: 24,
                })
                .append("<br>")
            : ""
        )
    );
  }

  /**
   * Updates the counters in the dashboard.
   * @param {*} counters
   */
  updateCounters(counters, wind) {
    this.counters = counters;

    Object.keys(this.counters).forEach((id) => {
      this.fields[id].text(
        `${this.counters[id].count} (${this.counters[id].percentage}%)`
      );
    });

    this.computedFieldDefs.forEach(({ id, calculate }) => {
      this.fields[id].text(`${calculate(wind)}`);
    });
    // hide starting speed info if the speeed is above 10 km/h
    if (this.speed_km_h >= 10) {
      $(`#${this.config.wind.windspeed.id}_startingSpeed`).hide();
    } else {
      $(`#${this.config.wind.windspeed.id}_startingSpeed`).show();
    }
  }

  /**
   * Updates the energy losses
   * @param {*} energyLosses
   */
  setEnergyLosses(energyLosses) {
    this.energyLosses = energyLosses;
  }

  setNuclearPowerPlantCount(count) {
    this.powerPlantCount = count;
  }
}

module.exports = TileCounterViewDashboard;
