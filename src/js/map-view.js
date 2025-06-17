/* globals PIXI */
const EventEmitter = require("events");
const Array2D = require("./lib/array-2d");
const { getTileTypeId } = require("./lib/config-helpers");
const PencilCursor = require("../../static/fa/pencil-alt-solid.svg");
const CoordsArray = require("./map-view-animation");

class MapView {
  constructor(
    city,
    config,
    textures,
    dataManager,
    animatedTextures,
    animatedApp
  ) {
    this.city = city;
    this.config = config;
    this.textures = textures;
    this.animatedTextures = animatedTextures;

    this.animatedApp = animatedApp;
    this.events = new EventEmitter();
    this.cityTileId = getTileTypeId(config, "residential");
    this.roadTileId = getTileTypeId(config, "road");
    this.parkTileId = getTileTypeId(config, "park");
    this.waterTileId = getTileTypeId(config, "water");
    this.windTurbineSmallId = getTileTypeId(config, "windTurbineSmall");
    this.windTurbineBigId = getTileTypeId(config, "windTurbineBig");
    this.nuclearPowerPlant = getTileTypeId(config, "nuclearPowerPlant");
    this.roadTextureKey = "roads";
    this.roadTexturePrefix = "road";
    this.basicTileRenderers = {};
    this.dataManager = dataManager;
    this.randomizedTerrain = Array2D.create(
      this.city.map.width,
      this.city.map.height
    );
    Array2D.fill(this.randomizedTerrain, () => Math.random());

    this.displayObject = new PIXI.Container();

    // map layer with background Tiles
    this.bgTiles = Array2D.create(
      this.city.map.width,
      this.city.map.height,
      null
    );
    // map layer with Texture Tiles
    this.textureTiles = Array2D.create(
      this.city.map.width,
      this.city.map.height,
      null
    );
    this.animatedSprite = new PIXI.AnimatedSprite(
      this.animatedTextures.wt_small_texture.animations.wt
    );
    this.wtAnimation = new CoordsArray(this.animatedSprite);
    // creates backround tiles with PIXI Graphics for each cell in the map
    this.city.map.allCells().forEach(([x, y]) => {
      const bgTile = new PIXI.Graphics();
      bgTile.x = x * MapView.TILE_SIZE;
      bgTile.y = y * MapView.TILE_SIZE;
      this.bgTiles[y][x] = bgTile;

      const textureTile = new PIXI.Sprite();
      textureTile.x = x * MapView.TILE_SIZE;
      textureTile.y = y * MapView.TILE_SIZE;
      textureTile.width = MapView.TILE_SIZE;
      textureTile.height = MapView.TILE_SIZE;
      textureTile.roundPixels = true;
      this.textureTiles[y][x] = textureTile;
      this.renderTile(x, y);
    });

    this.zoningLayer = new PIXI.Container();
    this.zoningLayer.addChild(...Array2D.flatten(this.bgTiles));
    this.displayObject.addChild(this.zoningLayer);
    this.tileTextureLayer = new PIXI.Container();
    this.tileTextureLayer.addChild(...Array2D.flatten(this.textureTiles));
    this.displayObject.addChild(this.tileTextureLayer);
    this.overlayContainer = new PIXI.Container();
    this.displayObject.addChild(this.overlayContainer);
    this.gridOverlay = this.createGridOverlay();
    this.displayObject.addChild(this.gridOverlay);
    if (this.config.mapView && this.config.mapView.gridOverlay) {
      this.renderGrid(this.config.mapView.gridOverlay);
    }

    this.city.map.events.on("update", this.handleCityUpdate.bind(this));
    this.handleCityUpdate(this.city.map.allCells());
  }

  addOverlay(displayObject) {
    this.overlayContainer.addChild(displayObject);
    this.overlayContainer.sortChildren();
  }

  createGridOverlay() {
    const overlay = new PIXI.Graphics();
    overlay.x = 0;
    overlay.y = 0;
    overlay.width = this.city.map.width * MapView.TILE_SIZE;
    overlay.height = this.city.map.height * MapView.TILE_SIZE;

    return overlay;
  }

