Epidemic = (function () {

    var _MS_PER_DAY = 1000 * 60 * 60 * 24;

    // a and b are javascript Date objects
    function dateDiffInDays(a, b) {
        // Discard the time and time-zone information.
        var utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
        var utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

        return Math.floor((utc2 - utc1) / _MS_PER_DAY);
    }

    Date.prototype.addDays = function(days)
    {
        var dat = new Date(this.valueOf());
        dat.setDate(dat.getDate() + days);
        return dat;
    }


    // Various formatters.
    var formatNumber = d3.format(",d"),
        formatDate = d3.time.format("%Y-%m-%d"),
        formatPrettyDate = d3.time.format("%d %b"),
        formatMonth = d3.time.format("%b %Y");

    var epidemic = {};

    var margin = {top: 20, right: 80, bottom: 30, left: 40},
        width = 960 - margin.left - margin.right,
        height = 1200 - margin.top - margin.bottom;

    var x = d3.scale.linear()
        .range([0, width]);

    var y = d3.scale.linear()
        .range([height, 0]);

    var scheme = colorbrewer.Spectral[9];

    var xAxis = d3.svg.axis()
        .scale(x)
        .orient("bottom");

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left");

    var svg = d3.select("body").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom);

    var gradient = svg.append("defs")
        .append("linearGradient")
        .attr("id", "fade")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "0%");

    gradient.append("stop")
        .attr("offset", "20%")
        .attr("stop-color", "#000")
        .attr("stop-opacity", "5");

    gradient.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", "#FFF")
        .attr("stop-opacity", "0");

    svg = svg
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    queue()
        .defer(d3.json, "data/cities.json")
        .defer(d3.csv, "data/cases.csv")
        .await(ready);

    function ready(error, cityData, caseData) {
        if (error) return console.log("there was an error loading the data: " + error);

        var cases = [];
        var clusters = {};
        var locations = [];

        var nestByDate = d3.nest()
            .key(function (d) {
                return d3.time.month(d.date);
            });

        // A little coercion, since the CSV is untyped.
        caseData.forEach(function (d, i) {
            d.index = i;

            if (d.onset !== null) {
                d.onset = formatDate.parse(d.onset);
            }

            if (d.hospitalized !== null) {
                d.hospitalized = formatDate.parse(d.hospitalized);
            }

            if (d.reported !== null) {
                d.reported = formatDate.parse(d.reported);
            }

            if (d.death !== null) {
                d.death = formatDate.parse(d.death);
                if (d.death !== null || d.outcome === 'fatal') {
                    d.outcome = 2;
                } else {
                    d.outcome = 1;
                }
            } else if (d.outcome === 'fatal') {
                d.outcome = 2;
            } else {
                d.outcome = 1;
            }

            d.date = d.onset;
            d.dateType = "onset";

            if (d.date === null) {
                d.date = d.hospitalized;
                d.dateType = "hospitalized";
            }
            if (d.date === null) {
                d.date = d.death;
                d.dateType = "death";

                if (d.date === null || d.reported < d.date) {
                    d.date = d.reported;
                    d.dateType = "reported";
                }
            }

            // convert age to number (with be NaN if parsing fails).
            d.age = +d.age;
            if (d.age === null || isNaN(d.age)) {
                d.age = -100;
            }

            if (d.gender === 'F') {
                d.genderCode = 1;
            } else if (d.gender === 'M') {
                d.genderCode = 2;
            } else {
                d.genderCode = 3;
            }

            if (d.date !== null) {
                cases.push(d);
            }

            if ((d.cluster !== null && d.cluster.length > 0) || d.secondary === "TRUE") {
                if (d.cluster === undefined || d.cluster === null || d.cluster.length === 0) {
                    // if there is no cluster defined but is a secondary
                    // create a new cluster label based on the number
                    d.cluster = "#" + d.number;
                }

                if (d.cluster in clusters) {
                    clusters[d.cluster].count++;
                } else {
                    clusters[d.cluster] = {
                        name: d.cluster,
                        count: 1
                    };
                }
                d.cluster = clusters[d.cluster];
            } else {
                d.cluster = null;
            }

            d.comorbidity = (d.comorbidity === "TRUE" ? "existing" : (d.comorbidity === "FALSE" ? "none" : "unknown"));

            if (!(d.clinical === undefined)) {
                var clin = (d.clinical.split(" ")[0]);
                d.clinical = (clin === "clinical" || clin === "fatal" ? "severe/clinical" : (clin === "subclinical" ? "mild/subclinical" : "unknown"));
            }

            d.contact = (d.secondary === "TRUE" ? d.contact : "primary");
            d.contact = (d.contact === "contact" ? "unspecified contact" : d.contact);

            d.status = (d.suspected === "TRUE" ? "suspected" : "confirmed");

            var found = false;

            if (d.city.length > 0) {
                cityData.forEach(function (city) {
                    if (d.city === city.name) {
                        d['city'] = city;
                        locations.push(city.name);
                        found = true;
                    }
                });
                if (!found) console.log("City not found: " + d.city);
            }
            if (!found) d.city = null;

            found = false;

            // console.log(d.code + ": " + d.age + ", " + d.gender + ", " + d.country + " [" + d.dateType + "], " + d.secondary + ", " + d.cluster);
        });

        cases.sort(function (a, b) {
            return a.date.getTime() - b.date.getTime()
        });

        var lastDate = null;
        var lastOnset = null;

        cases.forEach(function (d, i) {
            if (lastDate !== null) {
                d.waitingTime = dateDiffInDays(lastDate, d.date);
            }
            lastDate = d.date;
            if (d.dateType === "onset" || d.dateType === "hospitalized") {
                if (lastOnset !== null) {
                    d.waitingTimeOnset = dateDiffInDays(lastOnset, d.date);
                }
                lastOnset = d.date;
            }

            if (d.cluster !== null && d.cluster.count === 1) {
                d.cluster.count = 2;
            }
            //console.log(d.code + ": " + d.age + ", " + d.gender + ", " + d.country + " [" + d.dateType + "], "  + formatDate(d.date) + ", " + d.waitingTime + ", " + d.waitingTimeOnset );
        });

        var parseDate = d3.time.format("%d-%b-%y").parse;

        var start_date = new Date("2012-01-01"),
            end_date = new Date("2014-01-01");

        x.domain([start_date, end_date]).nice();
        y.domain(d3.extent(cases, function (d, i) {
            return i;
        })).nice();

        var color = d3.scale.linear()
            .domain(locations)
            .range(scheme)
            .interpolate(d3.interpolateLab);

        // a DIV to act as tooltip
        var div = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")")
            .call(xAxis)
            .append("text")
            .attr("class", "label")
            .attr("x", width)
            .attr("y", -6)
            .style("text-anchor", "end")
            .text("Date");

        svg.append("g")
            .attr("class", "y axis")
            .call(yAxis)
            .append("text")
            .attr("class", "label")
            .attr("transform", "rotate(-90)")
            .attr("y", 6)
            .attr("dy", ".71em")
            .style("text-anchor", "end")
            .text("Location")

        svg.append("g")
            .selectAll(".line")
            .data(cases)
            .enter().append("rect")
            .attr("class", "line")
            .attr("style", function (d) {
                return (d.death ? "" : "fill:url(#fade)");
            })
            .attr("x", function (d) {
                return x(d.date);
            })
            .attr("width", function (d) {
                return x(d.death || d.date.addDays(40)) - x(d.date);
            })
            .attr("y", function (d, i) {
                return y(i);
            })
            .attr("height", function (d, i) {
                return 1;
            });

        svg.append("g")
            .selectAll(".case")
            .data(cases)
            .enter().append("circle")
            .attr("class", "death")
            .attr("r", 2.5)
            .attr("cx", function (d) {
                return x(d.death);
            })
            .attr("cy", function (d, i) {
                return y(i);
            });

        svg.append("g")
            .selectAll(".case")
            .data(cases)
            .enter().append("circle")
            .attr("class", "case")
            .attr("r", 2.5)
            .attr("cx", function (d) {
                return x(d.date);
            })
            .attr("cy", function (d, i) {
                return y(i);
            })
            .style("fill", function (d) {
                return color(d.city);
            })
            .on("mouseover", function (d) {
                div.transition()
                    .duration(200)
                    .style("opacity", .9);
                div.html("<p>" + d.name + "</p>" +
                    "<p>Date: " + d.year + "</p>" +
                    "<p>AG coords: " + d.ag1 + ", " + d.ag2 + "</p>");
            })
            .on("mouseout", function (d) {
                div.transition()
                    .duration(500)
                    .style("opacity", 0);
            });

//        svg.append("g")
//            .selectAll(".virus")
//            .data(viruses)
//            .enter().append("text")
//            .attr("class", "virus-label")
//            .attr("x", function (d) {
//                return x(d.ag1) + 6;
//            })
//            .attr("y", function (d) {
//                return y(d.ag2) - 6;
//            })
//            .attr("dy", ".35em")
//            .style("text-anchor", "beginning")
//            .text(function (d) {
//                return d.name;
//            });

//        var legend = svg.selectAll(".legend")
//            .data(color.domain())
//            .enter().append("g")
//            .attr("class", "legend")
//            .attr("transform", function (d, i) {
//                return "translate(0," + i * 20 + ")";
//            });
//
//        legend.append("rect")
//            .attr("x", width - 18)
//            .attr("width", 18)
//            .attr("height", 18)
//            .style("fill", color);
//
//        legend.append("text")
////            .attr("x", width - 24)
//            .attr("x", width + 4)
//            .attr("y", 9)
//            .attr("dy", ".35em")
////            .style("text-anchor", "end")
//            .style("text-anchor", "beginning")
//            .text(function (d) {
//                return d;
//            });


    };

    return epidemic;
});
