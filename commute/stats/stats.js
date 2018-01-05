$(function() {
  var startTime = new Date();
  var url = 'https://api.naponline.net/commute/stats'
  var graphs = {
    "towork": {
      "json": { "name": "Home to Work",
                "type": "column",
                "id": "Brad-HomeToWork",
                "fields": "month,harmonic_mean"
              },
      "title": "Commute to Work in Traffic",
      "divStatsId": "#workStats",
      "divCurrentId": "#toworkCurrent",
      "divCurrentSuffix": "to work"
    },
    "tohome": {
      "json": { "name": "Work to Home",
                "type": "column",
                "id": "Brad-WorkToHome",
                "fields": "month,harmonic_mean"
              },
      "title": "Commute Home in Traffic",
      "divStatsId": "#homeStats",
      "divCurrentId": "#tohomeCurrent",
      "divCurrentSuffix": "to home"
    }
  }
  $.each(graphs, function(graph, value) {
    $.post(url, value.json, function(json) {
      $(value.divStatsId).html(JSON.stringify(json));
      Highcharts.setOptions({
          global: {
              useUTC: false,
              timezone: "US/Eastern"
          }
      });
      Highcharts.chart(graph, {
        chart: {
          type: "column",
          polar: false,
          inverted: false
        },
        plotOptions: {
          series: {
            stacking: "normal",
            animation: false,
            dataLabels: {
              enabled: false
            }
          }
        },
        title: {
          text: "OS Usage Stats"
        },
        subtitle: {
          text: ""
        },
        exporting: {},
        series: json.series,
        legend: {},
        tooltip: {"shared":false},
        lang: {},
        credits: {
          enabled: true
        }
      });
    }, "json");
  });
});