  setEditCursor() {
    Array2D.items(this.bgTiles).forEach(([, , bgTile]) => {
      bgTile.cursor = `url(${PencilCursor}) 0 20, auto`;
    });
  }

  setInspectCursor() {
    Array2D.items(this.bgTiles).forEach(([, , bgTile]) => {
      bgTile.cursor = "crosshair";
    });
  }

  getCoordsAtPosition(globalPoint) {
    if (this.origin === undefined) {
      this.origin = new PIXI.Point();
    }
    this.origin = this.displayObject.getGlobalPosition(this.origin, false);

    const x = Math.floor(
      (globalPoint.x - this.origin.x) /
        this.displayObject.scale.x /
        MapView.TILE_SIZE
    );
    const y = Math.floor(
      (globalPoint.y - this.origin.y) /
        this.displayObject.scale.y /
        MapView.TILE_SIZE
    );

    return x >= 0 &&
      x < this.city.map.width &&
      y >= 0 &&
      y < this.city.map.height
      ? { x, y }
      : null;
  }

  enableTileInteractivity() {
    const pointers = {};

    Array2D.items(this.bgTiles).forEach(([x, y, bgTile]) => {
      bgTile.interactive = true;
      bgTile.cursor = `url(${PencilCursor}) 0 20, auto`;
      bgTile.on("pointerdown", (ev) => {
        // this.pointerActive = true;
        pointers[ev.data.pointerId] = { lastTile: { x, y } };
        this.events.emit("action", [x, y], {
          shiftKey: ev.data.originalEvent.shiftKey,
        });
      });
    });

    this.zoningLayer.interactive = true;
    this.zoningLayer.on("pointermove", (ev) => {
      if (pointers[ev.data.pointerId] !== undefined) {
        const tileCoords = this.getCoordsAtPosition(ev.data.global);
        if (pointers[ev.data.pointerId].lastTile !== tileCoords) {
          if (tileCoords) {
            this.events.emit("action", [tileCoords.x, tileCoords.y], {
              shiftKey: ev.data.originalEvent.shiftKey,
            });
          }
          pointers[ev.data.pointerId].lastTile = tileCoords;
        }
      }
    });

    const onEndPointer = (ev) => {
      delete pointers[ev.data.pointerId];
    };

    this.zoningLayer.on("pointerup", onEndPointer);
    this.zoningLayer.on("pointerupoutside", onEndPointer);
    this.zoningLayer.on("pointercancel", onEndPointer);
  }

  /**
   *
   * @param {*} x the x coordinate. measured in tiles.
   * @param {*} y the y coordinate. measured in tiles.
   * @returns the background Tile
   */
  getBgTile(x, y) {
    return this.bgTiles[y][x];
  }
  /**
   *
   * @param {*} x the x coordinate. measured in tiles.
   * @param {*} y the y coordinate. measured in tiles.
   * @returns the Texture Tile
   */
  getTextureTile(x, y) {
    return this.textureTiles[y][x];
  }

