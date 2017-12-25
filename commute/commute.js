var url = 'https://api.naponline.net/commute'
var graphs = {
  "towork": '{"origin": "611 Himes Avenue, Frederick, MD 21703", "destination": "1300 17th Street N., Arlington, VA 22209"}',
  "tohome": '{"destination": "611 Himes Avenue, Frederick, MD 21703", "origin": "1300 17th Street N., Arlington, VA 22209"}'
}
$.each(graphs, function(key, value) {
  $(function() {
    var latestTime = null
    var latestCommute = null
    var subtitle = null
    var commuteData = null
    $.post(url, value, function(data, textStatus) {
      latestTime = new Date(data.series[0].data[data.series[0].data.length-1][0]);
      latestCommute = data.series[0].data[data.series[0].data.length-1][1];
      subtitle = latestCommute + ' minutes @ ' + latestTime;
      commuteData = data;
    }, "json");
    Highcharts.setOptions({
        global: {
            useUTC: false,
            timezone: "US/Eastern"
        }
    });
    // $('#towork').highcharts({
    Highcharts.stockChart(key, {
      chart: {
        zoomType: 'x'
      },
      title: {
        text: 'Commute to Work in Traffic'
      },
      subtitle: {
        text: subtitle
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
      series: [{
        type: 'area',
        name: 'Home to Work',
        data: commuteData.series[0].data
      }]
    });
  });
});
