$(function() {
  var url = 'https://api.naponline.net/commute'
  var refresh = 2.5  // in minutes
  var graphs = {
    "towork": {
      "json": '{"name": "Home to Work", "type": "area", "origin": "611 Himes Avenue, Frederick, MD 21703", "destination": "1300 17th Street N., Arlington, VA 22209"}',
      "title": "Commute to Work in Traffic",
      "divCurrent": "#toworkCurrent",
      "divCurrentSuffix": "to work"
    },
    "tohome": {
      "json": '{"name": "Work to Home", "type": "area", "destination": "611 Himes Avenue, Frederick, MD 21703", "origin": "1300 17th Street N., Arlington, VA 22209"}',
      "title": "Commute Home in Traffic",
      "divCurrent": "#tohomeCurrent",
      "divCurrentSuffix": "to home"
    }
  }
  $.each(graphs, function(graph, value) {
    $.post(url, value.json, function(json, textStatus) {
      // var latestTime = new Date(json.series[0].data[json.series[0].data.length-1][0]);
      // $('#timestamp').html('updated @ ' + latestTime.toString().toLowerCase());
      var latestCommute = json.series[0].data[json.series[0].data.length-1][1];
      $(value.divCurrent).html('{ ' + latestCommute + 'm ' + value.divCurrentSuffix + ' }')
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
                    series.setData(json.series[0].data, true);
                    var latestCommute = data.series[0].data[data.series[0].data.length-1][1];
                    $(value.divCurrent).html(latestCommute + 'm')
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
    }, "json");
  });
});
