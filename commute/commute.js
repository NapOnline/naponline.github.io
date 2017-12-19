$(function() {
  var url = 'https://api.naponline.net/commute'
  $.getJSON(url, function(data) {
    var latestTime = new Date(data.series[0].data[data.series[0].data.length-1][0]);
    var latestCommute = data.series[0].data[data.series[0].data.length-1][1]
    var subtitle = latestCommute + ' minutes @ ' + latestTime
    Highcharts.setOptions({
        global: {
            useUTC: false
            timezone: "US/Eastern"
        }
    });
    $('#towork').highcharts({
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
        data: data.series[0].data
      }]
    });
  });
});

// $(function() {
//   var url = 'https://api.naponline.net/commute'
//   $.getJSON(url, function(data) {
//     var latestTime = new Date(data.series[0].data[data.series[0].data.length-1][0]);
//     var latestCommute = data.series[0].data[data.series[0].data.length-1][1]
//     var subtitle = latestCommute + ' minutes @ ' + latestTime
//     Highcharts.setOptions({
//         global: {
//             useUTC: false
//         }
//     });
//     $('#tohome').highcharts({
//       chart: {
//         zoomType: 'x'
//       },
//       title: {
//         text: 'Commute Home in Traffic'
//       },
//       subtitle: {
//         text: subtitle
//       },
//       xAxis: {
//         type: 'datetime'
//       },
//       yAxis: {
//         title: {
//           text: 'Minutes'
//         },
//         plotLines: [{
//             value: 60,
//             color: 'red',
//             dashStyle: 'shortdash',
//             width: 3
//         }]
//       },
//       legend: {
//         enabled: false
//       },
//       plotOptions: {
//         area: {
//           fillColor: {
//             linearGradient: {
//               x1: 0,
//               y1: 0,
//               x2: 0,
//               y2: 1
//             },
//             stops: [
//               [0, Highcharts.getOptions().colors[0]],
//               [1, Highcharts.Color(Highcharts.getOptions().colors[0]).setOpacity(0).get('rgba')]
//             ]
//           },
//           marker: {
//             radius: 2
//           },
//           lineWidth: 1,
//           states: {
//             hover: {
//               lineWidth: 1
//             }
//           },
//           threshold: null
//         }
//       },
//       series: [{
//         type: 'area',
//         name: 'Work to Home',
//         data: data.series[0].data
//       }]
//     });
//   });
// });
