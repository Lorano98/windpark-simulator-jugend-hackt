const {
  small_turbine_function,
  big_turbine_function,
} = require("./lib/energy-calculation");
const { getTileTypeId } = require("./lib/config-helpers");

class TileCounterView {
  constructor(stats, config, mapEditor) {
    this.stats = stats;
    this.config = config;
    this.mapView = mapEditor.mapView;

    this.stats.events.on("update", this.handleUpdate.bind(this));

    this.$element = $("<div></div>").addClass("tile-counter");

    this.computedFieldDefs = [
      {
        id: "energy-gain",
        label: "Energy gain",
        labelDE: "Energiegewinn",
        calculate: () => {
          //const turbinesSmall = this.stats.get("zones-windTurbineSmall-count");
          //const turbinesBig = this.stats.get("zones-windTurbineBig-count");
          const windTurbineSmallId = getTileTypeId(
            this.config,
            "windTurbineSmall"
          );
          const windTurbineBigId = getTileTypeId(this.config, "windTurbineBig");

          let speed_km_h =
            (((($(`#${this.config.wind.windspeed.id}_knob`).val() ?? 0) % 1) +
              1) %
              1) *
            this.config.wind.windspeed.max_speed;
          let speed_m_s = speed_km_h / 3.6;
          // Calculate the energy gain based on the wind speed and the number of turbines.
          // The energy loss of the wind is also considered. The windspeed decreases when multiple turbines stand in a row.
          let energy = 0;
          this.stats.get("energy-losses").forEach((item) => {
            if (item[1] == windTurbineSmallId) {
              energy += small_turbine_function(
                speed_m_s * (item[0] == 1 ? 1 : 1 - item[0])
              );
            } else if (item[1] == windTurbineBigId) {
              energy += big_turbine_function(
                speed_m_s * (item[0] == 1 ? 1 : 1 - item[0])
              );
            }
          });

          energy += this.stats.get("zones-nuclearPowerPlant-count") * 1400000;

          return Math.round(energy);
          /*
          return Math.round(
            energy_small * turbinesSmall + energy_big * turbinesBig
          );
          */
        },
      },
      /*{
        id: "road-density",
        label: "Road:Zone ratio",
        calculate: () => {
          const zones = this.stats.get("zones-residential-count"); // +
          //+ this.stats.get('zones-commercial-count')
          //this.stats.get("zones-industrial-count");

          return (this.stats.get("zones-road-count") / zones).toFixed(2);
        },
      },
      {
        id: "road-intersection-type",
        label: "Intersections (3x/4x)",
        calculate: () => {
          const tri = this.stats.get("road-triple-intersections-count");
          const quad = this.stats.get("road-quad-intersections-count");
          const total = this.stats.get("zones-road-count");
          return `${tri}(${((tri / total) * 100).toFixed(1)}%) / ${quad}(${(
            (quad / total) *
            100
          ).toFixed(1)}%)`;
        },
      },*/
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
      $("<ul></ul>")
        .addClass("tile-counter-counts")
        .append(
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
        )
        .append(
          this.computedFieldDefs.map((field) =>
            $("<li></li>")
              .append(
                $("<span></span>")
                  .addClass("label")
                  .html(`${field.labelDE} (${field.label}): `)
              )
              .append(this.fields[field.id])
          )
        )
    );

    this.total = this.stats.get("zones-total");

    this.handleUpdate();
  }

  handleUpdate() {
    Object.keys(this.config.tileTypes).forEach((id) => {
      const { type } = this.config.tileTypes[id];
      const count = this.stats.get(`zones-${type}-count`);
      this.fields[id].text(
        `${count} (${((count / this.total) * 100).toFixed(1)}%)`
      );
    });

    this.computedFieldDefs.forEach(({ id, calculate }) => {
      this.fields[id].text(`${calculate()} kW`);
    });

    this.stats.sources[3].calculateWind();
    // updates the energy loss by slipstream
    this.stats.sources[4].calculate(this.stats.get("wind-direction"));
    // update the speed of the animation
    this.mapView.updateSpeed();
  }

  /**
   * Updates the counters in the dashboard.
   * @param {*} counters
   */
  updateCounters(counters) {
    Object.keys(counters).forEach((id) => {
      this.fields[id].text(
        `${counters[id].count} (${(
          (counters[id].count / this.total) *
          100
        ).toFixed(1)}%)`
      );
    });

    this.computedFieldDefs.forEach(({ id, calculate }) => {
      this.fields[id].text(`${calculate()} kW`);
    });
  }

  /*extraFieldDefs() {
    return [
      {
        id: "road-density",
        label: "Road density",
        calculate: () => {
          const zones = this.stats.get("zones-residential-count"); //+
          //+ this.stats.get('zones-commercial-count')
          //this.stats.get("zones-industrial-count");

          return this.stats.get("zones-road-count") / zones;
        },
      },
    ];
  }*/
}

module.exports = TileCounterView;
