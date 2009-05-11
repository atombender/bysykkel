var State = Class.create({
  initialize: function(point, zoom) {
    this.point = point;
    this.zoom = zoom;
  },

  setCookie: function() {
    if (this.point && this.zoom) {
      document.cookie = "location=" + this.point.x + "," + this.point.y + "," + this.zoom +
        "; expires=Fri, 01 Jan 2038 00:00:00 +0100";
    }
  },

  getFromCookie: function() {
    var prefix = "location=";
    var ca = document.cookie.split(';');
    var value = null;
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == ' ') {
        c = c.substring(1, c.length);
      }
      if (c.indexOf(prefix) == 0) {
        value = c.substring(prefix.length, c.length);
        break;
      }
    }
    if (value) {
      var parts = value.split(",");
      this.point = new GLatLng(parseFloat(parts[1]), parseFloat(parts[0]));
      this.zoom = parseInt(parts[2]);
    }
  }
});

var Station = Class.create({
  initialize: function(stationId, point) {
    this.id = stationId;
    this.point = point;
    this.emptyCount = 0;
    this.readyCount = 0;
    this.online = true;
    this.description = ''; 
    this.updatedAt = null;
  },

  createMarker: function() {
    var icon = new GIcon();
    var color;
    if (!this.online) {
      color = "blue";
    } else if (this.emptyCount == 0) {
      color = "yellow";
    } else if (this.online == false || this.readyCount == 0) {
      color = "red";
    } else {
      color = "green"
    }
    icon.image = "markers/" + color + "-" + this.id + "-m.png";
    icon.shadow = "markers/shadow.png";
    icon.iconSize = new GSize(21,31);
    icon.shadowSize = new GSize(21, 31);
    icon.iconAnchor = new GPoint(10, 31);
    icon.infoWindowAnchor = new GPoint(11, 31);
    icon.infoShadowAnchor = new GPoint(18, 25);
    this.marker = new GMarker(this.point, {icon: icon});
    GEvent.addListener(this.marker, "click", function() {
      html = "<div class='info'>";
      html += "<h4>" + this.description + "</h4>";
      if (this.online) {
        html += "<strong>" + this.readyCount + "</strong> sykler / ";
        html += "<strong>" + this.emptyCount + "</strong> ledige plasser";
        if (this.updatedAt) {
          html += " (sist oppdatert ";  
          if (this.updatedAt.getDate() != new Date().getDate() ||
            this.updatedAt.getMonth() != new Date().getMonth() ||
            this.updatedAt.getYear() != new Date().getYear()) {
            html += this.updatedAt.getDate() + "/" + (this.updatedAt.getMonth() + 1);
            html += " ";
          }
          html += "kl. " +
            this.zeroPad(this.updatedAt.getHours(), 2) + ":" +
            this.zeroPad(this.updatedAt.getMinutes(), 2);
          html += ")"
        }
        html += "<div class='info_bikes'>";
        for (var i = 0; i < this.readyCount; i++) {
          html += "<img src='bike_on.png'/>";
        }
        for (var i = 0; i < this.emptyCount; i++) {
          html += "<img src='bike_off.png'/>";
        }
        html += "</div>";
      } else {
        html += "Ute av drift";
      }
      if (this.graphUrl) {
        html += "<div class='info_graph'>";
        html += "<div class='info_graph_label'>% tilgjengelige sykler over tid</div>";
        html += "<img src='" + this.graphUrl + "'/>";
        html += "</div>";
      }
      html += "</div>";
      this.marker.openInfoWindowHtml(html);
    }.bind(this));
    return this.marker;
  },

  zeroPad: function(n, count) {
    var v = n.toString();
    while (v.length < count) {
      v = "0" + v;
    }
    return v;
  }
});

var Controller = Class.create({
  initialize: function() {
    this.stations = [];
  },

  resizeMap: function() {
    var element = $("map");
    element.style.height = (window.innerHeight - element.cumulativeOffset()[1]) + "px";
  },

  loadMap: function() {
    if (GBrowserIsCompatible()) {
      var state = new State(new GLatLng(59.92797, 10.70961), 13);
      state.getFromCookie();

      this.map = new GMap2($("map"));
      this.map.setCenter(state.point, state.zoom);
      this.map.setMapType(G_HYBRID_MAP);
      this.map.addControl(new GSmallMapControl());
      this.map.addControl(new GMapTypeControl());

      GEvent.addListener(this.map, "move", function() {
        state.point = this.map.getCenter();
        state.zoom = this.map.getZoom();
        state.setCookie();
      }.bind(this));

      for (var i = 0; i < this.stations.length; i++) {
        var station = this.stations[i];
        this.map.addOverlay(station.createMarker());
      }

      // Resize map to fit window
      if (window.addEventListener) {
        window.addEventListener("resize", this.resizeMap, false);
      } else {
        window.attachEvent("onResize", this.resizeMap);
      }
      this.resizeMap();

      this.refresh();   
      window.setInterval(this.refresh.bind(this), 60 * 1000);
    }
  },

  refresh: function() {
    var request = new Ajax.Request("stations.json", {
      evalScripts: false,
      onFailure: function(transport) {
        alert("Kunne ikke laste: " + transport.statusText);
      }.bind(this),
      onLoading: function() {
        $$("body")[0].addClassName("progressing");
      }.bind(this),
      onSuccess: function(transport, object) {
        var json = this.evaluateJson(transport);
        if (json) {
          for (var j = 0; j < json.length; j++) {
            var descriptor = json[j];
            var station = null;
            for (var i = 0; i < this.stations.length; i++) {
              if (this.stations[i].id == descriptor.id) {
                station = this.stations[i];
                break;
              }
            }
            if (!station) {
              station = new Station(descriptor.id,
                new GLatLng(descriptor.latitude, descriptor.longitude));
              this.stations.push(station);
            }
            if (station) {
              if (descriptor.updatedAt) {
                station.updatedAt = new Date(descriptor.updatedAt);
              }
              if (station.emptyCount != descriptor.emptyCount ||
                station.readyCount != descriptor.readyCount ||
                station.online != descriptor.online ||
                station.description != descriptor.description ||
                station.graphUrl != descriptor.graphUrl) {
                station.emptyCount = descriptor.emptyCount;
                station.readyCount = descriptor.readyCount;
                station.online = descriptor.online;
                station.description = descriptor.description;
                station.graphUrl = descriptor.graphUrl;
                if (station.marker) {
                  this.map.removeOverlay(station.marker);
                }
                this.map.addOverlay(station.createMarker());
              }
            }
          }
        }
      }.bind(this),
      onComplete: function() {
        $$("body")[0].removeClassName("progressing");
      }.bind(this),
      onException: function(request, exception) {
        alert(exception);
      }.bind(this)
    });
  },

  evaluateJson: function(transport) {
    var json = null;
    var text = transport.responseText;
    if (text && text.toString().strip().length > 0) {
      try {
        json = eval("(" + text + ")");
      } catch (e) {
        consone.log("Error parsing JSON: " + e);
      }
    }
    return json;
  }
});