  /**
   * renders the new Tile after an Update on the map
   * @param {*} x the x coordinate. measured in tiles.
   * @param {*} y the y coordinate. measured in tiles.
   */
  renderTile(x, y) {
    this.renderBasicTile(x, y);
    switch (this.city.map.get(x, y)) {
      case this.windTurbineSmallId:
        // if the type of the tily is small Windturbine and the WT has a location error
        if (1 == this.dataManager.sources[3].locationsGoalsError[y][x]) {
          this.wtAnimation.deleteFromArray(
            x,
            y,
            this.wtAnimation.smallWindturbines
          );
          // renders texture with attention symbol
          this.renderRedBorderWindTurbineSmallTile(x, y);
        } else {
          // else: renders animation for small WT and deletes the coordinates from the array, which saves the big WTs
          this.renderWindTurbineSmallTile(x, y);
          this.wtAnimation.deleteFromArray(
            x,
            y,
            this.wtAnimation.bigWindturbines
          );
          // if they array which saves the small WTs is empty or the the coords aren't in it
          // they will be added to the array
          {
            this.wtAnimation.storeCoordinate(
              x,
              y,
              this.wtAnimation.smallWindturbines
            );
          }
        }
        break;
      case this.windTurbineBigId:
        this.wtAnimation.deleteFromArray(
          x,
          y,
          this.wtAnimation.bigWindturbines
        );
        // if the type of the tily is big Windturbine and the WT has a location error
        if (1 == this.dataManager.sources[3].locationsGoalsError[y][x]) {
          this.wtAnimation.deleteFromArray(
            x,
            y,
            this.wtAnimation.bigWindturbines
          );
          // renders texture with attention symbol
          this.renderRedBorderWindTurbineBigTile(x, y);
        } else {
          // else: renders animation for big WT and deletes the coordinates from the array, which saves the small WTs
          this.renderWindTurbineBigTile(x, y);
          this.wtAnimation.deleteFromArray(
            x,
            y,
            this.wtAnimation.smallWindturbines
          );
          // if they array which saves the big WTs is empty or the the coords aren't in it
          // they will be added to the array
          {
            this.wtAnimation.storeCoordinate(
              x,
              y,
              this.wtAnimation.bigWindturbines
            );
          }
        }
        break;
      case this.cityTileId:
        this.wtAnimation.deleteFromArray(
          x,
          y,
          this.wtAnimation.smallWindturbines
        );
        this.renderCityTile(x, y);
        break;
      case this.parkTileId:
        this.wtAnimation.deleteFromArray(
          x,
          y,
          this.wtAnimation.smallWindturbines
        );
        this.renderParkTile(x, y);
        break;
      case this.waterTileId:
        this.wtAnimation.deleteFromArray(
          x,
          y,
          this.wtAnimation.smallWindturbines
        );
        this.renderWaterTile(x, y);
        break;
      case this.roadTileId:
        this.wtAnimation.deleteFromArray(
          x,
          y,
          this.wtAnimation.smallWindturbines
        );
        this.renderRoadTile(x, y);
        break;
      case this.nuclearPowerPlant:
        this.wtAnimation.deleteFromArray(
          x,
          y,
          this.wtAnimation.smallWindturbines
        );
        this.renderNuclearPowerTile(x, y);
        break;
    }
  }

  renderParkTile(x, y) {
    this.wtAnimation.deleteFromArray(x, y, this.wtAnimation.smallWindturbines);
    this.wtAnimation.deleteFromArray(x, y, this.wtAnimation.bigWindturbines);
    const textureNumber = 1 + Math.round(this.randomizedTerrain[y][x] * 8);
    this.getTextureTile(x, y).texture =
      this.textures.parks[`park-0${textureNumber}`];
    this.getTextureTile(x, y).visible = true;
  }

  renderCityTile(x, y) {
    this.wtAnimation.deleteFromArray(x, y, this.wtAnimation.smallWindturbines);
    this.wtAnimation.deleteFromArray(x, y, this.wtAnimation.bigWindturbines);
    const textureNumber = 1 + Math.round(this.randomizedTerrain[y][x] * 15);
    this.getTextureTile(x, y).texture =
      this.textures.city[`b0${textureNumber}`];
    this.getTextureTile(x, y).visible = true;
  }

  renderWaterTile(x, y) {
    const textureNumber = 1 + Math.round(this.randomizedTerrain[y][x] * 8);
    this.getTextureTile(x, y).texture =
      this.textures.water[`water-0${textureNumber}`];
    this.getTextureTile(x, y).visible = true;
  }

  renderNuclearPowerTile(x, y) {
    const textureNumber = 1 + Math.round(this.randomizedTerrain[y][x] * 4);
    this.getTextureTile(x, y).texture =
      this.textures.nuclear_power[`nuclear_power-0${textureNumber}`];
    this.getTextureTile(x, y).visible = true;
  }

