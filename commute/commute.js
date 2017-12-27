$(function() {
  var startTime = new Date();
  var url = 'https://api.naponline.net/commute'
  var refresh = 3  // in minutes
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
      // latest commute
      var latestCommute = json.series[0].data[json.series[0].data.length-1][1];
      $(value.divCurrentId).html('{ ' + latestCommute + 'm ' + value.divCurrentSuffix + ' }')
      series = json.series

      Highcharts.setOptions({
          global: {
              useUTC: false,
              timezone: "US/Eastern"
          }
      });

      Highcharts.stockChart(graph, {
        chart: {
          events: {
            load: function () {
              var series = this.series[0];
              setInterval(function () {
                  $.post(url, value.json, function(json) {
                    // start time
                    var startTime = new Date();
                    // latest data
                    series.setData(json.series[0].data, true);
                    // count
                    $(value.divStatsId).html(json.stats.min + '/' + json.stats.max + '/' + json.stats.avg + 'm, #' + json.stats.count);
                    // latest commute
                    var latestCommute = json.series[0].data[json.series[0].data.length-1][1];
                    $(value.divCurrentId).html('{ ' + latestCommute + 'm ' + value.divCurrentSuffix + ' }')
                    // end time
                    var endTime = new Date();
                    var diffTime = (endTime - startTime) / 1000;
                    $('#ajaxLoad').html(diffTime + 's');
                  }, "json");
              }, refresh * 60000.0);
            }
          }
        },
        title: {
          text: value.title
        },
        xAxis: {
          type: 'datetime'
        },
        yAxis: {
          title: {
            text: 'Minutes'
          },
          plotLines: [{
              value: 60,
              color: 'red',
              dashStyle: 'shortdash',
              width: 3
          }]
        },
        legend: {
          enabled: false
        },
        rangeSelector: {
          buttons: [{
              type: 'hour',
              count: 12,
              text: '12H'
          }, {
              type: 'day',
              count: 1,
              text: '1D'
          }, {
              type: 'day',
              count: 3,
              text: '3D'
          }, {
              type: 'day',
              count: 7,
              text: '7D'
          }, {
              type: 'month',
              count: 1,
              text: '1M'
          }, {
              type: 'month',
              count: 3,
              text: '3M'
          }, {
              type: 'all',
              count: 1,
              text: 'All'
          }],
          inputEnabled: true,
          selected: 1
        },
        plotOptions: {
          area: {
            fillColor: {
              linearGradient: {
                x1: 0,
                y1: 0,
                x2: 0,
                y2: 1
              },
              stops: [
                [0, Highcharts.getOptions().colors[0]],
                [1, Highcharts.Color(Highcharts.getOptions().colors[0]).setOpacity(0).get('rgba')]
              ]
            },
            marker: {
              radius: 2
            },
            lineWidth: 1,
            states: {
              hover: {
                lineWidth: 1
              }
            },
            threshold: null
          }
        },
        series: series
      });
      var endTime = new Date();
      var diffTime = (endTime - startTime) / 1000;
      $('#ajaxLoad').html(diffTime + 's');
    }, "json");
  });
});
