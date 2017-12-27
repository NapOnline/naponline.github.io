$(function() {
  var startTime = new Date();
  var url = 'https://api.naponline.net/commute/stats'
  var graphs = {
    "towork": {
      "json": { "name": "Home to Work",
                "type": "area",
                "id": "Brad-HomeToWork"
              },
      "title": "Commute to Work in Traffic",
      "divStatsId": "#workStats",
      "divCurrentId": "#toworkCurrent",
      "divCurrentSuffix": "to work"
    },
    "tohome": {
      "json": { "name": "Work to Home",
                "type": "area",
                "id": "Brad-WorkToHome"
              },
      "title": "Commute Home in Traffic",
      "divStatsId": "#homeStats",
      "divCurrentId": "#tohomeCurrent",
      "divCurrentSuffix": "to home"
    }
  }
  $.each(graphs, function(graph, value) {
    $.post(url, value.json, function(json) {
      // count
      $(value.divStatsId).html(json.stats.min + '/' + json.stats.max + '/' + json.stats.avg + 'm, #' + json.stats.count);
    }, "json");
  });
});