  /**
   * animates the spritesheet and changes frames of the WT Textures
   * @param {*} x the x coordinate. measured in tiles.
   * @param {*} y the y coordinate. measured in tiles.
   */
  renderWindTurbineSmallTile(x, y) {
    this.animate(this.animatedSprite, x, y);
  }
  /**
   * renders the current frame for all tiles in an array
   * @param {*} wtArray array which saves the coords for either big or small WTs
   * @param {*} wtTexture the texture for either big or small Wts
   */
  renderWindturbineArrays(wtArray, wtTexture) {
    for (var i = 0; i < wtArray.length; i++) {
      var x = wtArray[i].x;
      var y = wtArray[i].y;
      this.getTextureTile(x, y).texture =
        wtTexture[`wt${this.animatedSprite.currentFrame + 1}`];
    }
  }
  /**
   * updates the speed of the animation according to the windspeed knob
   * starts to turn by 9kmh
   */
  updateSpeed(windspeed) {
    if (!windspeed) {
      windspeed = this.dataManager.get("wind-speed");
    }
    if (windspeed >= 9) {
      this.animatedSprite.animationSpeed = (0.1 * windspeed) / 40;
      // starts the animated sprite
      this.animatedSprite.play();
      // sets the animated spprite on loop
      this.animatedSprite.onLoop = () => {};
    } else {
      this.renderWindturbineArrays(
        this.wtAnimation.smallWindturbines,
        this.animatedTextures.wt_small_texture.textures
      );
      this.renderWindturbineArrays(
        this.wtAnimation.bigWindturbines,
        this.textures.wt_big_texture
      );
      this.animatedSprite.stop();
    }
  }
  /**
   * animates the spritesheet and changes frames of the WT Textures
   * @param {*} img spritesheet for the PIXI animated Sprite
   * @param {*} x the x coordinate. measured in tiles.
   * @param {*} y the y coordinate. measured in tiles.
   */
  animate(img, x, y) {
    // sets animation speed
    this.updateSpeed();
    // img.animationSpeed = (0.1 * this.dataManager.get("wind-speed")) / 40;
    img.onFrameChange = () => {
      //every small WT texture on the map changes to the next frame when the animated sprite does
      this.renderWindturbineArrays(
        this.wtAnimation.smallWindturbines,
        this.animatedTextures.wt_small_texture.textures
      );
      //every big WT texture on the map changes to the next frame when the animated sprite does
      this.renderWindturbineArrays(
        this.wtAnimation.bigWindturbines,
        this.textures.wt_big_texture
      );
    };
    this.getTextureTile(x, y).visible = true;
  }

  renderRedBorderWindTurbineSmallTile(x, y) {
    const textureNumber = 1 + Math.round(this.randomizedTerrain[y][x] * 3);
    this.getTextureTile(x, y).texture =
      this.textures.marked_small_wt[`marked_small_wt${textureNumber}`];
    this.getTextureTile(x, y).visible = true;
  }

  renderWindTurbineBigTile(x, y) {
    this.animate(this.animatedSprite, x, y);
  }

  renderRedBorderWindTurbineBigTile(x, y) {
    const textureNumber = 1 + Math.round(this.randomizedTerrain[y][x] * 3);
    this.getTextureTile(x, y).texture =
      this.textures.marked_big_wt[`marked_big_wt${textureNumber}`];
    this.getTextureTile(x, y).visible = true;
  }

  renderRoadTile(i, j) {
    const connMask = [
      [i, j - 1],
      [i + 1, j],
      [i, j + 1],
      [i - 1, j],
    ]
      .map(([x, y]) =>
        !this.city.map.isValidCoords(x, y) ||
        this.city.map.get(x, y) === this.roadTileId
          ? "1"
          : "0"
      )
      .join("");
    this.getTextureTile(i, j).texture =
      this.textures[this.roadTextureKey][
        `${this.roadTexturePrefix}${connMask}`
      ];
    this.getTextureTile(i, j).visible = true;
  }

  renderBasicTile(i, j) {
    const tileType = this.config.tileTypes[this.city.map.get(i, j)] || null;
    if (this.basicTileRenderers[tileType.type]) {
      this.basicTileRenderers[tileType.type](i, j);
    } else {
      this.getBgTile(i, j)
        .clear()
        .beginFill(tileType ? Number(`0x${tileType.color.substr(1)}`) : 0, 1)
        .drawRect(0, 0, MapView.TILE_SIZE, MapView.TILE_SIZE)
        .endFill();
    }
    this.getTextureTile(i, j).visible = false;
  }

  renderGrid(strokeWidth) {
    const viewWidth = this.city.map.width * MapView.TILE_SIZE;
    const viewHeight = this.city.map.height * MapView.TILE_SIZE;
    this.gridOverlay.clear();
    this.gridOverlay
      .lineStyle(strokeWidth / 2, 0, 1, 1)
      .moveTo(strokeWidth / 2, viewHeight - strokeWidth / 2)
      .lineTo(strokeWidth / 2, strokeWidth / 2)
      .lineTo(viewWidth - strokeWidth / 2, strokeWidth / 2)
      .lineTo(viewWidth - strokeWidth / 2, viewHeight - strokeWidth / 2)
      .lineTo(strokeWidth / 2, viewHeight - strokeWidth / 2)
      .lineTo(strokeWidth / 2, viewHeight - strokeWidth);

    this.gridOverlay.lineStyle(strokeWidth, 0, 1);
    for (let i = 1; i < this.city.map.width; i += 1) {
      this.gridOverlay
        .moveTo(i * MapView.TILE_SIZE, strokeWidth / 2)
        .lineTo(i * MapView.TILE_SIZE, viewHeight - strokeWidth / 2);
    }
    for (let i = 1; i < this.city.map.height; i += 1) {
      this.gridOverlay
        .moveTo(strokeWidth / 2, i * MapView.TILE_SIZE)
        .lineTo(viewWidth - strokeWidth / 2, i * MapView.TILE_SIZE);
    }
  }

  handleCityUpdate(updates) {
    updates.forEach(([i, j]) => {
      this.renderTile(i, j);
      // Todo: This should be optimized so it's not called twice per frame for the same tile.
      this.city.map
        .adjacentCells(i, j)
        .filter(([x, y]) => this.city.map.get(x, y) === this.roadTileId)
        .forEach(([x, y]) => this.renderRoadTile(x, y));
    });
    this.updateRedBorders();
  }
  // updates the exclamation marks according to the locationsGoalError 2DArray
  // which is defined in the wind-turbines-data_WT.js
  // everytime a new tile is set
  updateRedBorders() {
    this.city.map.allCells().forEach(([x, y]) => {
      if (this.city.map.cells[y][x] == 5) {
        if (1 == this.dataManager.sources[3].locationsGoalsError[y][x]) {
          this.wtAnimation.deleteFromArray(
            x,
            y,
            this.wtAnimation.bigWindturbines
          );
          this.renderRedBorderWindTurbineBigTile(x, y);
        } else {
          this.renderWindTurbineBigTile(x, y);
          {
            this.wtAnimation.storeCoordinate(
              x,
              y,
              this.wtAnimation.bigWindturbines
            );
          }
        }
      }
      if (this.city.map.cells[y][x] == 4) {
        if (1 == this.dataManager.sources[3].locationsGoalsError[y][x]) {
          this.wtAnimation.deleteFromArray(
            x,
            y,
            this.wtAnimation.smallWindturbines
          );
          this.renderRedBorderWindTurbineSmallTile(x, y);
        } else {
          this.renderWindTurbineSmallTile(x, y);
          {
            this.wtAnimation.storeCoordinate(
              x,
              y,
              this.wtAnimation.smallWindturbines
            );
          }
        }
      }
    });
  }

  showGrid() {
    this.gridOverlay.visible = true;
  }

  hideGrid() {
    this.gridOverlay.visible = false;
  }
}

MapView.TILE_SIZE = 72;

module.exports = MapView;
